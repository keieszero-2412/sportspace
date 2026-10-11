// Approve attributable photographs only; never certify an unrelated fallback as venue photography.
import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import crypto from 'node:crypto';
import { actualImageChoices,relaxedImageChoices,imageIdentity,inspectImage } from '../lib/venue-image-resolution.mjs';
import { venueReview } from '../../supabase/functions/sportspace/venueData.js';
const apply=process.argv.includes('--apply');
const relaxed=process.argv.includes('--relaxed');
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:apply?'off':'on',statement_timeout:30000}});
try{
  const [{payload}]=await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
  const rows=await sql`select to_jsonb(f.*) as venue from public."Facilities" f`;
  const history=await sql`select id,"facilityId",field,status,data,"createdAt" from public."VenueDataReviews" where field='image' order by "createdAt" desc`;
  const ratings=venue=>Number(venue.google_rating??venue.rating??venue.raw_data?.google_rating??venue.raw_data?.rating)||0;
  const venues=rows.map(row=>row.venue).sort((a,b)=>ratings(b)-ratings(a)||String(a.id).localeCompare(String(b.id)));
  const plans=venues.map(venue=>({venue,choices:relaxed?relaxedImageChoices(venue,payload.venues[venue.id]?.image||[],history.filter(row=>row.facilityId===venue.id)):actualImageChoices(payload.venues[venue.id]?.image||[],history.filter(row=>row.facilityId===venue.id))}));
  if(process.argv.includes('--verify')){
    const run=payload.imageResolution;
    if(!run)throw new Error('Image audit missing');
    const records=history.filter(row=>row.status==='approve'&&row.data?.metadata?.imageResolutionRun===run.id);
    const mismatches=records.filter(row=>venues.find(venue=>venue.id===row.facilityId)?.image!==row.data.value);
    const duplicateUrls=records.length-new Set(records.map(row=>imageIdentity(row.data.value))).size;
    const duplicateHashes=records.length-new Set(records.map(row=>row.data.metadata.imageSha256)).size;
    console.log(JSON.stringify({run,approvalRecords:records.length,currentMismatches:mismatches.length,duplicateUrls,duplicateHashes},null,2));
    if(!run.finished||mismatches.length||duplicateUrls||duplicateHashes||records.length!==run.approved)throw new Error('Image verification failed');
  }else if(process.argv.includes('--repair-initial-run')){
    if(!apply)throw new Error('Repair requires apply');
    const initial='a2b61732-5b4c-45b3-9a04-ebaf3878acb6';
    const records=history.filter(row=>row.data?.metadata?.imageResolutionRun===initial);
    let restored=0,revoked=0;
    for(const record of records){
      const candidates=payload.venues[record.facilityId]?.image||[];
      if(actualImageChoices(candidates).some(candidate=>candidate.id===record.data.candidateId))continue;
      await sql.begin(async tx=>{
        const [current]=await tx`select image,raw_data from public."Facilities" where id=${record.facilityId} for update`;
        if(current.raw_data?.imageResolutionRun===initial&&current.image===record.data.value){
          const prior=history.find(row=>row.facilityId===record.facilityId&&row.id!==record.id&&row.status==='approve'&&row.data.value===record.data.before);
          const raw={...(current.raw_data||{})};for(const key of Object.keys(record.data.metadata))delete raw[key];
          Object.assign(raw,prior?.data.metadata||{},{image:record.data.before});
          await tx`update public."Facilities" set image=${record.data.before},raw_data=${tx.json(raw)} where id=${record.facilityId}`;restored++;
        }
        await tx`update public."VenueDataReviews" set status='reject',data=data||${tx.json({operation:'reject',reason:'Automatic correction: source title match did not verify venue address; initial approval revoked'})}::jsonb where id=${record.id}`;revoked++;
      });
    }
    await sql`update public."VenueReviewCatalog" set payload=jsonb_set(payload,'{imageResolution}',${sql.json({id:initial,finished:false,stopped:true,restored,revoked,reason:'Source filter corrected before resuming'})}::jsonb),"updatedAt"=now() where id='venues'`;
    console.log(JSON.stringify({restored,revoked,retained:records.length-revoked}));
  }else if(!apply){
    console.log(JSON.stringify({total:venues.length,withRating:venues.filter(venue=>ratings(venue)>0).length,
      withAttributableChoices:plans.filter(plan=>plan.choices.length).length,withoutAttributableChoices:plans.filter(plan=>!plan.choices.length).length}));
  }else{
    const [actor]=await sql`select id from public."Users" where lower(email)='keieszero2412@gmail.com' and coalesce(role,raw_data->>'role')='admin'`;
    if(!actor)throw new Error('Admin missing');
    const run={id:crypto.randomUUID(),startedAt:new Date().toISOString(),approved:0,kept:0,missing:0,duplicates:0,unavailable:0,conflicts:0,processed:0,finished:false,
      method:relaxed?'User accepts 50 similarity threshold (not measured accuracy); keep existing checked photos; normalized URL/SHA256; uncertain images labeled candidate':'Highest venue rating first; source name/address match; user confirms usage rights; normalized URL and SHA256 duplicate checks; no fabricated fallback'};
    const owners=new Map(),hashOwners=new Map(),cache=new Map(),blockedImages=new Set();
    const previousChecks=payload.imageCheckResults||{};
    for(const [identity,result] of Object.entries(previousChecks))if(Date.now()-Date.parse(result.checkedAt)<86400000)cache.set(identity,result);
    // Reserve current images confirmed by an admin; do not steal their photograph for another venue.
    for(const venue of venues){
      const prior=history.find(row=>row.facilityId===venue.id&&row.status==='approve'&&row.data.value===venue.image);
      if(prior){try{owners.set(imageIdentity(venue.image),venue.id);}catch{}
        const hash=prior.data.metadata?.imageSha256||venue.raw_data?.imageSha256;if(hash)hashOwners.set(hash,venue.id);}
    }
    for(const plan of plans){
      const {venue,choices}=plan;let selected;
      const protectedCurrent=relaxed&&venue.raw_data?.imageSha256&&['venue','candidate'].includes(venue.raw_data?.imageKind)
        &&history.some(row=>row.facilityId===venue.id&&row.status==='approve'&&row.data.value===venue.image);
      if(protectedCurrent){run.kept++;run.processed++;continue;}
      for(const candidate of choices){
        const identity=imageIdentity(candidate.value);
        if(blockedImages.has(new URL(candidate.value).hostname)){run.unavailable++;continue;}
        if(owners.has(identity)&&owners.get(identity)!==venue.id){run.duplicates++;continue;}
        let checked=cache.get(identity);
        if(!cache.has(identity)){
          try{checked={...await inspectImage(candidate.value),checkedAt:new Date().toISOString()};cache.set(identity,checked);}
          catch(error){if(/image-http-(401|403|429)/.test(error.message))blockedImages.add(new URL(candidate.value).hostname);cache.set(identity,{error:error.message,checkedAt:new Date().toISOString()});checked=cache.get(identity);}
        }
        if(checked.error){run.unavailable++;continue;}
        if(hashOwners.has(checked.sha256)&&hashOwners.get(checked.sha256)!==venue.id){run.duplicates++;continue;}
        selected={candidate,checked,identity};break;
      }
      if(selected){
        const {candidate,checked,identity}=selected;
        const review=venueReview({facilityId:venue.id,id:candidate.id,key:`image-resolve-${run.id}-${candidate.id}`,
          field:'image',operation:'approve',expected:venue.image??null,value:candidate.value,sourceUrl:candidate.sourceUrl,
          evidence:relaxed?`User accepts low-confidence venue image match; similarity is not verified accuracy. ${candidate.evidence}`:candidate.evidence,identityConfirmed:true,rightsConfirmed:true,license:'Usage rights confirmed by project owner on 2026-10-11'},
          {uid:actor.id,role:'admin'},Date.now());
        Object.assign(review.metadata,{imageSha256:checked.sha256,imageResolutionRun:run.id,imageKind:relaxed&&candidate.identityConfidence==='user_accepted_50_similarity'?'candidate':'venue',imageMatchScore:candidate.score??null,imageIdentityConfidence:candidate.identityConfidence||'source_name_address',imageDuplicateCheck:'normalized_url_and_sha256',imageVenueRating:ratings(venue)});
        try{await sql`select public.review_venue_data(${actor.id},${sql.json(review)}::jsonb)`;run.approved++;owners.set(identity,venue.id);hashOwners.set(checked.sha256,venue.id);}
        catch(error){if(error.message?.includes('venue-data-changed'))run.conflicts++;else throw error;}
      }else run.missing++;
      run.processed++;
      if(run.processed%25===0||run.processed===plans.length){
        run.finished=run.processed===plans.length;run.updatedAt=new Date().toISOString();
        await sql`update public."VenueReviewCatalog" set payload=jsonb_set(payload,'{imageResolution}',${sql.json(run)}::jsonb),"updatedAt"=now() where id='venues'`;
        console.log(JSON.stringify(run));
      }
    }
    if(!run.finished){run.finished=true;run.updatedAt=new Date().toISOString();await sql`update public."VenueReviewCatalog" set payload=jsonb_set(payload,'{imageResolution}',${sql.json(run)}::jsonb),"updatedAt"=now() where id='venues'`;console.log(JSON.stringify(run));}
    await sql`update public."VenueReviewCatalog" set payload=jsonb_set(payload,'{imageCheckResults}',${sql.json(Object.fromEntries(cache))}::jsonb),"updatedAt"=now() where id='venues'`;
  }
}finally{await sql.end({timeout:3});}
