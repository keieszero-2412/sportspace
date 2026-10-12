import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { availabilityRange } from '../supabase/functions/sportspace/booking.js';
import { openMatches } from '../src/services/matchFeed.js';

test('simulated availability blocks an overlapping slot only until its expiry', () => {
  const row = { courtId: 'court', startAt: 1000, endAt: 3000, expiresAt: 3000,
    status: 'booked', raw_data: { mockData: true, simulationManaged: true } };
  assert.deepEqual(availabilityRange(row, 2000), { startAt: 1000, endAt: 3000 });
  assert.equal(availabilityRange(row, 3000), null);
  assert.equal(availabilityRange({ ...row, status: 'cancelled' }, 2000), null);
});

test('past fixtures disappear regardless of whether they are real or simulated', () => {
  const rows = [{ id: 'mock', startAt: 2000, status: 'open', raw_data: { mockData: true } },
    { id: 'real', startAt: 4000, status: 'open' }];
  assert.equal(openMatches(rows, 1000).length, 2);
  assert.deepEqual(openMatches(rows, 2000).map(r => r.id), ['real']);
  assert.equal(openMatches(rows, 4000).length, 0);
});

test('automation is isolated from financial bookings and protected from public writes', () => {
  const sql = fs.readFileSync(new URL('../supabase/migrations/20261012000000_simulated_match_schedule.sql', import.meta.url), 'utf8');
  assert.match(sql, /pg_try_advisory_xact_lock/);
  assert.match(sql, /for update/);
  assert.match(sql, /SimulationMatchTemplates/);
  assert.match(sql, /cron.schedule/);
  assert.match(sql, /revoke all on function/);
  assert.doesNotMatch(sql, /(?:insert into|update|delete from) public\."Bookings"/i);
  assert.match(sql, /'mockData'='true'/);
  const feed = fs.readFileSync(new URL('../src/services/matchFeed.js', import.meta.url), 'utf8');
  assert.match(feed, /setInterval\(publish, 30000\)/);
  assert.match(feed, /clearInterval\(expiryTimer\)/);
});
