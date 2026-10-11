import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingRecord, activeCourt, bookingSetup, receiptPatch, transitionPatch, mutateBooking, availabilityRange } from '../supabase/functions/sportspace/booking.js';

const now = 1000000;
const facility = { id: 'f', ownerId: 'owner', operating_hours: '05:00-24:00' };
const court = { id: 'c', facility_id: 'f', is_available: true, price_day: 100000 };
const bank = { verifiedAt: now, bin: '970436', account: '12345678', name: 'Owner' };
const booking = { id: 'b', schemaVersion: 2, userId: 'payer', ownerId: 'owner', courtId: 'c', facilityId: 'f',
  status: 'held', totalAmount: 100000, holdExpiresAt: now + 600000, startAt: now + 86400000,
  endAt: now + 90000000, lockIds: ['k'], ticketId: 'SS-B' };

test('legacy availability and raw data work, explicit inactive status always blocks booking', () => {
  assert.equal(bookingSetup(facility, court, bank).court.price_day, 100000);
  assert.equal(activeCourt({ ...court, status: 'maintenance' }), false);
  assert.equal(activeCourt({ ...court, status: 'active', is_available: false }), false);
  assert.equal(activeCourt({ raw_data: court, status: null }), true);
  assert.equal(bookingRecord({ raw_data: { ownerId: 'old' }, ownerId: 'new' }).ownerId, 'new');
});
test('missing ownership, unrelated courts and unverified or invalid banks remain blocked', () => {
  assert.throws(() => bookingSetup({ id: 'f' }, court, bank), /facility-owner-not-configured/);
  assert.throws(() => bookingSetup(facility, { ...court, facility_id: 'other' }, bank), /court-not-bookable/);
  assert.throws(() => bookingSetup(facility, court, { ...bank, verifiedAt: null }), /payment-not-configured/);
  assert.throws(() => bookingSetup(facility, court, { ...bank, bin: '' }), /payment-not-configured/);
  assert.deepEqual(bookingSetup(facility, court, bank).payment, { bin: bank.bin, account: bank.account, name: bank.name });
});
test('imported booked schedules block overnight intervals while free and expired entries do not', () => {
  const row = { date: '2026-10-10', start_time: '23:00', end_time: '01:00', status: 'Booked' };
  const range = availabilityRange(row, now);
  assert.equal(range.endAt - range.startAt, 7200000);
  assert.equal(availabilityRange({ ...row, status: 'Available' }, now), null);
  assert.equal(availabilityRange({ ...row, expiresAt: now }, now), null);
  assert.throws(() => availabilityRange({ status: 'Booked' }, now), /legacy-schedule-needs-review/);
});
test('Postgres numeric strings are normalized for server-side pricing', () => {
  assert.equal(bookingSetup(facility, { ...court, price_day: '100000' }, bank).court.price_day, 100000);
  assert.throws(() => bookingSetup(facility, { ...court, price_day: 'bad' }, bank), /missing-price/);
});
test('receipt belongs to payer and booking, never marks funds received and respects expiry', () => {
  const path = 'receipts/payer/b/file';
  const patch = receiptPatch(booking, 'payer', path, now);
  assert.equal(patch.paymentStatus, 'pending_verification');
  assert.throws(() => receiptPatch(booking, 'other', path, now), /not-your-booking/);
  assert.throws(() => receiptPatch(booking, 'payer', 'receipts/payer/other/file', now), /invalid-receipt-path/);
  assert.throws(() => receiptPatch(booking, 'payer', path, booking.holdExpiresAt), /hold-expired/);
  assert.equal(receiptPatch({ ...booking, ...patch }, 'payer', path, now), null);
});
const pending = { ...booking, status: 'pending_approval', receiptPath: 'receipts/payer/b/file' };
test('owner must verify exact amount and reference while hold is active', () => {
  const data = { operation: 'approve', reference: 'BANK-1', amount: 100000 };
  assert.throws(() => transitionPatch(pending, 'payer', data, now), /not-your-booking/);
  assert.throws(() => transitionPatch(pending, 'owner', { ...data, amount: 1 }, now), /payment-verification-required/);
  assert.throws(() => transitionPatch(pending, 'owner', data, pending.holdExpiresAt), /hold-expired/);
  const patch = transitionPatch(pending, 'owner', data, now);
  assert.equal(patch.status, 'confirmed');
  assert.equal(patch.depositPaid, 100000);
  assert.equal(transitionPatch({ ...pending, ...patch }, 'owner', data, now), null);
});
test('cancellation requests refunds only for verified funds with twelve hour eligibility', () => {
  const paid = { ...booking, status: 'confirmed', paymentStatus: 'paid', depositPaid: 100000 };
  assert.equal(transitionPatch(paid, 'payer', { operation: 'cancel' }, now).refundStatus, 'requested');
  assert.equal(transitionPatch({ ...paid, startAt: now + 43199999 }, 'payer', { operation: 'cancel' }, now).refundAmount, 0);
  assert.equal(transitionPatch(booking, 'payer', { operation: 'cancel' }, now).refundAmount, 0);
});
test('late payments request refund without confirming or taking replacement slot', () => {
  const patch = transitionPatch(booking, 'owner', { operation: 'recordLatePayment', reference: 'LATE', amount: 100000 }, booking.holdExpiresAt);
  assert.equal(patch.status, 'expired');
  assert.equal(patch.refundStatus, 'requested');
  assert.throws(() => transitionPatch({ ...booking, ...patch }, 'owner', { operation: 'refund', reference: 'REF', amount: 1 }, now), /refund-verification-required/);
});

