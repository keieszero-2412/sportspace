import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRating, inventory } from '../scripts/audit/inventory-venue-ratings.mjs';

test('Maps score must immediately follow the matching venue name', () => {
  assert.equal(extractRating({ name: 'Sân C1', summary: 'Ảnh\nSân C1\n4,7\nSân bóng' }), 4.7);
  assert.equal(extractRating({ name: 'Sân C1', summary: 'Sân khác\n4,7' }), null);
  assert.equal(extractRating({ name: 'Sân C1', summary: 'Sân C1\n119\n4,7' }), null);
  assert.equal(extractRating({ name: 'Sân C1', summary: 'Sân C1\n5,9' }), null);
});

test('offline inventory covers every facility without claiming live verification', () => {
  const report = inventory('.', {venues:[{id:'test-a',name:'Synthetic A',rating:4.2},{id:'test-b',name:'Synthetic B'},{id:'test-c',name:'Synthetic C'}],
    lookups:{'test-b.json':{id:'test-b',candidates:[{name:'Synthetic B',summary:'Synthetic B\n4.7',url:'https://www.google.com/maps/place/Synthetic'}]}}});
  assert.equal(report.facilities.length, 3);
  assert.equal(new Set(report.facilities.map(v => v.facility_id)).size, 3);
  assert.equal(report.production_modified, false);
  assert.equal(report.current_google_ratings_verified, 0);
  assert.equal(report.summary.existing_rating, 1);
  assert.equal(report.summary.cached_maps_candidate,1);
  assert.equal(report.summary.needs_source_search,1);
  assert.equal(Object.entries(report.summary).filter(([k]) => !['total', 'lookup_files_scanned'].includes(k))
    .reduce((sum, [, count]) => sum + count, 0), 3);
});
