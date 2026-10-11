// Read-only current-state report. No exports, local datasets or database writes.
import fs from 'node:fs';
import dotenv from 'dotenv';
import {getVenuePhone} from '../../src/services/venuePhone.js';
import {publicPriceReference} from '../../src/utils/venuePrice.js';
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const select='id,name,province,sport,price_summary,phone,phone_status,phone_sources,image,price_reference:raw_data->price_reference,image_kind:raw_data->imageKind,image_hash:raw_data->imageSha256';
const venues=[];
for(let offset=0;;offset+=1000){
 const url=new URL('/rest/v1/Facilities',env.VITE_SUPABASE_URL);
 url.searchParams.set('select',select);url.searchParams.set('order','id.asc');url.searchParams.set('offset',String(offset));url.searchParams.set('limit','1000');
 const response=await fetch(url,{headers:{apikey:env.VITE_SUPABASE_ANON_KEY,Authorization:`Bearer ${env.VITE_SUPABASE_ANON_KEY}`},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error(`Supabase read failed: HTTP ${response.status}`);
 const rows=await response.json();venues.push(...rows);if(rows.length<1000)break;
}
const counts={total:venues.length,priceMissing:0,phoneMissing:0,imageUnresolved:0,sourceImages:0,illustrations:0,emptyImageUrl:0,emptyPriceSummary:0,sourcePrices:0,estimatedPrices:0,completeWithIllustration:0,completeWithVenueImage:0,missingAny:0,missingPhoneAndImage:0};
const sports={},missingPrices=[],sample=[],all=[];
for(const v of venues){
 const price=Boolean(publicPriceReference(v.price_reference)),phone=Boolean(getVenuePhone(v));
 const real=Boolean(v.image&&v.image_hash&&['venue','candidate'].includes(v.image_kind));
 const illustration=Boolean(v.image&&v.image_hash&&v.image_kind==='illustrative'),image=real||illustration;
 counts.priceMissing+=!price;counts.phoneMissing+=!phone;counts.imageUnresolved+=!image;counts.sourceImages+=real;counts.illustrations+=illustration;
 counts.emptyImageUrl+=!v.image;counts.emptyPriceSummary+=!v.price_summary;
 counts.sourcePrices+=price&&v.price_reference.method==='source';counts.estimatedPrices+=price&&v.price_reference.method==='estimated';
 counts.completeWithIllustration+=price&&phone&&image;counts.completeWithVenueImage+=price&&phone&&real;
 counts.missingAny+=!price||!phone||!image;counts.missingPhoneAndImage+=!phone&&!image;
 sports[v.sport]||={total:0,priceMissing:0,phoneMissing:0,imageUnresolved:0};const s=sports[v.sport];s.total++;s.priceMissing+=!price;s.phoneMissing+=!phone;s.imageUnresolved+=!image;
 const row={id:v.id,name:v.name,province:v.province,missing:[...(!price?['price']:[]),...(!phone?['phone']:[]),...(!image?['image']:[])]};
 if(!price)missingPrices.push(row);if(!phone&&!image&&sample.length<12)sample.push(row);if(row.missing.length)all.push(row);
}
console.log(JSON.stringify({checkedAt:new Date().toISOString(),counts,sports,missingPrices,missingPhoneAndImageSamples:sample,...(process.argv.includes('--all')?{missingVenues:all}:{})},null,2));
