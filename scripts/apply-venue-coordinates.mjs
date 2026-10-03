// Default dry-run. Writes only reviewed coordinates missing in the cached snapshot.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { snapshotVenues, inVietnam, placeCoordinates } from './lib/venue-coordinates.mjs';
const folder = 'data_export/coordinates';
const snapshot = JSON.parse(fs.readFileSync(`${folder}/firestore-snapshot.json`, 'utf8'));
const existing = new Map(snapshotVenues(snapshot).map(v => [v.id, v]));
const manifest = JSON.parse(fs.readFileSync('src/data/venue-coordinates.json', 'utf8'));
if (manifest.snapshotAt !== snapshot.retrievedAt || !manifest.reviewedAt) throw new Error('Reviewed manifest must reference this exact snapshot.');
const ids = new Set();
for (const row of manifest.venues) {
  const before = existing.get(row.id), pin = placeCoordinates(row.source.url);
  if (!before || ids.has(row.id) || inVietnam(before.lat, before.lng)) throw new Error(`Not a unique missing venue: ${row.id}`);
  if (before.name !== row.name || before.address !== row.address) throw new Error(`Identity changed: ${row.id}`);
  if (!pin || pin.lat !== row.lat || pin.lng !== row.lng || !row.source.name || !row.source.checkedAt || !row.reviewNote) throw new Error(`Incomplete coordinate evidence: ${row.id}`);
  ids.add(row.id);
}
console.log(JSON.stringify({ project: snapshot.projectId, reviewedUpdates: ids.size, additionalReads: 0, mode: 'dry-run unless --apply-local/--apply-firestore supplied' }));
if (process.argv.includes('--apply-local')) {
  const file = 'src/data/venues.json';
  const backup = `${folder}/local-before.json`;
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup, fs.constants.COPYFILE_EXCL);
  const local = JSON.parse(fs.readFileSync(file, 'utf8'));
  const updates = new Map(manifest.venues.map(row => [row.id, row]));
  let imported = 0;
  for (const venue of local) {
    const row = updates.get(venue.id), prior = existing.get(venue.id);
    if (venue.name !== prior?.name || venue.address !== prior?.address || inVietnam(venue.lat, venue.lng)) continue;
    if (row) {
      Object.assign(venue, { lat: row.lat, lng: row.lng, coordinate_source: row.source, coordinate_checked_at: row.source.checkedAt });
      imported++;
    } else if (inVietnam(prior.lat, prior.lng)) {
      // Retain the existing production coordinates in the offline catalogue too.
      Object.assign(venue, { lat: prior.lat, lng: prior.lng });
      imported++;
    }
  }
  fs.writeFileSync(file, JSON.stringify(local, null, 2) + '\n');
  console.log(`Local coordinates added: ${imported}; previous catalogue backed up.`);
}
if (process.argv.includes('--apply-firestore')) {
  const project = process.argv.find(a => a.startsWith('--project='))?.slice(10);
  const keyFile = process.argv.find(a => a.startsWith('--credentials='))?.slice(14);
  if (project !== snapshot.projectId || !keyFile || process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Explicit matching project/credentials required, emulator must be unset.');
  const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
  if (key.project_id !== project) throw new Error('Credentials belong to another project.');
  const require = createRequire(new URL('../functions/package.json', import.meta.url));
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getFirestore, Timestamp } = require('firebase-admin/firestore');
  const db = getFirestore(initializeApp({ projectId: project, credential: cert(key) }));
  const journal = `${folder}/firestore-applied.jsonl`;
  const applied = fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
  const done = new Set(applied.filter(row => row.status === 'applied' && row.snapshotAt === snapshot.retrievedAt).map(row => row.id));
  let count = 0, conflicts = 0;
  try {
    for (const row of manifest.venues.filter(v => !done.has(v.id))) {
      const before = existing.get(row.id);
      const [whole, fraction = '0'] = before.updateTime.replace(/Z$/, '').split('.');
      const lastUpdateTime = new Timestamp(Math.floor(Date.parse(`${whole}Z`) / 1000), Number(fraction.padEnd(9, '0')));
      try {
        const result = await db.collection('Facilities').doc(row.id).update({
          lat: row.lat, lng: row.lng, coordinate_source: row.source, coordinate_checked_at: row.source.checkedAt,
        }, { lastUpdateTime });
        fs.appendFileSync(journal, JSON.stringify({ id: row.id, status: 'applied', snapshotAt: snapshot.retrievedAt, updateTime: result.writeTime.toDate().toISOString(), lat: row.lat, lng: row.lng }) + '\n');
        count++;
      } catch (error) {
        if ([5, 9].includes(error.code)) {
          fs.appendFileSync(journal, JSON.stringify({ id: row.id, status: 'skipped_concurrent_change', snapshotAt: snapshot.retrievedAt }) + '\n');
          conflicts++;
        } else throw new Error(`Write stopped (${error.code}); progress saved, no automatic rescan.`);
      }
    }
  } finally { await db.terminate(); }
  console.log(JSON.stringify({ applied: count, alreadyApplied: done.size, concurrentChangesSkipped: conflicts, additionalReads: 0 }));
}
