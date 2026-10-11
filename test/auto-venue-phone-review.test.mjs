// Synthetic fixtures are confined to offline tests; production reads Supabase and live pages only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readPhoneContacts, strictPhoneMatch, loosePhoneMatch, phoneDecisions } from '../scripts/lib/auto-venue-phone-review.mjs';
const venue = {id:'unit-venue',name:'Sân Pickleball Hoa Sen',address:'25 Nguyễn Trãi, Thanh Xuân, Hà Nội',province:'Hà Nội',sport:'Pickleball',phone:null};
const contact = {name:'Sân Pickleball Hoa Sen',address:venue.address,phone:'0902345678',url:'https://sanpick.com/unit-test-only',evidence:'Điện thoại: 0902345678',checkedAt:'2026-01-01'};
test('phone auto-review requires live venue-specific name, address, number and excludes platform contacts',()=>{
  assert.equal(strictPhoneMatch(venue,contact),true);
  for (const patch of [{name:'Sân Pickleball Sen Xanh'},{address:'26 Nguyễn Trãi, Thanh Xuân, Hà Nội'},{phone:'0598370497'},{phone:'0316334961'},{phone:'0816996839'}])
    assert.equal(strictPhoneMatch(venue,{...contact,...patch}),false);
});
test('auto-review skips ambiguous identities, conflicting numbers, shared contacts and previous decisions',()=>{
  assert.equal(phoneDecisions([venue],[contact]).decisions.length,1);
  assert.equal(phoneDecisions([venue,{...venue,id:'duplicate'}],[contact]).decisions.length,0);
  assert.equal(phoneDecisions([venue],[contact,{...contact,phone:'0902345679'}]).decisions.length,0);
  assert.equal(phoneDecisions([venue],[contact],[{facilityId:venue.id,field:'phone',status:'reject',data:{value:contact.phone}}]).decisions.length,0);
  assert.equal(phoneDecisions([{...venue,phone:contact.phone}],[contact],[{facilityId:venue.id,field:'phone',status:'approve',data:{value:contact.phone}}]).decisions.length,0);
  const other={...venue,id:'other',name:'Sân Pickleball Hướng Dương',address:'35 Lê Văn Lương, Thanh Xuân, Hà Nội'};
  assert.equal(phoneDecisions([venue,other],[contact,{...contact,name:other.name,address:other.address}]).decisions.length,0);
});
test('structured contacts belong to the venue entity, never website-level organization',()=>{
  const html=`<script type="application/ld+json">${JSON.stringify([{'@type':'LocalBusiness',name:contact.name,address:contact.address,telephone:contact.phone},{'@type':'Organization',name:'Website',telephone:'0902345679'}])}</script>`;
  const records=readPhoneContacts({url:contact.url,html,retrievedAt:contact.checkedAt});
  assert.equal(records.length,1);assert.equal(records[0].phone,contact.phone);assert.equal(records[0].address,contact.address);
});
test('public descriptive telephone is usable, login-only widget and hidden scripts are not',()=>{
  const page={url:'https://www.sporta.vn/san/unit-test-only',retrievedAt:contact.checkedAt};
  const header=`<main><h1>${contact.name}</h1>`;
  assert.equal(readPhoneContacts({...page,html:`${header}<p>Địa chỉ: ${contact.address} Quy mô: 2 sân Số điện thoại liên hệ: ${contact.phone} Giá thuê sân: 100.000đ</p></main>`})[0].phone,contact.phone);
  assert.equal(readPhoneContacts({...page,html:`${header}<p>Đăng nhập để xem số điện thoại</p><script>const telephone='${contact.phone}'</script></main>`}).length,0);
});
test('50-percent similarity admits weak candidates but never fabricates phones or uses province-only matches',()=>{
  const weak={...contact,address:'26 Nguyễn Trãi, Hà Nội'};
  assert.equal(strictPhoneMatch(venue,weak),false);
  assert.ok(loosePhoneMatch(venue,weak)>=.5);
  for(const patch of [{phone:'0598370497'},{phone:'0816996839'},{address:'25 Nguyễn Trãi, Đà Nẵng'},
    {address:'Hà Nội'},{name:'Sân Pickleball Hoàng Gia'},{name:'Demo test Hoa Sen'}])
    assert.equal(loosePhoneMatch(venue,{...contact,...patch}),null);
});
test('table phone rows use explicit geographic page context and exclude website hotline',()=>{
  const html='<main><h1>Các sân Pickleball Hà Nội</h1><table><tr><th>#</th><th>Sân</th><th>Địa chỉ</th><th>Điện thoại</th></tr><tr><td>1</td><td>Hoa Sen</td><td>25 Nguyễn Trãi</td><td>0902345678</td></tr></table></main><footer>Hotline 0816996839</footer>';
  const records=readPhoneContacts({url:'https://belo.vn/unit-test-only',html,retrievedAt:contact.checkedAt});
  assert.equal(records.length,1);assert.equal(records[0].address,'25 Nguyễn Trãi, Hà Nội');assert.equal(records[0].phone,contact.phone);
});
test('province labeling differences require particularly strong street and venue evidence',()=>{
  assert.ok(loosePhoneMatch({...venue,province:'Ninh Bình'},contact)>=.5);
  assert.equal(loosePhoneMatch({...venue,province:'Ninh Bình'},{...contact,address:'25 Nguyễn Trãi, Đà Nẵng'}),null);
});
