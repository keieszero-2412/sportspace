import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:'on',statement_timeout:30000}});
try{
  const venues=await sql`select id,name,address,province from public."Facilities" order by id`;
  const [catalog]=await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
  const [approvals]=await sql`select count(distinct f.id)::int as verified_current_phones from public."Facilities" f join public."VenueDataReviews" r
    on r."facilityId"=f.id and r.field='phone' and r.status='approve' and r.data->>'value'=f.phone`;
  const missing=venues.filter(venue=>!catalog.payload.venues[venue.id]?.phone?.length);
  const provinces=[...new Set(venues.map(venue=>venue.province))];
  console.log(JSON.stringify({totalVenues:venues.length,phones:catalog.payload.totals.phone,withoutCandidate:missing.length,
    ...approvals,liveResearch:catalog.payload.phoneResearch?{...catalog.payload.phoneResearch,venueStatus:undefined,pageResults:undefined}:null,
    cachedResearch:catalog.payload.archivedPhoneResearch,
    otherFields:{image:catalog.payload.totals.image,price:catalog.payload.totals.price_summary},
    missingSample:process.argv.includes('--sample')?provinces.map(province=>missing.find(venue=>venue.province===province)).filter(Boolean):undefined},null,2));
}finally{await sql.end({timeout:3});}