function mockSql({ b = pending, locks = [{ id: 'k', expiresAt: now + 1 }], duplicate = false } = {}) {
  const calls = [];
  const tx = (strings, ...values) => {
    if (!Array.isArray(strings)) return strings;
    const query = strings.join('?');
    calls.push({ query, values });
    if (query.includes('FROM "Bookings"')) return [b];
    if (query.includes('FROM "SlotLocks"')) return locks;
    if (query.includes('INSERT INTO "PaymentReferences"')) return duplicate ? [] : [{ bookingId: b.id }];
    return [];
  };
  return { calls, begin: (fn) => fn(tx) };
}
test('transactions reject stolen/expired locks and duplicate bank references before booking update', async () => {
  for (const scenario of [{ locks: [], expected: /hold-expired/ }, { duplicate: true, expected: /payment-reference-already-used/ }]) {
    const sql = mockSql(scenario);
    await assert.rejects(mutateBooking(sql, 'owner', { bookingId: 'b', operation: 'approve', reference: 'BANK', amount: 100000 }, 'bookingTransition', now), scenario.expected);
    assert.equal(sql.calls.some(c => c.query.includes('UPDATE "Bookings"')), false);
  }
});
test('approval retains locks through playing time and writes payment ledger once', async () => {
  const sql = mockSql();
  const result = await mutateBooking(sql, 'owner', { bookingId: 'b', operation: 'approve', reference: 'BANK', amount: 100000 }, 'bookingTransition', now);
  assert.equal(result.status, 'confirmed');
  assert.equal(sql.calls.filter(c => c.query.includes('INSERT INTO "Ledger"')).length, 1);
  assert.equal(sql.calls.find(c => c.query.includes('UPDATE "SlotLocks"')).values[0], booking.endAt);
});
test('receipt storage validation must succeed before changing booking', async () => {
  const sql = mockSql({ b: booking });
  await assert.rejects(mutateBooking(sql, 'payer', { bookingId: 'b', path: 'receipts/payer/b/file' }, 'submitReceipt', now, async () => { throw new Error('invalid-receipt-file'); }), /invalid-receipt-file/);
  assert.equal(sql.calls.some(c => c.query.includes('UPDATE "Bookings"')), false);
});
