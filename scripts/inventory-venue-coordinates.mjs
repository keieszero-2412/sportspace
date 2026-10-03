// One explicit snapshot, then offline inventory. No automatic cache refresh.
import fs from 'node:fs';
import { snapshotVenues, inVietnam } from './lib/venue-coordinates.mjs';
const folder = 'data_export/coordinates';
fs.mkdirSync(folder, { recursive: true });
const file = `${folder}/firestore-snapshot.json`;
if (!fs.existsSync(file)) {
  if (!process.argv.includes('--fetch-once')) throw new Error('No snapshot. Run with --fetch-once to authorize one collection read. Each returned document consumes a read even with field projection.');
  const projectId = 'sportspace-af6b4';
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: 'Facilities' }],
      select: { fields: ['facility_id', 'name', 'address', 'province', 'sport', 'source_url', 'lat', 'lng', 'coordinate_source', 'coordinate_checked_at'].map(fieldPath => ({ fieldPath })) },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    } }),
  });
  if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}; no automatic retry.`);
  const rows = await response.json();
  if (rows.some(row => row.error)) throw new Error('Snapshot returned an error; no cache saved.');
  fs.writeFileSync(file, JSON.stringify({ projectId, retrievedAt: new Date().toISOString(), documents: rows.filter(row => row.document).map(row => row.document) }, null, 2));
}
const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
const venues = snapshotVenues(snapshot);
const missing = venues.filter(v => !inVietnam(v.lat, v.lng));
fs.writeFileSync(`${folder}/missing-before.json`, JSON.stringify(missing, null, 2));
console.log(JSON.stringify({ snapshotAt: snapshot.retrievedAt, total: venues.length, existing: venues.length - missing.length, missing: missing.length, mode: 'offline inventory (snapshot reused)' }));
