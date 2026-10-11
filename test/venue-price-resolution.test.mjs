import test from 'node:test';
import assert from 'node:assert/strict';
import {peakPrice,extractHourlyPrices,sourceSchedule,estimateSchedule,hourlyChoices,priceIdentityScore} from '../scripts/lib/venue-price-resolution.mjs';
test('peak uses nearest 10k',()=>{assert.equal(peakPrice(130000),160000);assert.equal(peakPrice(100000),120000);});
test('hourly extraction excludes persons, equipment and unknown units',()=>{
 assert.deepEqual(extractHourlyPrices('Giá thuê sân: 80.000 - 150.000đ/giờ')[0]?.min,80000);
 for(const text of ['Giá thuê sân: 80.000đ/lượt','Giá thuê vợt: 80.000đ/giờ','Giá: 80.000đ/người/giờ'])assert.equal(extractHourlyPrices(text).length,0);
});
test('published range is not claimed to be weekday/weekend evidence',()=>{assert.equal(sourceSchedule([{min:100000,max:250000,sourceUrl:'https://example.com'}]).scheduleAssumed,true);});
test('explicit weekday and weekend combine',()=>{const s=sourceSchedule([{min:80000,max:100000,dayType:'weekday',sourceUrl:'https://example.com/a'},{min:120000,max:150000,dayType:'weekend',sourceUrl:'https://example.com/b'}]);assert.equal(s.min,80000);assert.equal(s.max,150000);assert.equal(s.scheduleAssumed,false);});
test('estimates never mix sports or randomize IDs',()=>{
 const seeds=[{venue:{id:'a',sport:'Tennis',province:'HN',lat:21,lng:105},schedule:{min:100000,max:200000,sources:[{sourceUrl:'https://example.com'}]}}];
 assert.equal(estimateSchedule({id:'b',sport:'Bóng bàn'},seeds),null);
 assert.deepEqual(estimateSchedule({id:'b',sport:'Tennis',province:'HN',lat:20,lng:105},seeds),estimateSchedule({id:'c',sport:'Tennis',province:'HN',lat:20,lng:105},seeds));
});
test('half court and unknown-duration candidates cannot seed per-hour estimates',()=>{assert.equal(hourlyChoices({name:'Test'},[{min:100000,max:200000,basis:'half_court_hour',unitMinutes:60}]).length,0);});
test('generic names and wrong sport are excluded despite low threshold',()=>{
 assert.equal(priceIdentityScore({name:'CLB Bóng Bàn',sport:'Bóng bàn'},{sourceName:'CLB bóng bàn Ngọc Uyên',sourceUrl:'https://example.com'}),null);
 assert.equal(priceIdentityScore({name:'Sân bóng tennis Không quân',sport:'Bóng đá'},{sourceName:'Sân tennis Không Quân',sourceUrl:'https://example.com/san-tennis-nha-trang'}),null);
 assert.equal(priceIdentityScore({name:'Sân Bóng Rổ Nhà Thi Đấu ĐH Y Hà Nội',sport:'Bóng rổ'},{sourceName:'Sân bóng rổ Nhà thi đấu phường Mai Dịch',sourceUrl:'https://example.com'}),null);
});
test('mixed session rates and personal training cannot seed hourly rental',()=>{
 assert.equal(extractHourlyPrices('Giá thuê: Thuê chung bàn 30.000 VND/1 buổi Thuê riêng bàn 100.000 VND/giờ').length,0);
});
