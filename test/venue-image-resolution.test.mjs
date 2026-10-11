import test from 'node:test';
import assert from 'node:assert/strict';
import { imageIdentity,actualImageChoices,relaxedImageChoices,relaxedImageScore } from '../scripts/lib/venue-image-resolution.mjs';
test('image identity collapses sizing variants and Wikimedia thumbnails, not distinct media IDs',()=>{
  assert.equal(imageIdentity('https://photos.example.org/a.jpg?w=100#x'),imageIdentity('https://photos.example.org/a.jpg?w=200'));
  assert.equal(imageIdentity('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/File.jpg/800px-File.jpg'),'https://upload.wikimedia.org/wikipedia/commons/a/ab/File.jpg');
  assert.notEqual(imageIdentity('https://photos.example.org/?media_id=1'),imageIdentity('https://photos.example.org/?media_id=2'));
  assert.throws(()=>imageIdentity('http://photos.example.org/a.jpg'));
  assert.throws(()=>imageIdentity('https://user:password@photos.example.org/a.jpg'));
});
test('explicit relaxed mode accepts identifying-name evidence but rejects unrelated names, sports and mock images',()=>{
  const venue={name:'Sân Pickleball Thanh Am',sport:'Pickleball',address:'194 Thanh Am Hà Nội'};
  const candidate={id:'weak',value:'https://photos.example.org/court.jpg',sourceUrl:'https://directory.example.org/venue',evidence:'Pickleball Thanh Am Facebook',matchStatus:'search_title_matches_exact_name_address_query'};
  assert.ok(relaxedImageScore(venue,candidate)>=.5);assert.equal(actualImageChoices([candidate]).length,0);
  assert.equal(relaxedImageChoices(venue,[candidate])[0].identityConfidence,'user_accepted_50_similarity');
  assert.equal(relaxedImageChoices(venue,[{...candidate,evidence:'Unrelated court'}]).length,0);
  assert.equal(relaxedImageChoices(venue,[{...candidate,evidence:'Bóng đá Thanh Am'}]).length,0);
  assert.equal(relaxedImageChoices(venue,[{...candidate,value:'https://photos.example.org/mock.jpg'}]).length,0);
  const rejection={id:'r',field:'image',status:'reject',createdAt:'2026-10-11',data:{candidateId:'weak',reason:'Admin rejected identity'}};
  assert.equal(relaxedImageChoices(venue,[candidate],[rejection]).length,0);
  assert.equal(relaxedImageChoices(venue,[candidate],[{...rejection,data:{...rejection.data,reason:'Automatic correction: source title match did not verify venue address'}}]).length,1);
});
test('only attributable non-mock images qualify; rejected candidates remain rejected',()=>{
  const candidate={id:'real',value:'https://photos.example.org/court.jpg',sourceUrl:'https://directory.example.org/venue',evidence:'Venue name/address',matchStatus:'source_matches_name_and_address'};
  assert.equal(actualImageChoices([candidate]).length,1);
  assert.equal(actualImageChoices([{...candidate,matchStatus:'search_title_matches_exact_name_address_query'}]).length,0);
  assert.equal(actualImageChoices([{...candidate,value:'https://photos.example.org/logo.png'}]).length,0);
  assert.equal(actualImageChoices([candidate],[{field:'image',status:'reject',createdAt:'2026-10-11',id:'r',data:{candidateId:'real'}}]).length,0);
});
