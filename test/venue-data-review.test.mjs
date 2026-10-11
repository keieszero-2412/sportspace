import test from 'node:test';
import assert from 'node:assert/strict';
import { venueReview, reviewVenueData } from '../supabase/functions/sportspace/venueData.js';
import { getVenuePhone } from '../src/services/venuePhone.js';
const actor = { uid: 'admin-id', role: 'admin' }, now = 1791651600000;
const common = { key: 'review-key', facilityId: 'VN_0007', operation: 'approve', field: 'phone',
  value: '0832012345', expected: 'old-number', sourceUrl: 'https://sanpick.com/san-pickleball-ha-noi/',
  evidence: 'Giảng Võ Club, 15 Ngõ 29 Láng Hạ', identityConfirmed: true };

test('non-admin, unrelated fields and unsafe source links cannot submit reviews', async () => {
  let calls = 0;
  const client = { rpc() { calls++; } };
  for (const role of ['user', 'merchant', undefined]) {
    await assert.rejects(reviewVenueData(client, common, { uid: 'u', role }, now), /admin-required/);
  }
  assert.equal(calls, 0);
  assert.throws(() => venueReview({ ...common, field: 'ownerId' }, actor, now), /invalid-venue-review/);
  for (const sourceUrl of ['javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com'])
    assert.throws(() => venueReview({ ...common, sourceUrl }, actor, now), /invalid-source-url/);
});

test('approved phones normalize and remain compatible with existing display callers', () => {
  const review = venueReview({ ...common, value: '+84 832 012 345' }, actor, now);
  assert.equal(review.value, '0832012345');
  assert.equal(getVenuePhone({ phone: review.value, ...review.metadata }).number, review.value);
  assert.equal(review.expected, 'old-number');
  assert.throws(() => venueReview({ ...common, value: '0598370497' }, actor, now), /invalid-venue-phone/);
  assert.throws(() => venueReview({ ...common, value: '0912345678' }, actor, now), /invalid-venue-phone/);
  assert.throws(() => venueReview({ ...common, identityConfirmed: false }, actor, now), /venue-identity/);
});

test('image approval requires identity, permission and a documented license', () => {
  const image = { ...common, field: 'image', value: 'https://example.com/venue.webp' };
  assert.throws(() => venueReview(image, actor, now), /image-rights-required/);
  assert.throws(() => venueReview({ ...image, rightsConfirmed: true }, actor, now), /image-rights-required/);
  const review = venueReview({ ...image, rightsConfirmed: true, license: 'Owner provided permission' }, actor, now);
  assert.equal(review.metadata.imageVerifiedBy, actor.uid);
  assert.equal(review.metadata.imageSourceUrl, common.sourceUrl);
});

test('price approvals format explicit units, never alter checkout pricing fields', () => {
  const price = { ...common, field: 'price_summary', min: 100000, max: 250000, basis: 'court_hour', unitMinutes: 60 };
  assert.equal(venueReview(price, actor, now).value, '100.000đ - 250.000đ/h');
  for (const basis of ['person_session', 'court_session', 'unknown', 'package', 'court_unknown_duration', 'bundle_hour', 'court_match', 'half_court_hour']) {
    const review = venueReview({ ...price, basis }, actor, now);
    assert.equal(review.value.endsWith('/h'), false);
    assert.equal(review.metadata.price_reference.checkoutPrice, false);
    assert.equal(Object.hasOwn(review.metadata, 'basePrice'), false);
  }
  assert.equal(venueReview({ ...price, unitMinutes: 90 }, actor, now).value.endsWith('/h'), false);
  for (const patch of [{ min: 0 }, { min: -1 }, { max: 50000 }, { min: 100.5 }, { basis: 'invented' }, { unitMinutes: 2000 }])
    assert.throws(() => venueReview({ ...price, ...patch }, actor, now), /invalid-reference-price/);
});

test('rejection needs a reason but no image permission; selected evidence is retained', () => {
  assert.throws(() => venueReview({ ...common, operation: 'reject' }, actor, now), /rejection-reason-required/);
  const review = venueReview({ ...common, field: 'image', value: 'https://example.com/photo.jpg',
    operation: 'reject', identityConfirmed: false, reason: 'Wrong venue' }, actor, now);
  assert.equal(review.operation, 'reject');
  assert.equal(review.reason, 'Wrong venue');
  assert.equal(venueReview({ ...common, value: '0598370497', operation: 'reject', reason: 'Repeated default' }, actor, now).operation, 'reject');
});

test('review invokes only the transactional RPC and preserves conflict/permission errors', async () => {
  let request;
  const client = { rpc: async (name, payload) => { request = { name, payload }; return { data: { id: 'VN_0007', phone: '0832012345' } }; } };
  const result = await reviewVenueData(client, common, actor, now);
  assert.equal(result.phone, '0832012345');
  assert.equal(request.name, 'review_venue_data');
  assert.equal(request.payload.p_actor, actor.uid);
  assert.equal(request.payload.p_review.field, 'phone');
  const error = { code: 'P0001', message: 'venue-data-changed' };
  await assert.rejects(reviewVenueData({ rpc: async () => ({ error }) }, common, actor, now), value => value === error);
});

test('synthetic source catalog excludes quarantined numbers and keeps evidence/units', async () => {
  const { default: sources } = await import('./fixtures/venue-review-catalog.mjs');
  for (const venue of Object.values(sources.venues)) {
    for (const [field, candidates] of Object.entries(venue)) {
      for (const candidate of candidates) {
        assert.match(candidate.sourceUrl, /^https:\/\//);
        assert.equal(candidate.status, 'candidate_not_approved');
        if (field === 'phone') assert.notEqual(candidate.value, '0598370497');
        if (field === 'price_summary' && candidate.value.endsWith('/h')) {
          assert.equal(candidate.basis, 'court_hour'); assert.equal(candidate.unitMinutes, 60);
        }
      }
    }
  }
});
