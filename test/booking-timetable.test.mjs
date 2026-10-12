import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { overlaps } from '../functions/domain.js';

const source = fs.readFileSync(new URL('../src/components/BookingModal.jsx', import.meta.url), 'utf8');
const cellSource = source.slice(source.indexOf('function cell(c, time)'), source.indexOf('  const selections ='));
const makeCell = (availability, clock = 1000) => new Function('availability', 'clock', 'slotIntervals', 'overlaps',
  `${cellSource}; return cell;`)(availability, clock, { '18:00': { startAt: 2000, endAt: 3000 } }, overlaps);

test('Book Venue marks an overlapping simulated reservation as booked on its court', () => {
  const cell = makeCell([{ courtId: 'c1', startAt: 2000, endAt: 3000, expiresAt: 3000, status: 'booked' }]);
  assert.equal(cell({ id: 'c1' }, '18:00'), 'booked');
  assert.equal(cell({ id: 'c2' }, '18:00'), 'available');
  assert.match(source, /state === "booked"\s*\? "#ef4444"/);
});
test('expired and cancelled reservations do not mark available future slots as booked', () => {
  for (const row of [
    { courtId: 'c1', startAt: 2000, endAt: 3000, expiresAt: 500, status: 'booked' },
    { courtId: 'c1', startAt: 2000, endAt: 3000, status: 'cancelled' },
    { courtId: 'c1', startAt: 0, endAt: 1000, status: 'booked' },
  ]) assert.equal(makeCell([row])({ id: 'c1' }, '18:00'), 'available');
});
test('an ongoing booked slot stays red until its end rather than becoming grey', () => {
  const row = { courtId: 'c1', startAt: 2000, endAt: 3000, expiresAt: 3000, status: 'booked' };
  assert.equal(makeCell([row], 2500)({ id: 'c1' }, '18:00'), 'booked');
  assert.equal(makeCell([row], 3000)({ id: 'c1' }, '18:00'), 'locked');
});
test('coverage generator uses native court/date fields, peak priority and weekend density', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261012010000_simulated_venue_coverage.sql', import.meta.url), 'utf8');
  assert.match(sql, /then 2 else 1/);
  assert.match(sql, /between 1020 and 1199/);
  assert.match(sql, /start_min/);
  assert.match(sql, /court_id,"courtId",facility_id/);
  assert.match(sql, /'simulationCoverage',true/);
  assert.doesNotMatch(sql, /(?:insert into|update|delete from) public\."Bookings"/i);
});
