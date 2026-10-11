import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoogleRatingReport } from '../scripts/lib/google-rating-report.mjs';
const venue = { id: 'VN_0001', name: 'Sân bóng đá C1', address: '1B Y Ngông', province: 'Đắk Lắk', sport: 'Bóng đá', lat: 12.6727133, lng: 108.0364007 };
const observation = { status: 'verified_google_rating', identity_verified: true, rating: 4.7,
  name: venue.name, url: 'https://www.google.com/maps/place/C1/data=!1s0x1:0x2!3d12.6727133!4d108.0364007',
  address: venue.address, rating_evidence: `${venue.name}\n4.7`,
  coordinates: { lat: 12.6727133, lng: 108.0364007 } };
const lookup = { facility_id: venue.id, status: 'verified_google_rating', checked_at: '2026-10-10T00:00:00Z', observations: [observation] };
test('counts all rows, not-yet-checked venues, and only newly discovered ratings', () => {
  const rows = [venue, { ...venue, id: 'VN_0002', rating: 4.5 }, { ...venue, id: 'VN_0003' }];
  const result = buildGoogleRatingReport(rows, new Map([[venue.id, lookup], ['VN_0002', { ...lookup, facility_id: 'VN_0002' }]]));
  assert.equal(result.total, 3);
  assert.equal(result.checked, 2);
  assert.equal(result.newly_found_ratings, 1);
  assert.equal(result.verified_unique_google_places, 1);
  assert.equal(result.shared_google_places.length, 1);
  assert.deepEqual(result.shared_google_places[0].facility_ids, ['VN_0001', 'VN_0002']);
  assert.equal(result.production_modified, false);
});
test('conflicting matching Google places are not published as one verified score', () => {
  const conflict = { ...observation, rating: 4.3, rating_evidence: `${venue.name}\n4.3`, url: observation.url.replace('0x1:0x2', '0x1:0x3') };
  const result = buildGoogleRatingReport([venue], new Map([[venue.id, { ...lookup, observations: [observation, conflict] }]]));
  assert.equal(result.facilities[0].status, 'ambiguous_google_places');
  assert.equal(result.newly_found_ratings, 0);
});
test('does not attach a lookup for another facility or convert invisible ratings to no reviews', () => {
  assert.throws(() => buildGoogleRatingReport([venue], new Map([[venue.id, { ...lookup, facility_id: 'VN_0002' }]])), /facility mismatch/);
  const result = buildGoogleRatingReport([venue], new Map([[venue.id, { ...lookup, status: 'rating_not_visible', observations: [] }]]));
  assert.equal(result.facilities[0].status, 'rating_not_visible');
  assert.equal(result.newly_found_ratings, 0);
});
test('manual alias reviews require a specific place, exact pin, address and provenance', () => {
  const expected = { ...venue, name: 'Old brand' };
  const actual = { ...observation, identity_verified: false, status: 'identity_needs_review',
    rating_evidence: `${venue.name}\n4.7`, address: venue.address };
  const decision = { expected_name: expected.name, google_name: actual.name, google_place_key: '0x1:0x2',
    reason: 'Owner documents old and current names', reviewed_at: '2026-10-10', alias_sources: ['https://example.org/venue'] };
  const input = [{ ...expected, lat: actual.coordinates.lat, lng: actual.coordinates.lng }];
  const saved = new Map([[venue.id, { ...lookup, observations: [actual] }]]);
  assert.equal(buildGoogleRatingReport(input, saved, { decisions: { [venue.id]: decision } }).facilities[0].status, 'verified_google_rating');
  assert.equal(buildGoogleRatingReport(input, saved, { decisions: { [venue.id]: { ...decision, google_place_key: '0x1:0x3' } } }).facilities[0].status, 'identity_needs_review');
  assert.equal(buildGoogleRatingReport(input, saved, { decisions: { [venue.id]: { ...decision, alias_sources: [] } } }).facilities[0].status, 'identity_needs_review');
});
test('a stored verified flag does not substitute for missing source evidence', () => {
  const result = buildGoogleRatingReport([venue], new Map([[venue.id, { ...lookup, observations: [{ ...observation, rating_evidence: null }] }]]));
  assert.equal(result.facilities[0].status, 'rating_not_visible');
  assert.equal(result.newly_found_ratings, 0);
});
