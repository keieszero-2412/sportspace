// A reviewed manifest is required. Default is dry-run; each mutation is explicit.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { getVenuePhone } from '../src/services/venuePhone.js';
const folder = 'data_export/phone-crawl';
const manifest = JSON.parse(fs.readFileSync('src/data/venue-phone-sources.json', 'utf8'));
const snapshot = JSON.parse(fs.readFileSync(`${folder}/firestore-before.json`, 'utf8'));
const localFile = 'src/data/venues.json';
const venues = JSON.parse(fs.readFileSync(localFile, 'utf8'));
const sourceMap = new Map(manifest.venues.map(v => [v.id, v]));
if (sourceMap.size !== manifest.venues.length || !manifest.reviewedAt) throw new Error('Manifest must be reviewed and have unique venue IDs.');
const patches = venues.map(venue => {
  const reviewed = sourceMap.get(venue.id);
  if (reviewed && (reviewed.name !== venue.name || reviewed.address !== venue.address)) throw new Error(`Venue changed: ${venue.id}`);
  const patch = reviewed ? {
    phone: reviewed.phone, phone_status: 'sourced', phone_sources: reviewed.sources, phone_checked_at: manifest.reviewedAt,
  } : { phone: '', phone_status: 'unverified', phone_sources: [], phone_checked_at: manifest.reviewedAt };
  if (reviewed && !getVenuePhone(patch)) throw new Error(`Invalid source evidence: ${venue.id}`);
  return { id: venue.id, name: venue.name, address: venue.address, patch };
});
console.log(JSON.stringify({ mode: 'reviewed plan', total: patches.length, sourced: manifest.venues.length, unverified: patches.length - manifest.venues.length }));
if (process.argv.includes('--apply-local')) {
  const backup = `${folder}/local-before.json`;
  if (!fs.existsSync(backup)) fs.copyFileSync(localFile, backup, fs.constants.COPYFILE_EXCL);
  // Apply only the four hotline fields; keep all other catalogue data unchanged.
  const updates = new Map(patches.map(p => [p.id, p.patch]));
  fs.writeFileSync(localFile, JSON.stringify(venues.map(v => ({ ...v, ...updates.get(v.id) })), null, 2) + '\n');
  console.log('Local hotline fields updated; original data backed up.');
}
if (process.argv.includes('--apply-firestore')) {
  const project = process.argv.find(a => a.startsWith('--project='))?.split('=')[1];
  const credentials = process.argv.find(a => a.startsWith('--credentials='))?.slice('--credentials='.length);
  if (project !== snapshot.projectId || !credentials || process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Explicit matching project and credentials required; emulator must be unset.');
  const serviceAccount = JSON.parse(fs.readFileSync(credentials, 'utf8'));
  if (serviceAccount.project_id !== project) throw new Error('Credential project mismatch.');
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore, Timestamp } = require('firebase-admin/firestore');
  const app = initializeApp({ credential: cert(serviceAccount), projectId: project });
  const db = getFirestore(app);
  const originals = new Map(snapshot.documents.map(d => [d.name.split('/').at(-1), d]));
  const writes = patches.map(p => {
    const old = originals.get(p.id);
    if (!old || old.fields.name?.stringValue !== p.name || old.fields.address?.stringValue !== p.address || !old.updateTime) throw new Error(`Snapshot mismatch: ${p.id}`);
    // Preserve nanosecond precision for Firestore's optimistic concurrency guard.
    const [whole, fraction = '0'] = old.updateTime.replace(/Z$/, '').split('.');
    const lastUpdateTime = new Timestamp(Math.floor(Date.parse(`${whole}Z`) / 1000), Number(fraction.padEnd(9, '0')));
    return { ...p, lastUpdateTime };
  });
  const logFile = `${folder}/applied-${Date.now()}.jsonl`;
  fs.writeFileSync(logFile, '');
  for (let start = 0; start < writes.length; start += 100) {
    const batch = db.batch();
    const rows = writes.slice(start, start + 100);
    for (const p of rows) batch.update(db.collection('Facilities').doc(p.id), p.patch, { lastUpdateTime: p.lastUpdateTime });
    await batch.commit(); // Stops on concurrent changes; never silently overwrites them.
    fs.appendFileSync(logFile, rows.map(p => JSON.stringify({ id: p.id, patch: p.patch })).join('\n') + '\n');
    console.log(`Firestore hotline update: ${Math.min(start + 100, writes.length)}/${writes.length}`);
  }
  await db.terminate();
}
