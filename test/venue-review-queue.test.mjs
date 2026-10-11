import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateChoices, topVenueChoices, venueReviewQueue, fetchVenueReviewRecords } from '../src/services/venueReviewQueue.js';
const candidates=[{id:'a',value:'0912345678',sourceUrl:'https://one.test'},{id:'b',value:'0912345678',sourceUrl:'https://two.test'},{id:'c',value:'0987654321',sourceUrl:'https://three.test'}];
test('top three prefer explicit identity evidence, keep ties deterministic and retain full bundle',()=>{
  const items=Array.from({length:5},(_,i)=>({id:String(i),value:'https://img.test/'+i,sourceUrl:'https://source.test/'+i,matchStatus:i===4?'name_address_candidate':'existing_source_requires_recheck',score:i===4?0.95:0.1}));
  const top=topVenueChoices(items,[],'image');
  assert.equal(top.length,3);assert.equal(top[0].id,'4');assert.equal(items.length,5);
  assert.deepEqual(top,topVenueChoices([...items].reverse(),[],'image'));
});
test('identical values merge sources, distinct values remain selectable',()=>{
  const choices=candidateChoices(candidates,[],'phone');
  assert.equal(choices.length,2);assert.equal(choices[0].sources.length,2);
});
test('queue separates review, multiple choices, missing sources and approved values',()=>{
  const venues=[{id:'one',phone:'0598370497'},{id:'two'},{id:'three',phone:'0912345678'}];
  const sources={one:{phone:candidates},three:{phone:[candidates[0]]}};
  const history=[{id:'1',facilityId:'three',field:'phone',status:'approve',data:{value:'0912345678',candidateId:'a'},createdAt:'2026-01-01'},
    {id:'2',facilityId:'three',field:'phone',status:'reject',data:{value:'0987654321',candidateId:'c'},createdAt:'2026-01-02'}];
  const queue=venueReviewQueue(venues,sources,history);
  assert.equal(queue[0].reviewTasks.phone.status,'choose');assert.equal(queue[0].reviewTasks.phone.reason,'invalid_phone');
  assert.equal(queue[1].reviewTasks.phone.status,'research');assert.equal(queue[2].reviewTasks.phone.status,'verified');
  assert.equal(venueReviewQueue([{id:'one'}],{one:{phone:[candidates[0]]}})[0].reviewTasks.phone.status,'review');
});
test('later approval supersedes rejection of the same candidate',()=>{
  const history=[{id:'1',field:'phone',status:'reject',data:{candidateId:'a'},createdAt:'2026-01-01'},
    {id:'2',field:'phone',status:'approve',data:{candidateId:'a'},createdAt:'2026-01-02'}];
  assert.equal(candidateChoices([candidates[0]],history,'phone').length,1);
});
test('review history errors propagate instead of creating a false empty queue',async()=>{
  const failure={code:'42501',message:'Denied'};
  const q={select(){return q},order(){return q},limit(){return q},abortSignal(){return Promise.resolve({error:failure})}};
  await assert.rejects(fetchVenueReviewRecords({from:()=>q}),error=>error===failure);
});
