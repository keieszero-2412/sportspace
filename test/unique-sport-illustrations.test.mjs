import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateSportIllustrations } from '../scripts/lib/unique-sport-illustrations.mjs';
const photo=(id,sport='football')=>({url:`https://photos.example.org/${id}.jpg`,sourceUrl:'https://photos.example.org/license',sha256:String(id).padStart(64,'0'),sport,kind:'photograph',locationFree:true,visuallyChecked:true,rightsConfirmed:true});
test('random assignment is without replacement and exact-sport, never fabricates on exhaustion',()=>{
  for(let iteration=0;iteration<20;iteration++){
    const result=allocateSportIllustrations([{id:'a',sport:'football'},{id:'b',sport:'football'},{id:'c',sport:'tennis'},{id:'d',sport:'football'}],[photo(1),photo(2)]);
    assert.equal(result.assigned.length,2);assert.equal(new Set(result.assigned.map(item=>item.photo.sha256)).size,2);
    assert.deepEqual(result.missing,['c','d']);assert.ok(result.assigned.every(item=>item.imageKind==='illustrative'));
  }
});
test('duplicate bytes, reserved photographs, unchecked locations and mock images are excluded',()=>{
  const result=allocateSportIllustrations([{id:'a',sport:'football'},{id:'b',sport:'football'}],
    [photo(1),{...photo(1),url:'https://photos.example.org/alias.jpg'},photo(2),{...photo(3),visuallyChecked:false},{...photo(4),locationFree:false},{...photo(5),kind:'mock'}],
    [{url:photo(2).url,sha256:photo(2).sha256}]);
  assert.equal(result.assigned.length,1);assert.deepEqual(result.missing,['b']);
});
