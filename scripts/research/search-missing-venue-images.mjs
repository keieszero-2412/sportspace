import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { imageIdentity,relaxedImageScore } from '../lib/venue-image-resolution.mjs';
const save=process.argv.includes('--save');
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:save?'off':'on',statement_timeout:30000}});
try{
  const rows=await sql`select id,name,address,province,sport,coalesce(google_rating,rating)::float as rating,raw_data->>'imageSha256' as image_hash from public."Facilities" order by coalesce(google_rating,rating) desc nulls last,id`;
  const [{payload}]=await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
  const previous=payload.imageSearch||{},recent=previous.checkedAt&&Date.now()-Date.parse(previous.checkedAt)<86400000;
  const statuses=recent?{...previous.venueResults}:{},pending=new Map();
  const queue=rows.filter(venue=>!venue.image_hash&&!statuses[venue.id]);
  const limit=Number(process.argv.find(arg=>arg.startsWith('--max-venues='))?.split('=')[1]||200),seconds=Number(process.argv.find(arg=>arg.startsWith('--max-seconds='))?.split('=')[1]||180);
  if(!(limit>0&&seconds>0))throw new Error('Invalid budget');
  const started=Date.now(),run={id:crypto.randomUUID(),targets:queue.length,searched:0,newCandidates:0,matchedVenues:0,blocked:false,finished:false};let cursor=0;
  async function worker(){
    while(!run.blocked&&cursor<queue.length&&cursor<limit&&Date.now()-started<seconds*1000){
      const venue=queue[cursor++];
      try{
        const query=`"${venue.name}" "${venue.province}"`;
        const response=await fetch(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}`,{signal:AbortSignal.timeout(7000),redirect:'manual'});
        if([401,403,429].includes(response.status)){run.blocked=true;throw new Error(`blocked_${response.status}`);}
        if(!response.ok)throw new Error(`http_${response.status}`);
        let bytes=0;const chunks=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>3000000)throw new Error('page_too_large');chunks.push(chunk);}
        const $=cheerio.load(Buffer.concat(chunks).toString('utf8'));
        if(/captcha|verify you are human|unusual traffic|just a moment/i.test($('title').text())){run.blocked=true;throw new Error('challenge');}
        let found=0;
        $('a.iusc').slice(0,20).each((_,element)=>{
          let metadata;try{metadata=JSON.parse($(element).attr('m')||'{}');}catch{return;}
          const title=metadata.t||$(element).attr('aria-label')||'';
          try{imageIdentity(metadata.murl);imageIdentity(metadata.purl);}catch{return;}
          if(/logo|placeholder|mock|wikimedia|unsplash|avatar|favicon/i.test(metadata.murl))return;
          const candidate={value:metadata.murl,sourceUrl:metadata.purl,sourceName:title,evidence:`Public image search result caption: ${title}`};
          const score=relaxedImageScore(venue,candidate);if(score===null)return;
          if((payload.venues[venue.id]?.image||[]).some(item=>item.value===candidate.value&&item.sourceUrl===candidate.sourceUrl))return;
          const id=crypto.createHash('sha256').update(JSON.stringify([venue.id,'image',candidate.value,candidate.sourceUrl])).digest('hex').slice(0,24);
          if(!pending.has(venue.id))pending.set(venue.id,new Map());if(pending.get(venue.id).has(id))return;
          pending.get(venue.id).set(id,{...candidate,id,score,matchStatus:'search_caption_unverified_50',checkedAt:new Date().toISOString(),status:'candidate_not_approved',rightsConfirmed:false});found++;run.newCandidates++;
        });
        statuses[venue.id]=found?'new_candidates':'no_new_caption_match';
      }catch(error){statuses[venue.id]=error.name==='TimeoutError'?'timeout':error.message;}
      run.searched++;if(run.searched%25===0)console.log(JSON.stringify({...run,matchedVenues:pending.size,elapsedSeconds:Math.round((Date.now()-started)/1000)}));
      await new Promise(resolve=>setTimeout(resolve,150));
    }
  }
  await Promise.all([worker(),worker()]);
  Object.assign(run,{matchedVenues:pending.size,finished:true,budgetLimited:cursor<queue.length,elapsedSeconds:Math.round((Date.now()-started)/1000),checkedAt:new Date().toISOString(),venueResults:statuses});
  if(save)await sql.begin(async tx=>{
    const [{payload:current}]=await tx`select payload from public."VenueReviewCatalog" where id='venues' for update`;
    for(const [id,candidates] of pending){current.venues[id]||={image:[],phone:[],price_summary:[]};current.venues[id].image||=[];for(const candidate of candidates.values())if(!current.venues[id].image.some(item=>item.id===candidate.id))current.venues[id].image.push(candidate);}
    const images=Object.values(current.venues).map(fields=>fields.image||[]);current.totals.image={venues:images.filter(list=>list.length).length,candidates:images.reduce((sum,list)=>sum+list.length,0)};
    current.imageSearch=run;
    await tx`update public."VenueReviewCatalog" set payload=${tx.json(current)},"updatedAt"=now() where id='venues'`;
  });
  console.log(JSON.stringify({...run,venueResults:undefined}));
}finally{await sql.end({timeout:3});}
