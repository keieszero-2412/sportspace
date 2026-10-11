import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { transform } from 'esbuild';
import { normalizeSelections, selectionRanges } from '../supabase/functions/sportspace/selection.js';
import { bookingSetup, availabilityRange } from '../supabase/functions/sportspace/booking.js';
import { HOLD_MS, interval, overlaps, lockIds, quote } from '../functions/domain.js';

// Execute the actual deployed hold handler offline, with SQL/auth dependencies
// injected. No Firebase, Supabase, or network calls are made by this harness.
const source = fs.readFileSync(new URL('../supabase/functions/sportspace/index.ts', import.meta.url), 'utf8');
const start = source.indexOf('    if (action === "holdBooking") {');
const end = source.indexOf('    if (action === "submitReceipt"', start);
const { code } = await transform(`async function hold(data, db) {
  const action = 'holdBooking', uid = 'payer', now = Date.parse('2026-10-19T00:00:00Z');
  const getSql = async () => db;
  const id = x => x;
  const hash = async x => x;
  const text = x => String(x || '');
  ${source.slice(start, end)}
}`, { loader: 'ts' });
const hold = new Function('normalizeSelections', 'selectionRanges', 'bookingSetup', 'availabilityRange', 'HOLD_MS', 'interval', 'overlaps', 'lockIds', 'quote', `${code}; return hold;`)(normalizeSelections, selectionRanges, bookingSetup, availabilityRange, HOLD_MS, interval, overlaps, lockIds, quote);

function database(conflict = false) {
  const writes = [], lockedCourts = [];
  const tx = (strings, ...values) => {
    if (!Array.isArray(strings) || !strings.raw) return strings;
    const sql = strings.join('?');
    if (sql.startsWith('SELECT id FROM "Courts"')) { lockedCourts.push(values[0]); return []; }
    if (sql.includes('SELECT * FROM "Courts"')) return [{ id: values[0], facility_id: 'f', status: 'active', basePrice: values[0] === 'a' ? 100000 : 200000 }];
    if (sql.includes('FROM "Facilities"')) return [{ id: 'f', ownerId: 'owner', operating_hours: '05:00-24:00' }];
    if (sql.includes('FROM "PaymentConfig"')) return [{ bin: '970436', account: '12345678', name: 'Owner', verifiedAt: 1 }];
    if (sql.includes('FROM "SlotLocks"') && conflict && values[0]?.some(k => k.startsWith('b_'))) return [{ expiresAt: Date.parse('2026-10-21') }];
    if (/INSERT|UPDATE|DELETE/.test(sql)) writes.push({ sql, values });
    return [];
  };
  return { writes, lockedCourts, begin: async fn => {
    try { return await fn(tx); } catch (error) { writes.length = 0; throw error; }
  } };
}
const request = { key: 'key', facilityId: 'f', date: '2026-10-20', duration: 60,
  selections: [{ courtId: 'b', times: ['05:00', '06:00'] }, { courtId: 'a', times: ['05:00'] }],
  customerName: 'Player', phone: '0901234567' };

test('one multi-court hold prices and locks each court, preserving grouped details', async () => {
  const db = database();
  const response = await hold(request, db);
  const { data } = await response.json();
  assert.deepEqual(db.lockedCourts, ['a', 'b']);
  assert.equal(data.totalAmount, 500000);
  assert.equal(data.raw_data.bookingItems.length, 2);
  assert.equal(data.lockIds.length, 6);
  assert.equal(db.writes.filter(w => w.sql.includes('INSERT INTO "Bookings"')).length, 1);
  const locks = db.writes.filter(w => w.sql.includes('INSERT INTO "SlotLocks"'));
  assert.equal(locks.filter(w => w.values[2] === 'a').length, 2);
  assert.equal(locks.filter(w => w.values[2] === 'b').length, 4);
});
test('a conflict on the second court does not leave a partial reservation', async () => {
  const db = database(true);
  await assert.rejects(hold(request, db), /slot-taken/);
  assert.equal(db.writes.length, 0);
});
test('server rejects a forbidden gap even when client validation is bypassed', async () => {
  const db = database();
  await assert.rejects(hold({ ...request, selections: [{ courtId: 'a', times: ['05:00', '07:00'] }] }, db), /single-slot-gap/);
  assert.equal(db.writes.length, 0);
});
