import test from 'node:test';
import assert from 'node:assert/strict';
import { getGoogleRating } from '../src/services/googleRating.js';

test('ratings imported into raw_data survive nullable promoted columns', () => {
  const rating = getGoogleRating({ name: 'Sân A', rating: null, google_rating: null,
    raw_data: { rating: '4,8', reviews_count: '25', google_place_id: 'place-A' } });
  assert.equal(rating.rating, 4.8);
  assert.equal(rating.count, 25);
  assert.equal(new URL(rating.url).searchParams.get('query_place_id'), 'place-A');
});
test('current columns override imported data and invalid values do not become ratings', () => {
  assert.equal(getGoogleRating({ google_rating: 4.2, raw_data: { google_rating: 4.9 } }).rating, 4.2);
  assert.equal(getGoogleRating({ google_rating: 0, raw_data: { google_rating: 4.9 } }).rating, null);
  assert.equal(getGoogleRating({ rating: 'not a rating' }).rating, null);
  assert.equal(getGoogleRating({ rating: 7 }).rating, null);
});
test('missing rating keeps a Maps link without borrowing unrelated local ratings', () => {
  const result = getGoogleRating({ id: 'VN_0001', name: 'Sân A', address: 'Địa chỉ A' });
  assert.equal(result.rating, null);
  assert.equal(result.count, null);
  assert.match(new URL(result.url).searchParams.get('query'), /Sân A/);
});
