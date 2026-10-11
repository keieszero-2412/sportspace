import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPlace, distanceMeters, isMapsUrl, researchUrl, coreNameRatio, rankSearchCandidates, selectSearchCandidates } from '../scripts/lib/venue-rating-research.mjs';
const venue = { name: 'Sân bóng đá C1', address: '1B Y Ngông, Buôn Ma Thuột, Đắk Lắk', province: 'Đắk Lắk', lat: 12.6727133, lng: 108.0364007 };
test('fast single pass opens one plausible candidate and skips unrelated results', () => {
  const links = [{ name: 'Nhà hàng ABC', url: 'https://www.google.com/maps/place/ABC/data=!3d21!4d105' },
    { name: 'Sân bóng C1', url: 'https://www.google.com/maps/place/C1/data=!3d12.6727133!4d108.0364007' },
    { name: 'C1 Club', url: 'https://www.google.com/maps/place/C1Club/data=!3d12.68!4d108.04' }];
  assert.equal(selectSearchCandidates(venue, links).length, 3);
  assert.deepEqual(selectSearchCandidates(venue, links, true), [links[1]]);
  assert.deepEqual(selectSearchCandidates(venue, [links[0]], true), []);
  assert.equal(links.length, 3);
});
test('generic Maps prefix and brand apostrophes preserve identity without accepting other brands', () => {
  assert.equal(coreNameRatio("D'Lecia Pickleball - Ô A7", 'Sân Pickleball - Dlecia Pickleball Court'), 1);
  assert.equal(coreNameRatio('D’Lecia Pickleball - Ô A7', 'Sân Pickleball - Dlecia Pickleball Court'), 1);
  assert.equal(coreNameRatio("D'Lecia Pickleball - Ô A7", 'Sân Pickleball - Another Pickleball Court'), 0);
  assert.equal(coreNameRatio('Sân Pickleball', 'Sân Pickleball'), 0);
});
const place = { name: venue.name, address: venue.address,
  url: 'https://www.google.com/maps/place/C1/data=!3d12.6727133!4d108.0364007',
  summary: `${venue.name}\n4,7\nSân bóng đá`, reviewsLabel: '21 bài đánh giá' };
test('rating is verified only for matched identity and venue pin', () => {
  const result = classifyPlace(venue, place);
  assert.equal(result.status, 'verified_google_rating');
  assert.equal(result.rating, 4.7);
  assert.equal(result.reviews_count, 21);
  assert.equal(classifyPlace(venue, { ...place, name: 'Nhà hàng ABC' }).identity_verified, false);
  assert.equal(classifyPlace(venue, { ...place, url: 'https://www.google.com/maps/@12.6727133,108.0364007,17z' }).identity_verified, false);
  assert.equal(classifyPlace(venue, { ...place, category: 'Cửa hàng đồ thể thao' }).identity_verified, false);
});
test('missing score is not interpreted as no reviews', () => {
  assert.equal(classifyPlace(venue, { ...place, summary: venue.name }).status, 'rating_not_visible');
  assert.equal(classifyPlace(venue, { ...place, summary: `${venue.name}\nChưa có bài đánh giá` }).status, 'verified_no_reviews');
});
test('uses saved place URLs; otherwise search includes address; rejects non-Maps links', () => {
  assert.equal(researchUrl({ ...venue, coordinate_source: { url: place.url } }), place.url);
  assert.equal(new URL(researchUrl(venue)).searchParams.get('query'), `${venue.name}, ${venue.address}`);
  assert.equal(isMapsUrl('https://evil.example/maps/place/a'), false);
  assert.equal(distanceMeters(venue, venue), 0);
  assert.equal(distanceMeters({}, venue), null);
});
test('address suffix and English descriptors do not hide the correct brand', () => {
  assert.equal(coreNameRatio('Master Bros - Indoor Pickleball Facility', 'Master Bros Pickleball'), 1);
  assert.equal(coreNameRatio('Hippi Pickleball - Ngõ 464 Âu Cơ', 'Hippi Club Pickleball'), 1);
  assert.equal(coreNameRatio('Sân bóng đá', 'Sân bóng đá'), 0);
  assert.equal(rankSearchCandidates({ ...venue, name: 'Master Bros - Indoor Pickleball Facility' }, [
    { name: 'Eco Green City', url: place.url }, { name: 'Master Bros Pickleball', url: place.url }
  ])[0].name, 'Master Bros Pickleball');
});
test('short Maps name requires exact coordinates, address, sport and reverse brand', () => {
  const expected = { ...venue, name: 'Sân Pickleball 68 Vũ Đức Thận', sport: 'Pickleball' };
  const actual = { ...place, name: 'Pickleball 68', summary: 'Pickleball 68\n4,8' };
  assert.equal(classifyPlace(expected, actual).status, 'verified_google_rating');
  assert.equal(classifyPlace(expected, { ...actual, name: 'Siêu thị 68' }).identity_verified, false);
  assert.equal(classifyPlace(expected, { ...actual, url: place.url.replace('12.6727133', '12.6757133') }).identity_verified, false);
});
test('shared brand and address cannot override a conflicting catalogue pin', () => {
  const conflicting = { ...place, url: place.url.replace('12.6727133', '12.6827133') };
  const result = classifyPlace(venue, conflicting);
  assert.equal(result.identity_verified, false);
  assert.equal(result.coordinate_address_conflict, true);
  const withoutCoordinates = { ...venue, lat: undefined, lng: undefined };
  assert.equal(classifyPlace(withoutCoordinates, place).identity_verified, true);
});
