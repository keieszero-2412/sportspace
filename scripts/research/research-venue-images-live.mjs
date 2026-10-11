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
const hosts=new Set(['diadiem247.com','www.diadiem247.com','pickleballplus.vn','shopvnb.com','belo.vn','sanpick.com','thethaophutho.vn','tindichvu.com','www.hcmtoplist.com','bongbanduyhung.com','thethaothientruong.vn','elipsport.vn','www.dulieubongban.com']);
const safePage=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&hosts.has(url.hostname)?url.href:null;}catch{return null;}};
try{
  const rows=await sql`select id,name,address,province,sport,source_url,raw_data->>'imageSha256' as image_hash from public."Facilities" order by id`;
  const [{payload}]=await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
  const venues=rows.filter(venue=>!venue.image_hash),pages=new Map(),blocked=new Set(),pending=new Map();
  for(const venue of venues){
    const fields=payload.venues[venue.id]||{};
    const urls=[venue.source_url,...['image','phone','price_summary'].flatMap(field=>(fields[field]||[]).map(candidate=>candidate.sourceUrl))];
    for(const value of urls){const url=safePage(value);if(!url)continue;if(!pages.has(url))pages.set(url,new Set());pages.get(url).add(venue);}
  }
  for(const arg of process.argv.filter(value=>value.startsWith('--source-url='))){const url=safePage(arg.slice(13));if(!url)throw new Error('Unsupported public source');pages.set(url,new Set(venues));}
  const started=Date.now(),run={id:crypto.randomUUID(),targets:venues.length,knownPages:pages.size,reusedPages:0,fetched:0,newCandidates:0,matchedVenues:0,errors:{},finished:false,startedAt:new Date().toISOString()};
  const limit=Number(process.argv.find(arg=>arg.startsWith('--max-pages='))?.split('=')[1]||300);
  const seconds=Number(process.argv.find(arg=>arg.startsWith('--max-seconds='))?.split('=')[1]||180);
  if(!(limit>0&&seconds>0))throw new Error('Invalid research budget');
  const recent=payload.imageResearch?.checkedAt&&Date.now()-Date.parse(payload.imageResearch.checkedAt)<86400000&&!process.argv.includes('--refresh');
  const results=recent?{...payload.imageResearch.pageResults}:{};
  const queue=[...pages.entries()].filter(([url])=>{if(recent&&results[url]){run.reusedPages++;return false;}return true;}).sort((a,b)=>b[1].size-a[1].size);let cursor=0;
  async function worker(){
    while(cursor<queue.length&&cursor<limit&&Date.now()-started<seconds*1000){
      const [url,targets]=queue[cursor++],host=new URL(url).hostname;if(blocked.has(host)){results[url]='blocked_host';continue;}
      try{
        const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(7000)});run.fetched++;
        if([401,403,429].includes(response.status)){blocked.add(host);throw new Error(`blocked_${response.status}`);}
        if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))throw new Error(`http_${response.status}`);
        let bytes=0;const chunks=[];for await(const chunk of response.body){bytes+=chunk.length;if(bytes>3000000)throw new Error('page_too_large');chunks.push(chunk);}
        const html=Buffer.concat(chunks).toString('utf8');
        const $=cheerio.load(html);if(/captcha|just a moment|verify you are human/i.test($('title').text())){blocked.add(host);throw new Error('challenge');}
        $('script,style,nav,footer,aside').remove();
        const sections=[];
        $('h1,h2,h3').each((_,heading)=>{
          const section=$(heading).nextUntil('h1,h2,h3');
          const images=section.find('img').add(section.filter('img')).map((_,image)=>$(image).attr('data-src')||$(image).attr('src')).get();
          const name=$(heading).text().trim(),text=section.text().replace(/\s+/g,' ').slice(0,1500);
          sections.push({name,text,images});
        });
        $('article img, main img, .entry-content img').each((_,image)=>{
          const name=$(image).attr('alt')||'',value=$(image).attr('data-src')||$(image).attr('src');
          if(name&&value)sections.push({name,text:$(image).closest('figure').text()||name,images:[value]});
        });
        const title=$('h1').first().text().trim()||$('title').text().trim();
        const og=$('meta[property="og:image"]').attr('content');
        if(og)sections.push({name:title,text:($('main').text()||$('article').text()).replace(/\s+/g,' ').slice(0,1500),images:[og]});
        for(const venue of targets)for(const section of sections){
          // Require identifying name in the specific image section heading,
          // never match a venue somewhere else on a multi-venue directory page.
          const headScore=relaxedImageScore(venue,{sourceName:section.name,evidence:section.name});if(headScore===null)continue;
          const score=relaxedImageScore(venue,{sourceName:section.name,evidence:section.text});if(score===null)continue;
          for(const value of section.images){
            let image;try{image=new URL(value,url).href;imageIdentity(image);}catch{continue;}
            if(/logo|avatar|favicon|placeholder|mock|wikimedia|unsplash/i.test(image))continue;
            const existing=(payload.venues[venue.id]?.image||[]).some(candidate=>candidate.value===image&&candidate.sourceUrl===url);
            if(existing)continue;
            const id=crypto.createHash('sha256').update(JSON.stringify([venue.id,'image',image,url])).digest('hex').slice(0,24);
            if(!pending.has(venue.id))pending.set(venue.id,new Map());
            if(pending.get(venue.id).has(id))continue;
            pending.get(venue.id).set(id,{id,value:image,sourceUrl:url,sourceName:section.name,evidence:`Public named image section: ${section.name}; ${section.text.slice(0,900)}`,score,matchStatus:'live_name_section_unverified_50',status:'candidate_not_approved',checkedAt:new Date().toISOString(),rightsConfirmed:false});run.newCandidates++;
          }
        }
        results[url]='ok';
      }catch(error){const status=error.name==='TimeoutError'?'timeout':error.message?.startsWith('blocked_')?error.message:error.name==='TypeError'?'network_error':error.message;results[url]=status;run.errors[status]=(run.errors[status]||0)+1;}
      if(run.fetched%25===0)console.log(JSON.stringify({...run,matchedVenues:pending.size,elapsedSeconds:Math.round((Date.now()-started)/1000)}));
    }
  }
  await Promise.all([worker(),worker(),worker()]);
  Object.assign(run,{matchedVenues:pending.size,finished:true,budgetLimited:cursor<queue.length,elapsedSeconds:Math.round((Date.now()-started)/1000),checkedAt:new Date().toISOString(),pageResults:results,blockedHosts:[...blocked]});
  if(save)await sql.begin(async tx=>{
    const [{payload:current}]=await tx`select payload from public."VenueReviewCatalog" where id='venues' for update`;
    for(const [id,candidates] of pending){current.venues[id]||={image:[],phone:[],price_summary:[]};current.venues[id].image||=[];for(const candidate of candidates.values())if(!current.venues[id].image.some(item=>item.id===candidate.id||item.value===candidate.value&&item.sourceUrl===candidate.sourceUrl))current.venues[id].image.push(candidate);}
    const images=Object.values(current.venues).map(fields=>fields.image||[]);current.totals.image={venues:images.filter(list=>list.length).length,candidates:images.reduce((sum,list)=>sum+list.length,0)};
    current.imageResearch=run;
    await tx`update public."VenueReviewCatalog" set payload=${tx.json(current)},"updatedAt"=now() where id='venues'`;
  });
  console.log(JSON.stringify({...run,pageResults:undefined}));
}finally{await sql.end({timeout:3});}
