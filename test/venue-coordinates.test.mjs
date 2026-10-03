import test from 'node:test';
import assert from 'node:assert/strict';
import { placeCoordinates, inVietnam, validCoordinates, firestoreNumber } from '../scripts/lib/venue-coordinates.mjs';

test('uses the place pin instead of the camera centre', () => {
  const url = 'https://www.google.com/maps/place/Example/@12.1,108.1,17z/data=!8m2!3d12.6727133!4d108.0364007';
  assert.deepEqual(placeCoordinates(url), { lat: 12.6727133, lng: 108.0364007 });
});
test('rejects camera-only URLs, ambiguous pins, other hosts and out-of-country results', () => {
  for (const url of [
    'https://www.google.com/maps/place/Example/@12.1,108.1,17z',
    'https://www.google.com/maps/search/foo/@12.1,108.1,17z/data=!3d12.1!4d108.1',
    'https://example.com/maps/place/foo/data=!3d12.1!4d108.1',
    'https://www.google.com/maps/place/foo/data=!3d12.1!4d108.1!3d12.2!4d108.2',
    'https://www.google.com/maps/place/foo/data=!3d48.8!4d2.3',
  ]) assert.equal(placeCoordinates(url), null);
});
test('missing, invalid and string values cannot silently become numeric coordinates', () => {
  assert.equal(firestoreNumber({ integerValue: '21' }), 21);
  assert.equal(firestoreNumber({ stringValue: '21.1' }), null);
  assert.equal(inVietnam(null, null), false);
  assert.equal(inVietnam(21, 105), true);
  assert.equal(validCoordinates(NaN, 105), false);
  assert.equal(validCoordinates(0, 0), true);
});
