import test from 'node:test';
import assert from 'node:assert/strict';
import { reviewCoverage, reviewHistoryCounts, fetchVenueReviewCounts } from '../src/services/venueReviewCoverage.js';

test('coverage partitions all venues and ignores orphan sources', () => {
  const venues = ['a','b','c'].map(id => ({ id, name: id }));
  const coverage = reviewCoverage(venues, {
    a: { image: [1,2], phone: [1], price_summary: [1] },
    b: { phone: [1] }, orphan: { image: [1] },
  });
  assert.equal(coverage.complete, 1);
  assert.equal(coverage.partial, 1);
  assert.equal(coverage.missingAll, 1);
  assert.deepEqual(coverage.fields.image, { venues: 1, candidates: 2, missing: 2 });
  assert.deepEqual(coverage.missing[0].fields, ['image','price_summary']);
});

test('history counts latest decision per venue and field, not events', () => {
  const rows = [
    { id:'1', facilityId:'a', field:'phone', status:'approve', createdAt:'2026-01-01' },
    { id:'2', facilityId:'a', field:'phone', status:'reject', createdAt:'2026-01-02' },
    { id:'3', facilityId:'a', field:'phone', status:'approve', createdAt:'2026-01-02' },
    { id:'4', facilityId:'b', field:'phone', status:'reject', createdAt:'2026-01-01' },
  ];
  assert.deepEqual(reviewHistoryCounts(rows).phone, { approved:1, rejected:1 });
});

test('review lookup surfaces unavailable schema instead of reporting zero', async () => {
  const error = new Error('relation does not exist');
  const query = { select(){return this;}, order(){return this;}, limit(){return this;},
    abortSignal: async () => ({ error }) };
  await assert.rejects(fetchVenueReviewCounts({ from: () => query }), /relation does not exist/);
});

test('history lookup includes decisions beyond the first page', async () => {
  let page = 0;
  const rows = Array.from({length:500}, (_, index) => ({ id:String(index).padStart(4,'0'), facilityId:`v${index}`, field:'image', status:'approve', createdAt:'2026-01-01' }));
  const query = { select(){return this;}, order(){return this;}, limit(){return this;}, gt(field, cursor){assert.equal(cursor,'0499'); return this;},
    abortSignal: async () => ({data:page++ === 0 ? rows : [{id:'0500',facilityId:'v0',field:'image',status:'reject',createdAt:'2026-01-02'}]}) };
  const result = await fetchVenueReviewCounts({from:()=>query});
  assert.deepEqual(result.image,{approved:499,rejected:1});
  assert.equal(page,2);
});
