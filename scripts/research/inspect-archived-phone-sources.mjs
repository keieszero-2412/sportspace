// Read only the archived public-contact index in memory. Never restore local exports.
import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {loosePhoneMatch} from '../lib/auto-venue-phone-review.mjs';
import {nameKey} from '../lib/venue-phone-crawl.mjs';
import {reviewCoverage} from '../../src/services/venueReviewCoverage.js';
const save=process.argv.includes('--save-candidates');
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const receipt=JSON.parse(fs.readFileSync('docs/local-data-sync-manifest.json','utf8'));
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:save?'off':'on',statement_timeout:30000}});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
try{
  const [manifest]=await sql`select data from sportspace_archive.manifests where id=${receipt.id}`;
  const wanted=new Set(['data_export/phone-crawl/contacts.json','data_export/phone-crawl/diadiem-discovered.json']);
  const metadata=manifest.data.files.filter(file=>wanted.has(file.path));
  console.log(JSON.stringify({selected:metadata}));
  const contacts=[];
  for(let index=0;index<manifest.data.parts.length;index++){
    if(!manifest.data.parts[index].some(file=>wanted.has(file.path)))continue;
    const [part]=await sql`select payload,sha256 from sportspace_archive.parts where archive_id=${receipt.id} and part_index=${index}`;
    if(hash(part.payload)!==part.sha256)throw new Error('Archive checksum mismatch');
    for(const file of JSON.parse(gunzipSync(part.payload).toString()).files){
      if(!wanted.has(file.path))continue;
      const bytes=Buffer.from(file.base64,'base64');if(hash(bytes)!==file.sha256)throw new Error('File checksum mismatch');
      const records=JSON.parse(bytes.toString('utf8'));
      console.log(JSON.stringify({path:file.path,records:records.length,sample:save?undefined:records.slice(0,3)}));
      if(file.path==='data_export/phone-crawl/contacts.json')contacts.push(...records);
    }
  }
  if(save){
    const venues=await sql`select id,name,address,province,sport from public."Facilities" order by id`;
    const index=new Map();
    for(const venue of venues)for(const word of new Set(nameKey(venue.name).split(' '))){
      if(word.length<2)continue;if(!index.has(word))index.set(word,new Set());index.get(word).add(venue);
    }
    const candidates=new Map(),hosts=new Set(['shopvnb.com','www.alobo.vn','alobo.vn','sanpick.com','diadiem247.com','www.sporta.vn','sporta.vn']);
    for(const original of contacts){
      let url;try{url=new URL(original.url);}catch{continue;}
      if(url.protocol!=='https:'||url.username||url.password||!hosts.has(url.hostname))continue;
      // A venue contact section can have a generic heading; use its venue-specific article title.
      const name=/thong tin lien he|lien he.*dat san|thong tin dat san/.test(nameKey(original.name))?original.title:original.name;
      const record={...original,name};
      const targets=new Set(nameKey(record.name).split(' ').flatMap(word=>[...(index.get(word)||[])]));
      for(const venue of targets){
        const score=loosePhoneMatch(venue,record);if(score===null)continue;
        if(!candidates.has(venue.id))candidates.set(venue.id,[]);
        const candidate={id:hash(JSON.stringify([venue.id,'phone',record.phone,record.url])).slice(0,24),value:record.phone,
          sourceUrl:record.url,sourceName:record.name,sourceAddress:record.address,checkedAt:record.checkedAt,
          evidence:`Archived public contact index (source checked ${record.checkedAt}); similarity ${score}, needs live/manual verification. ${record.evidence}`,
          score,matchStatus:'archived_public_name_address_unverified_50_candidate',status:'candidate_not_approved'};
        if(!candidates.get(venue.id).some(item=>item.id===candidate.id))candidates.get(venue.id).push(candidate);
      }
    }
    let added=0;
    await sql.begin(async tx=>{
      await tx`set local lock_timeout='5s'`;
      const [row]=await tx`select payload from public."VenueReviewCatalog" where id='venues' for update`;
      if(!row?.payload?.venues)throw new Error('Catalog missing');
      const payload=row.payload;
      for(const [id,records] of candidates){
        payload.venues[id] ||= {image:[],phone:[],price_summary:[]};
        const list=payload.venues[id].phone ||= [];
        for(const record of records)if(!list.some(item=>item.value===record.value&&item.sourceUrl===record.sourceUrl)){list.push(record);added++;}
      }
      const coverage=reviewCoverage(venues,payload.venues);payload.coverage=coverage;
      payload.totals=Object.fromEntries(Object.entries(coverage.fields).map(([field,value])=>[field,{venues:value.venues,candidates:value.candidates}]));
      payload.archivedPhoneResearch={archiveId:receipt.id,threshold:.5,checkedAt:new Date().toISOString(),
        publicContacts:contacts.length,matchedVenues:candidates.size,addedCandidates:added,scoreMeaning:'heuristic_similarity_not_probability'};
      await tx`update public."VenueReviewCatalog" set payload=${tx.json(payload)},"updatedAt"=now() where id='venues'`;
    });
    console.log(JSON.stringify({publicContacts:contacts.length,matchedVenues:candidates.size,addedCandidates:added,localFilesRestored:0}));
  }
}finally{await sql.end({timeout:3});}
