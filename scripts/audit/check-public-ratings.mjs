import fs from 'node:fs';
import dotenv from 'dotenv';

// Read only public fields using the anonymous key; never uses service-role or
// Firebase credentials and never modifies production data.
const env = { ...dotenv.parse(fs.readFileSync(new URL('../.env', import.meta.url))), ...process.env };
const base = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!base || !key) throw new Error('Missing public Supabase configuration');
if (process.argv.includes('--summary')) {
  for (const [label, filter] of [['total', null], ['withRating', '(rating.gte.1,google_rating.gte.1,raw_data->>rating.gte.1,raw_data->>google_rating.gte.1)']]) {
    const url = new URL('/rest/v1/Facilities', base);
    url.searchParams.set('select', 'id');
    if (filter) url.searchParams.set('or', filter);
    const response = await fetch(url, { method: 'HEAD', headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Public rating count failed (${response.status})`);
    console.log(`${label}: ${response.headers.get('content-range')?.split('/').at(-1)}`);
  }
  process.exit(0);
}
const ids = (process.argv.find(value => value.startsWith('--ids='))?.slice(6) || 'VN_0001,VN_1859,VN_1860').split(',');
if (ids.some(id => !/^[A-Za-z0-9_-]+$/.test(id))) throw new Error('Invalid facility ID');
const url = new URL('/rest/v1/Facilities', base);
url.searchParams.set('select', 'id,name,rating,reviews_count,google_rating,google_reviews_count,imported_rating:raw_data->rating,imported_reviews_count:raw_data->reviews_count,imported_google_rating:raw_data->google_rating');
url.searchParams.set('id', `in.(${ids.join(',')})`);
const result = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10000) });
console.log(JSON.stringify({ project: new URL(base).hostname, status: result.status, rows: await result.json() }, null, 2));
if (!result.ok) process.exitCode = 1;
