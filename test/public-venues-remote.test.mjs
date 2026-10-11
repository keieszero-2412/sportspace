import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publicPriceReference} from '../src/utils/venuePrice.js';
const source=fs.readFileSync(new URL('../src/services/publicVenues.js',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replaceAll('export async function','async function');
function service(rows,error=null,counts={Facilities:0,Courts:0}){
  const supabase={from(table){const q={select(){return q},order(){return q},limit(){return q},eq(){return q},gt(){return q},or(){return q},then(ok,bad){return Promise.resolve({data:rows,error,count:counts[table]}).then(ok,bad)}};return q}};
  return new Function('supabase','getDistance','publicPriceReference',source+';return {listPublicVenues,publicCatalogue};')(supabase,()=>0,publicPriceReference);
}
test('empty Supabase remains empty rather than exposing outdated bundled data',async()=>{
  const api=service([]);
  assert.deepEqual((await api.listPublicVenues()).items,[]);
  const catalog=await api.publicCatalogue();assert.equal(catalog.totalVenues,0);assert.equal(catalog.totalCourts,0);
});
test('schema and permission errors are preserved after local fallback removal',async()=>{
  for(const code of ['PGRST205','42501']){
    const error={code,message:'Unavailable'},api=service([],error);
    await assert.rejects(api.listPublicVenues(),value=>value===error);
    await assert.rejects(api.publicCatalogue(),value=>value===error);
  }
});
test('Supabase public fields and rating projection are preserved',async()=>{
  const api=service([{id:'remote-1',name:'Remote court',status:'active',image:'https://example.test/current.jpg',imported_google_rating:4.8,raw_data:{private:'Never expose'}}]);
  const result=await api.listPublicVenues();assert.equal(result.items[0].google_rating,4.8);assert.equal(result.items[0].raw_data,undefined);
});
test('illustrative image marker is projected without exposing private metadata',async()=>{
  const api=service([{id:'remote-illustration',status:'active',imported_imageKind:'illustrative',raw_data:{private:'secret'}}]);
  const result=await api.listPublicVenues();assert.equal(result.items[0].image_kind,'illustrative');assert.equal(result.items[0].raw_data,undefined);
});
test('uncertain venue source marker is kept distinct from an illustration',async()=>{
  const api=service([{id:'remote-candidate',status:'active',imported_imageKind:'candidate',raw_data:{private:'secret'}}]);
  const result=await api.listPublicVenues();assert.equal(result.items[0].image_kind,'candidate');assert.equal(result.items[0].raw_data,undefined);
});
test('only bounded public price metadata reaches catalogue',async()=>{
 const api=service([{id:'priced',status:'active',imported_price_reference:{min:100000,max:200000,peak:120000,method:'estimated',basis:'court_hour',unitMinutes:60,checkoutPrice:false,verifiedBy:'secret'}}]);
 const {items}=await api.listPublicVenues();assert.equal(items[0].price_reference.min,100000);assert.equal(items[0].price_reference.verifiedBy,undefined);
});
