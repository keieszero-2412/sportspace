// Offline research only: no Firebase, network, runtime imports or production writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalize } from '../lib/venue-coordinates.mjs';

export function extractRating(candidate) {
  // Accept only the score immediately following this place's name in Maps text.
  const lines = String(candidate.summary || '').split('\n').map(s => s.trim()).filter(Boolean);
  const at = lines.findIndex(s => normalize(s) === normalize(candidate.name));
  if (at < 0 || !/^[1-5](?:[.,]\d+)?$/.test(lines[at + 1] || '')) return null;
  const rating = Number(lines[at + 1].replace(',', '.'));
  return rating >= 1 && rating <= 5 ? rating : null;
}

export function inventory(root, snapshot) {
  const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  if (!snapshot && !fs.existsSync(path.join(root,'data_export/Facilities.json'))) throw new Error('Local exports are archived on Supabase. Restore the required files explicitly with scripts/restore-supabase-local-archive.mjs before running this offline tool.');
  const venues = snapshot ? snapshot.venues : read('data_export/Facilities.json');
  const decisions = snapshot ? snapshot.decisions || {} : read('data_export/coordinates/review-decisions.json');
  const lookupDir = path.join(root, 'data_export/coordinates/lookups');
  const lookups = snapshot ? Object.keys(snapshot.lookups || {}) : fs.readdirSync(lookupDir).filter(f => f.endsWith('.json'));
  const observations = new Map();
  for (const filename of lookups) {
    const lookup = snapshot ? snapshot.lookups[filename] : read(`data_export/coordinates/lookups/${filename}`);
    for (const [index, candidate] of (lookup.candidates || []).entries()) {
      const rating = extractRating(candidate);
      if (rating === null || !/^https:\/\/(www\.)?google\.com\/maps\/place\//.test(candidate.url || '')) continue;
      const approved = decisions[lookup.id]?.lookup === filename && decisions[lookup.id]?.candidate === index;
      const list = observations.get(lookup.id) || [];
      list.push({ rating, name: candidate.name, address: candidate.address, url: candidate.url,
        observed_at: lookup.checkedAt, cache_file: `data_export/coordinates/lookups/${filename}`,
        identity_status: approved ? 'previous_coordinate_identity_review' : 'needs_identity_review',
        status: 'historical_maps_observation_not_currently_verified' });
      observations.set(lookup.id, list);
    }
  }
  const rows = venues.map(v => {
    const values = [v.rating, v.google_rating, v.raw_data?.rating, v.raw_data?.google_rating];
    const existing = values.find(n => n !== null && n !== undefined && n !== '' && Number(n) >= 1 && Number(n) <= 5);
    const cached = observations.get(v.id || v.facility_id) || [];
    const ratings = new Set(cached.map(o => o.rating));
    const status = existing !== undefined ? 'existing_rating' : ratings.size > 1 ? 'conflicting_cache_observations'
      : cached.length ? 'cached_maps_candidate' : 'needs_source_search';
    return { facility_id: v.id || v.facility_id, name: v.name, address: v.address, province: v.province,
      sport: v.sport, existing_rating: existing === undefined ? null : Number(existing), status,
      source_url: v.source_url || null,
      google_search_url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${v.name}, ${v.address}`),
      observations: cached };
  });
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  return { generated_at: new Date().toISOString(), scope: 'all_local_export_facilities',
    production_modified: false, current_google_ratings_verified: 0,
    summary: { total: rows.length, lookup_files_scanned: lookups.length, ...counts }, facilities: rows };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = inventory(root);
  const output = path.join(root, 'data_export/ratings/all-facilities-research.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output, ...result.summary, current_google_ratings_verified: 0 }, null, 2));
}
