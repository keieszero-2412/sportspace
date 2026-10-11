import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { topVenueChoices } from '../../src/services/venueReviewQueue.js';
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:'on',statement_timeout:30000}});
function imageKey(value){
  try{const url=new URL(value);url.hash='';for(const key of ['width','height','w','h','quality','q','utm_source','utm_medium','utm_campaign'])url.searchParams.delete(key);return url.href;}
  catch{return String(value||'');}
}
try{
  const venues=await sql`select to_jsonb(f.*)-'raw_data' as venue from public."Facilities" f order by id`;
  const [catalog]=await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
  const history=await sql`select id,"facilityId",field,status,data,"createdAt" from public."VenueDataReviews" where field='image'`;
  const current=new Map(), candidates=new Map(), sports=new Map(), licenses=new Map();
  const rows=venues.map(({venue})=>venue);
  for(const venue of rows){
    const key=imageKey(venue.image);if(key)current.set(key,(current.get(key)||0)+1);
    const sport=JSON.stringify(venue.sport||venue.sports||venue.category||null);sports.set(sport,(sports.get(sport)||0)+1);
    for(const candidate of catalog.payload.venues[venue.id]?.image||[]){
      const key=imageKey(candidate.value);if(!candidates.has(key))candidates.set(key,new Set());candidates.get(key).add(venue.id);
      const license=String(candidate.license||candidate.imageLicense||'unspecified');licenses.set(license,(licenses.get(license)||0)+1);
    }
  }
  const rating=venue=>Number(venue.google_rating??venue.rating)||0;
  const sorted=rows.sort((a,b)=>rating(b)-rating(a)||String(a.id).localeCompare(String(b.id)));
  console.log(JSON.stringify({total:rows.length,withRating:rows.filter(venue=>rating(venue)>0).length,
    withImageCandidates:rows.filter(venue=>catalog.payload.venues[venue.id]?.image?.length).length,
    withoutImageCandidates:rows.filter(venue=>!catalog.payload.venues[venue.id]?.image?.length).length,
    currentDuplicateGroups:[...current.values()].filter(count=>count>1).length,
    currentDuplicateVenues:[...current.values()].filter(count=>count>1).reduce((a,b)=>a+b,0),
    crossVenueCandidateDuplicates:[...candidates.values()].filter(ids=>ids.size>1).length,
    distinctCandidateImages:candidates.size,licenses:Object.fromEntries(licenses),sports:Object.fromEntries(sports),
    imageApprovals:history.filter(row=>row.status==='approve').length,
    highestRated:sorted.slice(0,8).map(venue=>({id:venue.id,name:venue.name,rating:rating(venue),
      choices:topVenueChoices(catalog.payload.venues[venue.id]?.image||[],history.filter(row=>row.facilityId===venue.id),'image')}))},null,2));
}finally{await sql.end({timeout:3});}
