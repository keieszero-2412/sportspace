import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSelections, selectionRanges, bookingCourtIds } from '../supabase/functions/sportspace/selection.js';
import { interval, quote } from '../functions/domain.js';

const ranges = (times, duration = 60, hours = '05:00-24:00') => selectionRanges({ times }, '2026-10-20', duration, hours, interval);
test('multiple courts retain independent selections and canonical ordering', () => {
  const result = normalizeSelections({ selections: [{ courtId: 'b', times: ['09:00'] }, { courtId: 'a', times: ['06:00', '05:00'] }] });
  assert.deepEqual(result, [{ courtId: 'a', times: ['05:00', '06:00'] }, { courtId: 'b', times: ['09:00'] }]);
  result.forEach(s => assert.doesNotThrow(() => ranges(s.times)));
});
test('exactly one empty cell is forbidden; adjacent slots and larger gaps are allowed', () => {
  for (const [duration, adjacent, forbidden, allowed] of [[30, '05:30', '06:00', '06:30'], [60, '06:00', '07:00', '08:00'], [120, '07:00', '09:00', '11:00']]) {
    assert.doesNotThrow(() => ranges(['05:00', adjacent], duration));
    assert.throws(() => ranges(['05:00', forbidden], duration), /single-slot-gap/);
    assert.doesNotThrow(() => ranges(['05:00', allowed], duration));
    assert.doesNotThrow(() => ranges(['05:00', adjacent, forbidden], duration));
  }
});
test('gap validation works across midnight and does not compare separate courts', () => {
  assert.throws(() => ranges(['23:00', '01:00'], 60, '20:00-04:00'), /single-slot-gap/);
  assert.doesNotThrow(() => ranges(['23:00', '02:00'], 60, '20:00-04:00'));
  assert.doesNotThrow(() => ranges(['23:00', '00:00', '01:00'], 60, '20:00-04:00'));
});
test('old single-court payload remains accepted and total sums each court price', () => {
  assert.deepEqual(normalizeSelections({ courtId: 'a', times: ['05:00'] }), [{ courtId: 'a', times: ['05:00'] }]);
  assert.equal(quote({ basePrice: 100000 }, {}, ranges(['05:00'])) + quote({ basePrice: 150000 }, {}, ranges(['05:00', '06:00'])), 400000);
  assert.deepEqual(bookingCourtIds({ courtId: 'old' }), ['old']);
  assert.deepEqual(bookingCourtIds({ courtId: 'a', raw_data: { bookingItems: [{ courtId: 'b' }, { courtId: 'a' }] } }), ['a', 'b']);
});
test('invalid or excessive selections cannot reach a hold transaction', () => {
  assert.throws(() => normalizeSelections({ selections: [] }), /select-time/);
  assert.throws(() => normalizeSelections({ selections: [{ courtId: 'a', times: Array(17).fill('05:00') }] }), /too-many-booking-slots/);
  assert.throws(() => normalizeSelections({ courtId: 'a', times: ['bad'] }), /invalid-time/);
});
