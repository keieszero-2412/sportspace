import test from 'node:test';
import assert from 'node:assert/strict';
import {publicPriceReference,venuePriceLabel} from '../src/utils/venuePrice.js';
const price={min:130000,max:200000,peak:160000,method:'estimated',scheduleAssumed:true,checkoutPrice:false,basis:'court_hour',unitMinutes:60};
test('safe public price projection excludes private metadata',()=>{assert.equal(publicPriceReference({...price,verifiedBy:'private',peerSources:['private']}).verifiedBy,undefined);assert.equal(publicPriceReference({...price,peak:156000}),undefined);});
test('venue display shows only min to max without rate breakdown or estimate notes',()=>{
 for(const lang of ['vi','en']){const label=venuePriceLabel({price_reference:price},lang);for(const text of ['130.000','200.000'])assert.ok(label.includes(text));assert.doesNotMatch(label,/160\.000|ngày thường|cuối tuần|cao điểm|weekdays|weekends|peak|ước tính|estimated|assumed/i);}
 assert.equal(venuePriceLabel({price_reference:price},'vi'),'130.000đ – 200.000đ/giờ');
 assert.equal(venuePriceLabel({price_reference:price},'en'),'130.000đ – 200.000đ/hour');
 assert.equal(price.method,'estimated');assert.equal(price.scheduleAssumed,true);
});
test('legacy references and price labels remain compatible',()=>{assert.equal(venuePriceLabel({price_summary:'100.000đ/h'}),'100.000đ/h');assert.equal(publicPriceReference({...price,basis:'court_match'}),undefined);});
