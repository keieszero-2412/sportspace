import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {transform} from 'esbuild';
import {bulkPhonePlan,usablePhoneCandidate} from '../scripts/lib/bulk-phone-plan.mjs';
import {getVenuePhone} from '../src/services/venuePhone.js';
const venue={id:'unit-test-only',phone:null,phone_status:null};
const first={id:'first',value:'0902345678',sourceUrl:'https://sanpick.com/unit-test-only',evidence:'Offline synthetic test fixture',score:.5};
const second={...first,id:'second',value:'0902345679',score:.95};
test('blanket approval records all candidates but applies only a single highest-ranked primary last',()=>{
  const result=bulkPhonePlan(venue,[first,second]);
  assert.equal(result.action,'approve');assert.equal(result.selected.id,second.id);
  assert.deepEqual(result.candidates.map(item=>item.id),['first','second']);
});
test('already approved current phone is preferred and duplicate source IDs do not produce double reviews',()=>{
  const history=[{id:'history',field:'phone',status:'approve',data:{value:first.value,candidateId:first.id},createdAt:'2026-10-11'}];
  const result=bulkPhonePlan({...venue,phone:first.value,phone_status:'sourced'},[first,first,second],history);
  assert.equal(result.selected.value,first.value);
  assert.deepEqual(result.candidates.map(item=>item.id),['second','first']);
  assert.equal(bulkPhonePlan({...venue,phone:first.value,phone_status:'sourced'},[first],history).action,'keep');
});
test('invalid numbers, missing evidence, mock hostnames and quarantined contacts cannot be approved',()=>{
  for(const patch of [{value:'0598370497'},{value:'0316334961'},{value:'0816996839'},
    {sourceUrl:'https://example.com/fixture'},{sourceUrl:'https://venue.test/fixture'},{sourceUrl:'javascript:alert(1)'},{evidence:''}])
    assert.equal(usablePhoneCandidate({...first,...patch}),false);
  assert.equal(bulkPhonePlan(venue,[]).action,'hide');
});
test('explicit all-candidate approval supersedes prior rejections, not just the top three choices',()=>{
  const candidates=Array.from({length:5},(_,index)=>({...first,id:`choice-${index}`,value:`090234567${index}`,score:index/5}));
  const result=bulkPhonePlan(venue,candidates,[{field:'phone',status:'reject',data:{candidateId:'choice-0'},createdAt:'2026-10-11'}]);
  assert.equal(result.candidates.length,5);
});
test('hidden phone is absent from public UI, while sourced phone and legacy pending status remain compatible',async()=>{
  const source=fs.readFileSync(new URL('../src/components/VenuePhone.jsx',import.meta.url),'utf8').replace(/^import[^\n]*\n/gm,'').replace('export default function','function');
  const {code}=await transform(source,{loader:'jsx'});
  const Component=new Function('React','Phone','getVenuePhone',`${code};return VenuePhone;`)(React,()=>null,getVenuePhone);
  const render=phone=>renderToStaticMarkup(React.createElement(Component,{venue:phone}));
  const phone={phone:first.value,phone_status:'sourced',phone_sources:[{phone:first.value,url:first.sourceUrl}]};
  assert.match(render(phone),/tel:0902345678/);
  assert.equal(render({...phone,phone_status:'hidden_no_source'}),'');
  assert.match(render({...phone,phone_status:'unverified'}),/Chưa xác minh/);
});
