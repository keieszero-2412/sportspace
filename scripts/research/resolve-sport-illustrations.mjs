import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import crypto from 'node:crypto';
import { imageIdentity,inspectImage } from '../lib/venue-image-resolution.mjs';
import { allocateSportIllustrations } from '../lib/unique-sport-illustrations.mjs';
import { venueReview } from '../../supabase/functions/sportspace/venueData.js';
import { reviewCoverage } from '../../src/services/venueReviewCoverage.js';
const apply=process.argv.includes('--apply'),register=process.argv.some(arg=>arg.startsWith('--checked-photo='));
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:apply||register?'off':'on',statement_timeout:30000}});
try{
  if(register){
    // Flag is an explicit operator attestation after viewing these exact images;
    // the script never infers that a photograph is visually location-free.
    if(!process.argv.includes('--operator-confirmed-visual-review'))throw new Error('Visual review attestation required');
    const additions=[];
    for(const arg of process.argv.filter(arg=>arg.startsWith('--checked-photo='))){
      const [sport,url,sourceUrl]=arg.slice(16).split('|');
      const image=new URL(url),source=new URL(sourceUrl);
      if(image.hostname!=='images.pexels.com'||source.hostname!=='www.pexels.com'||!source.pathname.startsWith('/photo/')
        ||!source.pathname.includes(image.pathname.match(/\/photos\/(\d+)\//)?.[1]||'invalid'))throw new Error('Source/photo mismatch');
      imageIdentity(url);imageIdentity(sourceUrl);if(!sport)throw new Error('Sport required');
      additions.push({id:crypto.createHash('sha256').update(imageIdentity(url)).digest('hex').slice(0,24),sport,url,sourceUrl,
        ...await inspectImage(url),kind:'photograph',locationFree:true,visuallyChecked:true,rightsConfirmed:true,
        license:'Pexels License https://www.pexels.com/license/',checkedAt:new Date().toISOString()});
    }
    await sql.begin(async tx=>{
      const [{payload}]=await tx`select payload from public."VenueReviewCatalog" where id='venues' for update`;
      const pool=payload.sportIllustrationPool||[];
      for(const photo of additions)if(!pool.some(item=>item.id===photo.id||item.sha256===photo.sha256))pool.push(photo);
      await tx`update public."VenueReviewCatalog" set payload=jsonb_set(payload,'{sportIllustrationPool}',${tx.json(pool)}::jsonb),"updatedAt"=now() where id='venues'`;
      console.log(JSON.stringify({registered:additions.length,pool:pool.length}));
    });
  }else{
    const [{payload}]=await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
    if(apply&&(!payload.imageResolution?.finished||!payload.imageSearch?.finished))throw new Error('Finish venue-source research and approval before fallback');
    const rows=await sql`select id,name,address,sport,image,raw_data,coalesce(google_rating,rating)::float as rating from public."Facilities" order by coalesce(google_rating,rating) desc nulls last,id`;
    const reserved=rows.flatMap(row=>{try{imageIdentity(row.image);return[{url:row.image,sha256:row.raw_data?.imageSha256}];}catch{return[];}});
    const missing=rows.filter(row=>!row.raw_data?.imageSha256);
    const plan=allocateSportIllustrations(missing,payload.sportIllustrationPool||[],reserved);
    if(process.argv.includes('--verify')){
      const run=payload.imageIllustrationResolution;if(!run?.finished)throw new Error('Illustration resolution incomplete');
      const illustrations=rows.filter(row=>row.raw_data?.imageIllustrationRun===run.id);
      const checked=rows.filter(row=>row.raw_data?.imageSha256);
      const duplicateUrls=checked.length-new Set(checked.map(row=>imageIdentity(row.image))).size;
      const duplicateHashes=checked.length-new Set(checked.map(row=>row.raw_data.imageSha256)).size;
      const invalid=illustrations.filter(row=>!payload.sportIllustrationPool.some(photo=>photo.sha256===row.raw_data.imageSha256&&photo.sport===row.sport&&photo.url===row.image&&photo.locationFree&&photo.visuallyChecked));
      console.log(JSON.stringify({run,total:rows.length,checkedVenuePhotos:checked.filter(row=>row.raw_data.imageKind!=='illustrative').length,illustrations:illustrations.length,remaining:missing.length,duplicateUrls,duplicateHashes,invalidIllustrations:invalid.length},null,2));
      if(illustrations.length!==run.assigned||invalid.length||duplicateUrls||duplicateHashes)throw new Error('Illustration verification failed');
    }else if(!apply)console.log(JSON.stringify({missingVenues:missing.length,pool:payload.sportIllustrationPool?.length||0,canAssign:plan.assigned.length,remaining:plan.missing.length}));
    else{
      const [actor]=await sql`select id from public."Users" where lower(email)='keieszero2412@gmail.com' and coalesce(role,raw_data->>'role')='admin'`;
      if(!actor)throw new Error('Admin missing');
      const run={id:crypto.randomUUID(),assigned:0,conflicts:0,remaining:plan.missing.length,finished:false};
      for(const item of plan.assigned){
        const venue=rows.find(row=>row.id===item.venueId),photo=item.photo;
        const checked=await inspectImage(photo.url);if(checked.sha256!==photo.sha256)throw new Error('Illustration changed after visual review');
        const review=venueReview({facilityId:venue.id,id:photo.id,key:`illustrate-${run.id}-${photo.id}`,field:'image',operation:'approve',expected:venue.image??null,value:photo.url,sourceUrl:photo.sourceUrl,
          evidence:'User authorized a real sport illustration only after venue-image research; not a photograph of this specific venue. Visually checked: no specific location identifiers.',identityConfirmed:true,rightsConfirmed:true,license:photo.license},
          {uid:actor.id,role:'admin'},Date.now());
        Object.assign(review.metadata,{imageKind:'illustrative',imageSha256:photo.sha256,imageIllustrationRun:run.id,imageIdentityConfidence:'illustration_not_venue_identity',imageSport:photo.sport,imageLocationFree:true});
        try{
          await sql.begin(async tx=>{
            // Serialize allocation with row locks; re-check all current hashes
            // so another admin cannot assign the same photo concurrently.
            await tx`select id from public."VenueReviewCatalog" where id='venues' for update`;
            const [duplicate]=await tx`select id from public."Facilities" where id<>${venue.id} and (image=${photo.url} or raw_data->>'imageSha256'=${photo.sha256}) limit 1`;
            if(duplicate)throw new Error('illustration-already-assigned');
            await tx`select public.review_venue_data(${actor.id},${tx.json(review)}::jsonb)`;
          });run.assigned++;
        }catch(error){if(/venue-data-changed|illustration-already-assigned/.test(error.message))run.conflicts++;else throw error;}
      }
      run.remaining+=run.conflicts;run.finished=true;run.checkedAt=new Date().toISOString();
      await sql.begin(async tx=>{
        const [{payload:current}]=await tx`select payload from public."VenueReviewCatalog" where id='venues' for update`;
        const coverage=reviewCoverage(rows,current.venues);
        const totals=Object.fromEntries(Object.entries(coverage.fields).map(([field,value])=>[field,{venues:value.venues,candidates:value.candidates}]));
        await tx`update public."VenueReviewCatalog" set payload=jsonb_set(jsonb_set(jsonb_set(payload,'{imageIllustrationResolution}',${tx.json(run)}::jsonb),'{coverage}',${tx.json(coverage)}::jsonb),'{totals}',${tx.json(totals)}::jsonb),"updatedAt"=now() where id='venues'`;
      });
      console.log(JSON.stringify(run));
    }
  }
}finally{await sql.end({timeout:3});}
