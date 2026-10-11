import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchVenueReviewCatalog } from '../src/services/venueReviewCatalog.js';
import fixture from './fixtures/venue-review-catalog.mjs';
function client(result){
  const q={select(){return q},eq(){return q},single(){return q},abortSignal(){return Promise.resolve(result)}};
  return{from(name){assert.equal(name,'VenueReviewCatalog');return q}};
}
test('catalog comes from Supabase without a local fallback',async()=>{
  assert.deepEqual(await fetchVenueReviewCatalog(client({data:{payload:fixture}})),fixture);
});
test('missing or denied catalog is an error, never an empty candidate list',async()=>{
  const error={code:'42501',message:'Denied'};
  await assert.rejects(fetchVenueReviewCatalog(client({error})),value=>value===error);
  await assert.rejects(fetchVenueReviewCatalog(client({data:{payload:null}})),/missing or invalid/);
});
