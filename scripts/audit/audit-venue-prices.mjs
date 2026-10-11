import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:'on',statement_timeout:30000}});
try{
  const venues=await sql`select id,name,address,province,sport,scale_courts,amenities,price_summary,source_url,raw_data->'price_reference' as reference from public."Facilities" order by id`;
  const [{payload}]=await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
  const history=await sql`select "facilityId",data,status from public."VenueDataReviews" where field='price_summary'`;
  if(process.argv.includes('--small-sports')){console.log(venues.filter(v=>['Bóng bàn','Thể thao tổng hợp'].includes(v.sport)).map(v=>`${v.id} | ${v.name} | ${v.address}`).join('\n'));}
  const basis={},sports={};
  for(const venue of venues){
    sports[venue.sport]||={venues:0,withCandidates:0,withReference:0,hourly:0};const row=sports[venue.sport];row.venues++;
    const candidates=payload.venues[venue.id]?.price_summary||[];if(candidates.length)row.withCandidates++;
    if(venue.reference)row.withReference++;
    if(candidates.some(candidate=>candidate.basis==='court_hour'&&Number(candidate.unitMinutes)===60))row.hourly++;
    for(const candidate of candidates)basis[`${candidate.basis}:${candidate.unitMinutes}`]=(basis[`${candidate.basis}:${candidate.unitMinutes}`]||0)+1;
  }
  console.log(JSON.stringify({total:venues.length,basis,sports,sourceTotals:payload.totals.price_summary,
    currentPriceApprovals:venues.filter(venue=>history.some(row=>row.facilityId===venue.id&&row.status==='approve'&&row.data.value===venue.price_summary)).length,
    samples:Object.keys(sports).map(sport=>{const venue=venues.find(venue=>venue.sport===sport&&payload.venues[venue.id]?.price_summary?.length);return venue?{venue,candidates:payload.venues[venue.id].price_summary.slice(0,3)}:{sport,noSource:true};})},null,2));
}finally{await sql.end({timeout:3});}
