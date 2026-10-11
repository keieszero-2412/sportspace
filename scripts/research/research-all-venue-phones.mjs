// Public evidence only. Weak results remain candidates, never verified native phones.
import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { nameKey, overlap } from '../lib/venue-phone-crawl.mjs';
import { readPhoneContacts, loosePhoneMatch } from '../lib/auto-venue-phone-review.mjs';
import { reviewCoverage } from '../../src/services/venueReviewCoverage.js';
const inspect = process.argv.includes('--status');
const save = process.argv.includes('--save') && !inspect;
const env = {...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if (env.VITE_SUPABASE_URL !== 'https://dzpbnvpqkwsjlvdxwwub.supabase.co') throw new Error('Project mismatch');
const sql = postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{statement_timeout:30000,default_transaction_read_only:save?'off':'on'}});
const allowed = new Set(['sanpick.com','www.sporta.vn','sporta.vn','www.alobo.vn','alobo.vn','diadiem247.com','www.diadiem247.com','belo.vn','pickleballplus.vn','shopvnb.com','tindichvu.com','www.hcmtoplist.com','thethaophutho.vn','dongphucbongda.inaodongphucmrslinh.com']);
const safeUrl = value => {try {const u=new URL(value);return u.protocol==='https:' && !u.username && !u.password && allowed.has(u.hostname) ? u.href : null;} catch {return null;}};
try {
  const venues = await sql`select id,name,address,province,sport,source_url,phone_sources from public."Facilities" order by id`;
  const [catalog] = await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
  if (!catalog?.payload?.venues) throw new Error('Catalog unavailable');
  if (inspect) {
    const research=catalog.payload.phoneResearch;
    console.log(JSON.stringify({phones:catalog.payload.totals?.phone,research:research?{...research,venueStatus:undefined,pageResults:undefined}:null,
      venuesWithOwnSourceChecked:research?Object.values(research.venueStatus||{}).filter(item=>item.sourceResults.some(source=>source.status!=='not_visited')).length:0,
      venuesWithoutOwnSource:research?Object.values(research.venueStatus||{}).filter(item=>!item.sourceResults.length).length:0},null,2));
  } else {
  const onlyMissing=process.argv.includes('--only-missing');
  const researchVenues=onlyMissing?venues.filter(venue=>!catalog.payload.venues[venue.id]?.phone?.length):venues;
  const maxPages=Number(process.argv.find(value=>value.startsWith('--max-pages='))?.slice(12)||Infinity);
  const maxSeconds=Number(process.argv.find(value=>value.startsWith('--max-seconds='))?.slice(14)||Infinity);
  if(!(maxPages>0)||!(maxSeconds>0))throw new Error('Invalid research limit');
  const wordIndex = new Map();
  for (const venue of researchVenues) for (const word of new Set(nameKey(venue.name).split(' '))) {
    if (word.length<2) continue;
    if (!wordIndex.has(word)) wordIndex.set(word,new Set());
    wordIndex.get(word).add(venue);
  }
  const relatedVenues = name => [...new Set(nameKey(name).split(' ').flatMap(word=>[...(wordIndex.get(word)||[])]))];
  const queue=[], seen=new Set(), status=new Map(), blocked=new Set(), pending=new Map(), matchedIds=new Set();
  const previous=catalog.payload.phoneResearch;
  const useRecentCache=!process.argv.includes('--refresh') && previous?.checkedAt
    && Date.now()-Date.parse(previous.checkedAt)<24*60*60*1000;
  let reusedUrls=0;
  if(useRecentCache){
    for(const item of Object.values(previous.venueStatus||{}))for(const source of item.sourceResults||[])
      if(source.status!=='not_visited')status.set(source.url,source.status);
    for(const [url,result] of Object.entries(previous.pageResults||{}))status.set(url,result);
    for(const [id,item] of Object.entries(previous.venueStatus||{}))if(item.matched)matchedIds.add(id);
    for(const host of previous.blockedHosts||[])blocked.add(host);
    for(const fields of Object.values(catalog.payload.venues))for(const candidate of fields.phone||[]){
      const date=Date.parse(candidate.liveRecheckedAt||(!/archived/.test(candidate.matchStatus||'')?candidate.checkedAt:null));
      if(Date.now()-date<24*60*60*1000&&!status.has(candidate.sourceUrl))status.set(candidate.sourceUrl,'cached_recent_evidence');
    }
  }
  const ownUrls = new Map(venues.map(venue=>[venue.id,new Set()]));
  const enqueue = (value,depth=0) => {const url=safeUrl(value);if(!url||seen.has(url))return;seen.add(url);
    if(useRecentCache&&status.has(url)){reusedUrls++;return;}queue.push({url,depth});};
  // Current known source URLs for EVERY venue, not just the former 100-URL pass.
  const seeds=['https://sanpick.com/san-pickleball-tphcm/','https://sanpick.com/san-pickleball-ha-noi/',
    'https://sanpick.com/san-pickleball-da-nang/','https://sanpick.com/san-pickleball-khanh-hoa/',
    'https://sanpick.com/san-pickleball-quang-ninh/','https://sanpick.com/san-pickleball-nam-dinh/'];
  for (const url of seeds) enqueue(url);
  for(const arg of process.argv.filter(value=>value.startsWith('--source-url=')))enqueue(arg.slice(13));
  for (const venue of researchVenues) {
    const urls=[venue.source_url,...(Array.isArray(venue.phone_sources)?venue.phone_sources.map(source=>source.url):[]),
      ...(catalog.payload.venues[venue.id]?.phone||[]).map(candidate=>candidate.sourceUrl)];
    for (const value of urls) {const url=safeUrl(value);if(url){ownUrls.get(venue.id).add(url);enqueue(url);}}
  }
  const initialUrlCount=queue.length, started=Date.now(), runId=crypto.randomUUID();
  let cursor=0, fetched=0, contactsCount=0, candidateCount=0;
  const counters={};
  const bump=key=>counters[key]=(counters[key]||0)+1;
  const summarize = () => ({runId,threshold:.5,scoreMeaning:'heuristic_similarity_not_probability',venues:venues.length,
    initialUrls:initialUrlCount,urls:seen.size,reusedUrls,fetched,contacts:contactsCount,newEvidence:candidateCount,liveMatchedVenues:matchedIds.size,
    targetVenues:researchVenues.length,elapsedSeconds:Math.round((Date.now()-started)/1000),results:counters,blockedHosts:[...blocked]});
  let lastCheckpoint=0;
  async function checkpoint(final=false) {
    if (!save || !final && fetched-lastCheckpoint<100) return;
    const batch=[...pending.entries()];pending.clear();lastCheckpoint=fetched;
    await sql.begin(async tx=>{
      await tx`set local lock_timeout='5s'`;
      const [current]=await tx`select payload from public."VenueReviewCatalog" where id='venues' for update`;
      if(!current?.payload?.venues)throw new Error('Catalog changed unexpectedly');
      const payload=current.payload;
      for(const [id,candidates] of batch){
        payload.venues[id] ||= {image:[],phone:[],price_summary:[]};
        const list=payload.venues[id].phone ||= [];
        for(const candidate of candidates){
          // Preserve pre-existing evidence and IDs (including manual rejections).
          const existing=list.find(item=>item.value===candidate.value&&item.sourceUrl===candidate.sourceUrl);
          if(existing) existing.liveRecheckedAt=candidate.checkedAt;
          else list.push(candidate);
        }
      }
      const coverage=reviewCoverage(venues,payload.venues);
      payload.coverage=coverage;
      payload.totals=Object.fromEntries(Object.entries(coverage.fields).map(([field,data])=>[field,{venues:data.venues,candidates:data.candidates}]));
      payload.phoneResearch={...summarize(),finished:final,checkedAt:new Date().toISOString(),
        pageResults:Object.fromEntries(status),
        venueStatus:Object.fromEntries(venues.map(venue=>[venue.id,{matched:matchedIds.has(venue.id),
          sourceResults:[...ownUrls.get(venue.id)].map(url=>({url,status:status.get(url)||'not_visited'}))}]))};
      await tx`update public."VenueReviewCatalog" set payload=${tx.json(payload)},"updatedAt"=now() where id='venues'`;
    });
    console.log(JSON.stringify({...summarize(),checkpoint:true,finished:final}));
  }
  async function fetchPage(entry){
    let url=entry.url;
    for(let redirect=0;redirect<=3;redirect++){
      const host=new URL(url).hostname;
      if(blocked.has(host)){bump('blocked_host_skip');return {status:'blocked_host'};}
      const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(9000)});
      if([401,403,429].includes(response.status)){
        blocked.add(host);if(host.endsWith('sporta.vn')){blocked.add('sporta.vn');blocked.add('www.sporta.vn');}
        await response.body?.cancel();bump(`blocked_${response.status}`);return{status:`blocked_${response.status}`};
      }
      if([301,302,303,307,308].includes(response.status)){
        const next=safeUrl(new URL(response.headers.get('location')||'',url).href);
        await response.body?.cancel();if(!next||next===url){bump('unsafe_redirect');return{status:'redirect_skipped'};}url=next;continue;
      }
      if(!response.ok||!response.headers.get('content-type')?.includes('text/html')){
        await response.body?.cancel();bump(`http_${response.status}`);return{status:`http_${response.status}`};
      }
      const reader=response.body.getReader(),chunks=[];let bytes=0;
      for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.length;
        if(bytes>3000000){await reader.cancel();bump('too_large');return{status:'too_large'};}chunks.push(item.value);}
      const html=Buffer.concat(chunks).toString('utf8');
      if(/captcha|verify you are human|unusual traffic|just a moment/i.test(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||'')){
        blocked.add(host);bump('challenge');return{status:'challenge'};
      }
      return{status:'ok',url,html};
    }
    bump('redirect_limit');return{status:'redirect_limit'};
  }
  async function worker(){
    while(cursor<queue.length&&cursor<maxPages&&Date.now()-started<maxSeconds*1000){
      const entry=queue[cursor++];
      let page;
      try {page=await fetchPage(entry);} catch(error){
        if(!['TimeoutError','AbortError','TypeError'].includes(error.name)&&!error.code)throw error;
        page={status:error.name==='TimeoutError'?'timeout':'network_error'};bump(page.status);
      }
      fetched++;status.set(entry.url,page.status);
      if(page.status==='ok'){
        const retrievedAt=new Date().toISOString();
        const records=readPhoneContacts({...page,retrievedAt});contactsCount+=records.length;
        for(const record of records)for(const venue of relatedVenues(record.name)){
          const score=loosePhoneMatch(venue,record);if(score===null)continue;
          matchedIds.add(venue.id);
          if(!pending.has(venue.id))pending.set(venue.id,[]);
          const id=crypto.createHash('sha256').update(JSON.stringify([venue.id,'phone',record.phone,record.url])).digest('hex').slice(0,24);
          const list=pending.get(venue.id);
          if(!list.some(item=>item.id===id)){
            list.push({id,value:record.phone,sourceUrl:record.url,sourceName:record.name,sourceAddress:record.address,
              checkedAt:record.checkedAt,evidence:`Public phone record; similarity ${score} (not verified accuracy). ${record.evidence}`,
              score,matchStatus:'name_address_unverified_50_candidate',status:'candidate_not_approved'});candidateCount++;
          }
        }
        // One bounded discovery hop; no search engine scraping or protected Maps requests.
        if(entry.depth===0&&!process.argv.includes('--no-discovery')){
          const $=cheerio.load(page.html);
          $('a[href]').each((_,element)=>{
            if(seen.size>=5000)return;
            let url;try{url=new URL($(element).attr('href'),page.url);}catch{return;}
            if(url.hostname==='sanpick.com'&&/^\/san-pickleball-[a-z0-9-]+\/$/.test(url.pathname))enqueue(url.href,1);
            else if(url.hostname==='pickleballplus.vn'&&/^\/san-tap\/\d+$/.test(url.pathname)
              &&relatedVenues($(element).text()).some(venue=>overlap(nameKey(venue.name),nameKey($(element).text()))>=.5))enqueue(url.href,1);
            else if(url.hostname==='diadiem247.com'&&/-l\d+\.html$/.test(url.pathname)
              &&relatedVenues($(element).text()).some(venue=>overlap(nameKey(venue.name),nameKey($(element).text()))>=.5))enqueue(url.href,1);
          });
        }
      }
      if(fetched%50===0)console.log(JSON.stringify(summarize()));
      await checkpoint();
      // Limit per-site pressure: only two workers and a short pause between pages.
      await new Promise(resolve=>setTimeout(resolve,200));
    }
  }
  console.log(JSON.stringify({...summarize(),starting:true,mode:save?'save_candidates':'read_only'}));
  // Serialize checkpoint writes while workers continue with other pages.
  const saveCheckpoint=checkpoint;
  let saving=Promise.resolve();
  checkpoint=(final=false)=>{saving=saving.then(()=>saveCheckpoint(final));return saving;};
  await Promise.all([worker(),worker()]);
  await checkpoint(true);
  const [after]=await sql`select payload->'totals'->'phone' as phones,payload->'phoneResearch'->>'finished' as finished from public."VenueReviewCatalog" where id='venues'`;
  console.log(JSON.stringify({...summarize(),complete:true,savedCatalog:after}));
  }
}finally{await sql.end({timeout:3});}
