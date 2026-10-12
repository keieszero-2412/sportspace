import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bookingRates } from '../scripts/lib/booking-price-sync.mjs';
import { quote } from '../functions/domain.js';

const reference = { basis: 'court_hour', unitMinutes: 60, min: 156000, max: 240000, peak: 190000 };
const hour = stamp => { const startAt = Date.parse(`${stamp}:00+07:00`); return [{ startAt, endAt: startAt + 3600000 }]; };
test('booking uses venue minimum, weekend maximum and rounded peak without stacking', () => {
  const rates = bookingRates(reference);
  assert.equal(quote(rates, {}, hour('2026-10-12T10:00')), 156000);
  assert.equal(quote(rates, {}, hour('2026-10-12T18:00')), 190000);
  assert.equal(quote(rates, {}, hour('2026-10-17T10:00')), 240000);
  assert.equal(quote(rates, {}, hour('2026-10-17T18:00')), 240000);
  assert.equal(quote(rates, {}, hour('2026-10-12T16:30')), 173000);
  assert.equal(quote(rates, {}, hour('2026-10-12T21:00')), 156000);
});
test('missing or invalid venue price ranges cannot overwrite court prices', () => {
  for (const value of [null, {}, { ...reference, min: 0 }, { ...reference, max: 1000 },
    { ...reference, peak: 187200 }, { ...reference, unitMinutes: 30 }]) assert.equal(bookingRates(value), null);
});
test('client and Supabase quote implementations remain identical', () => {
  assert.equal(fs.readFileSync(new URL('../functions/domain.js', import.meta.url), 'utf8'),
    fs.readFileSync(new URL('../supabase/functions/sportspace/domain.ts', import.meta.url), 'utf8'));
});
