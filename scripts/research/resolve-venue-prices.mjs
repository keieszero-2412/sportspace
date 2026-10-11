import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import crypto from 'node:crypto';
import {venueReview} from '../../supabase/functions/sportspace/venueData.js';
import {hourlyChoices,sourceSchedule,estimateSchedule,peakPrice} from '../lib/venue-price-resolution.mjs';
const apply=process.argv.includes('--apply');
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:apply?'off':'on',statement_timeout:30000}});
async function courtPriceDigest(){const [row]=await sql`select count(*)::int as count,md5(coalesce(string_agg(jsonb_build_array(id,"basePrice",price_day,price_night,price_weekend)::text,'' order by id),'')) as hash from public."Courts"`;return row;}
try{
 const venues=await sql`select id,name,address,province,sport,lat,lng,price_summary,raw_data->'price_reference' as reference from public."Facilities" order by id`;
 if(process.argv.includes('--verify')){
  const [{run}]=await sql`select payload->'priceBulkResolution' as run from public."VenueReviewCatalog" where id='venues'`;
  const relevant=venues.filter(v=>v.reference?.runId===run?.id);
  const invalid=relevant.filter(v=>v.reference.peak!==peakPrice(v.reference.min)||v.reference.checkoutPrice!==false||v.reference.basis!=='court_hour'||v.reference.max<v.reference.min);
  const courts=await courtPriceDigest(),courtPricesUnchanged=courts.hash===run?.courtPriceBaseline?.hash&&courts.count===run?.courtPriceBaseline?.count;
  const buckets=new Map();for(const v of relevant){const key=`${v.sport}:${v.reference.min}:${v.reference.max}`;buckets.set(key,(buckets.get(key)||0)+1);}
  console.log(JSON.stringify({run,total:venues.length,updated:relevant.length,invalid:invalid.length,courtPricesUnchanged,
   source:relevant.filter(v=>v.reference.method==='source').length,estimated:relevant.filter(v=>v.reference.method==='estimated').length,
   calendarAttested:relevant.filter(v=>v.reference.method==='source'&&v.reference.scheduleAssumed===false).length,
   largestRepeatedPriceGroups:[...buckets].sort((a,b)=>b[1]-a[1]).slice(0,5)}));
  if(!run?.finished||invalid.length||relevant.length!==run.updated||!courtPricesUnchanged)throw new Error('Price verification failed');
 }else{
  const [{payload}]=await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
  const history=await sql`select "facilityId",status,data from public."VenueDataReviews" where field='price_summary' order by "createdAt" desc`;
  const byVenue=new Map();for(const row of history){if(!byVenue.has(row.facilityId))byVenue.set(row.facilityId,[]);byVenue.get(row.facilityId).push(row);}
  const seeds=venues.flatMap(venue=>{const schedule=sourceSchedule(hourlyChoices(venue,payload.venues[venue.id]?.price_summary||[],byVenue.get(venue.id)||[]));return schedule?[{venue,schedule}]:[];});
  const sources=new Map(seeds.map(s=>[s.venue.id,s.schedule]));
  const marketSeeds=(payload.priceMarketReferences||[]).filter(r=>r.externalMarket===true&&r.basis==='court_hour'&&r.unitMinutes===60&&Number.isSafeInteger(r.min)&&Number.isSafeInteger(r.max)&&r.min>0&&r.max>=r.min).map(r=>{
   const local=venues.filter(v=>v.sport===r.sport&&v.province===r.province&&v.lat!=null&&v.lng!=null&&Number.isFinite(Number(v.lat))&&Number.isFinite(Number(v.lng)));
   // A province cohort centre is an interpolation anchor, NOT this source
   // venue's geolocation. Never write it into Facilities.lat/lng.
   return {venue:{id:`market:${r.id}`,sport:r.sport,province:r.province,lat:local.length?local.reduce((n,v)=>n+Number(v.lat),0)/local.length:null,lng:local.length?local.reduce((n,v)=>n+Number(v.lng),0)/local.length:null},schedule:sourceSchedule([r])};
  });
  const plans=venues.map(venue=>({venue,schedule:sources.get(venue.id)||estimateSchedule(venue,[...seeds,...marketSeeds])}));
  const sports={};for(const {venue,schedule} of plans){sports[venue.sport]||={source:0,estimated:0,unresolved:0,pairs:new Set()};const s=sports[venue.sport];s[schedule?.method||'unresolved']++;if(schedule)s.pairs.add(`${schedule.min}:${schedule.max}`);}
  const coverage=Object.fromEntries(Object.entries(sports).map(([sport,s])=>[sport,{...s,pairs:s.pairs.size}]));
  console.log(JSON.stringify({mode:apply?'apply':'audit',coverage,samples:seeds.filter(s=>s.venue.sport!=='Pickleball').map(s=>({id:s.venue.id,name:s.venue.name,sport:s.venue.sport,min:s.schedule.min,max:s.schedule.max,assumed:s.schedule.scheduleAssumed,sources:s.schedule.sources})),unresolved:plans.filter(p=>!p.schedule).map(p=>({id:p.venue.id,name:p.venue.name,sport:p.venue.sport}))},null,2));
  if(apply){
   if(!payload.priceResearch?.finished)throw new Error('Finish source research first');
   const [actor]=await sql`select id from public."Users" where lower(email)='keieszero2412@gmail.com' and coalesce(role,raw_data->>'role')='admin'`;
   if(!actor)throw new Error('Authorized admin profile missing');
   const run={id:crypto.randomUUID(),startedAt:new Date().toISOString(),coverage,updated:0,concurrentSkips:0,finished:false,checkoutPricesChanged:false,courtPriceBaseline:await courtPriceDigest()};
   const active=plans.filter(p=>p.schedule);
   for(let offset=0;offset<active.length;offset+=100){
    const batch=active.slice(offset,offset+100).map(({venue,schedule})=>{
     const source=schedule.sources[0];const evidence=schedule.method==='source'?
      `Public venue price; similarity threshold 50 is not measured accuracy. ${schedule.scheduleAssumed?'Weekday=min and weekend=max are user-requested assumptions, not attested calendar tariffs.':''}\n${schedule.sources.map(s=>s.evidence).join('\n')}`:
      `ESTIMATED, not a quote from this venue. Inverse-distance weighted prices from ${schedule.sources.length} same-sport venues; weekday=min/weekend=max assumption. Peer IDs: ${schedule.sources.map(s=>s.facilityId).join(',')}`;
     const review=venueReview({facilityId:venue.id,id:crypto.createHash('sha256').update(venue.id+run.id).digest('hex').slice(0,24),key:`bulk-price-${run.id}-${venue.id}`,field:'price_summary',operation:'approve',identityConfirmed:true,
      expected:venue.price_summary,min:schedule.min,max:schedule.max,basis:'court_hour',unitMinutes:60,sourceUrl:source.sourceUrl,evidence},
      {uid:actor.id,role:'admin'},Date.now());
     Object.assign(review.metadata.price_reference,{method:schedule.method,estimated:schedule.method==='estimated',scheduleAssumed:schedule.scheduleAssumed,
      weekday:schedule.min,weekend:schedule.max,peak:schedule.peak,peakFormula:'round(weekday * 1.2 / 10000) * 10000',runId:run.id,
      peerSources:schedule.sources.map(s=>({facilityId:s.facilityId||venue.id,sourceUrl:s.sourceUrl,min:s.min,max:s.max,weight:s.weight??null,geographicResolution:String(s.facilityId||'').startsWith('market:')?'province_cohort_centre':'venue'})),localPeers:schedule.localPeers??null,
      sampleCount:schedule.sources.length,confidenceNote:'Similarity threshold 50 is not measured accuracy. Sparse cohorts and historical sources may be unreliable.'});
     review.metadata.price_reference.peakComputed=true;
     return {id:venue.id,expected:venue.price_summary??null,review};
    });
    const result=await sql.begin(async tx=>{
     await tx`set local lock_timeout='5s'`;
     await tx.unsafe(`create or replace function pg_temp.resolve_price_batch(actor text,plans jsonb) returns jsonb language plpgsql as $body$
      declare item jsonb; before_row jsonb; after_row jsonb; updated int:=0; skipped int:=0;
      begin
       for item in select value from jsonb_array_elements(plans) loop
        select to_jsonb(f.*) into before_row from public."Facilities" f where id=item->>'id' for update;
        if before_row is null then raise exception 'facility-not-found';end if;
        if before_row->'price_summary' is distinct from item->'expected' then skipped:=skipped+1;continue;end if;
        if item->'review'->>'field'<>'price_summary' or item->'review'->>'operation'<>'approve' then raise exception 'price-only-batch';end if;
        perform public.review_venue_data(actor,item->'review');
        select to_jsonb(f.*) into after_row from public."Facilities" f where id=item->>'id';
        if before_row-array['price_summary','raw_data'] is distinct from after_row-array['price_summary','raw_data'] then raise exception 'unrelated-native-field-changed';end if;
        if coalesce(nullif(before_row->'raw_data','null'::jsonb),'{}'::jsonb)-array['price_summary','price_reference'] is distinct from coalesce(nullif(after_row->'raw_data','null'::jsonb),'{}'::jsonb)-array['price_summary','price_reference'] then raise exception 'unrelated-metadata-changed';end if;
        updated:=updated+1;
       end loop;
       return jsonb_build_object('updated',updated,'concurrentSkips',skipped);
      end $body$`);
     const [{stats}]=await tx`select pg_temp.resolve_price_batch(${actor.id},${tx.json(batch)}::jsonb) as stats`;
     const next={...run,updated:run.updated+stats.updated,concurrentSkips:run.concurrentSkips+stats.concurrentSkips,finished:offset+100>=active.length,updatedAt:new Date().toISOString()};
     await tx`update public."VenueReviewCatalog" set payload=jsonb_set(payload,'{priceBulkResolution}',${tx.json(next)}::jsonb),"updatedAt"=now() where id='venues'`;
     return next;
    });Object.assign(run,result);console.log(JSON.stringify({processed:Math.min(offset+100,active.length),...run}));
   }
  }
 }
}finally{await sql.end({timeout:3});}
