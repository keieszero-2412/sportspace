// Read with the same anonymous role and court/date filters as Book Venue.
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { localDate, overlaps, opening, interval } from '../../functions/domain.js';
dotenv.config({ quiet: true });
const base = process.env.VITE_SUPABASE_URL;
if (base !== 'https://dzpbnvpqkwsjlvdxwwub.supabase.co') throw new Error('Unexpected project');
const key = process.env.VITE_SUPABASE_ANON_KEY;
async function read(table, params) {
  const url = new URL(`/rest/v1/${table}`, base);
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
  return res.json();
}
const date = localDate();
const candidates = await read('Availability', { select: 'id,facility_id,court_id,startAt,endAt', date: `eq.${date}`,
  status: 'eq.booked', expiresAt: `gt.${Date.now()}`, limit: '100' });
const venues = await read('Facilities', { select: 'id,operating_hours',
  id: `in.(${[...new Set(candidates.map(r=>r.facility_id))].join(',')})`, limit: '100' });
let sample;
for (const row of candidates) {
  const venue = venues.find(v => v.id === row.facility_id);
  try {
    const bounds = opening(venue?.operating_hours);
    for (let minute=bounds.start;minute+60<=bounds.end;minute+=60) {
      const time=`${String(Math.floor((minute%1440)/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
      if (overlaps(interval(date,time,60,venue.operating_hours),row)) { sample=row; break; }
    }
  } catch (error) {
    if (!['missing-operating-hours','invalid-time'].includes(error.message)) throw error;
    // This audit deliberately reports only venues with renderable calendars.
  }
  if (sample) break;
}
assert(sample, 'No current public booked slot');
const courts = await read('Courts', { select: 'id', facility_id: `eq.${sample.facility_id}`, limit: '500' });
assert(courts.some(c => c.id === sample.court_id));
const rows = await read('Availability', {
  select: 'id,court_id,courtId,date,start_time,end_time,startAt,endAt,expiresAt,status,raw_data',
  court_id: `in.(${courts.map(c=>c.id).join(',')})`, date: `eq.${date}`, limit: '500',
});
assert(rows.some(row => row.id === sample.id && overlaps(row, sample)), 'Booked slot absent from Book Venue query');
console.log(JSON.stringify({ date, facilityId: sample.facility_id, courtId: sample.court_id,
  visibleBusySlots: rows.filter(r => r.expiresAt > Date.now() && r.status === 'booked').length,
  exactBookVenueQuery: 'passed', role: 'anon' }));
