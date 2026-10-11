import fs from 'node:fs';
import dotenv from 'dotenv';
import postgres from 'postgres';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import {extractHourlyPrices,priceIdentityScore} from '../lib/venue-price-resolution.mjs';
const save=process.argv.includes('--save');
const env={...dotenv.parse(fs.readFileSync('.env','utf8')),...process.env};
if(env.VITE_SUPABASE_URL!=='https://dzpbnvpqkwsjlvdxwwub.supabase.co')throw new Error('Project mismatch');
const sql=postgres(env.MY_SUPABASE_DB_URL,{max:1,connect_timeout:12,connection:{default_transaction_read_only:save?'off':'on',statement_timeout:30000}});
const hosts=new Set(['shopvnb.com','www.decathlon.vn','diadiem247.com','www.diadiem247.com','tuanviet.vn','tinphatsports.vn','thegioithethao.vn','pickleballplus.vn','sanpick.com','belo.vn','caulongminhlam.com','bongbanduyhung.com','thethaothientruong.vn','www.thethaothientruong.vn','elipsport.vn']);
function safe(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.has(u.hostname)?u.href:null;}catch{return null;}}
try{
 const venues=await sql`select id,name,address,province,sport,source_url from public."Facilities" order by id`;
 const [{payload}]=await sql`select payload from public."VenueReviewCatalog" where id='venues'`;
 const pages=new Map(),pending=new Map(),blocked=new Set();
 for(const venue of venues)for(const value of [venue.source_url,...Object.values(payload.venues[venue.id]||{}).filter(Array.isArray).flat().map(c=>c.sourceUrl)]){
  const url=safe(value);if(!url)continue;if(!pages.has(url))pages.set(url,new Set());pages.get(url).add(venue);
 }
 for(const arg of process.argv.filter(a=>a.startsWith('--source-url='))){const url=safe(arg.slice(13));if(!url)throw new Error('Unsupported source');pages.set(url,new Set(venues));}
 const results={...(payload.priceResearch?.pageResults||{})};
 const fresh=payload.priceResearch?.parserVersion===2&&payload.priceResearch?.checkedAt&&Date.now()-Date.parse(payload.priceResearch.checkedAt)<86400000;
 const focused=new Set(process.argv.filter(a=>a.startsWith('--source-url=')).map(a=>safe(a.slice(13))));
 const queue=[...pages].filter(([url])=>process.argv.includes('--focused')?focused.has(url):!(fresh&&results[url])).sort((a,b)=>b[1].size-a[1].size);
 const run={id:crypto.randomUUID(),parserVersion:2,startedAt:new Date().toISOString(),pages:pages.size,fetched:0,newCandidates:0,errors:{}};let cursor=0;
 async function worker(){while(cursor<queue.length){const [url,targets]=queue[cursor++],host=new URL(url).hostname;
  if(blocked.has(host)){results[url]='blocked_host';continue;}
  try{
   const r=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(7000)});run.fetched++;
   if([401,403,429].includes(r.status)){blocked.add(host);throw new Error(`blocked_${r.status}`);}
   if(!r.ok||!r.headers.get('content-type')?.includes('text/html'))throw new Error(`http_${r.status}`);
   const chunks=[];let bytes=0;for await(const chunk of r.body){bytes+=chunk.length;if(bytes>3000000)throw new Error('page_too_large');chunks.push(chunk);}
   const $=cheerio.load(Buffer.concat(chunks).toString('utf8'));if(/captcha|just a moment/i.test($('title').text())){blocked.add(host);throw new Error('challenge');}
   $('script,style,nav,footer,aside').remove();const sections=[];
   $('h1,h2,h3').each((_,heading)=>{const name=$(heading).text().trim(),section=$(heading).nextUntil(heading.tagName==='h2'?'h1,h2':'h1,h2,h3');
    const lines=section.find('p,li,tr').filter((_,el)=>!$(el).find('li,tr').length).map((_,el)=>{
     const text=$(el).text().replace(/\s+/g,' '),parent=$(el).parents('li').first().text();
     return /giá thuê/i.test(parent)&&!/giá|thuê/i.test(text)?`Giá thuê: ${text}`:text;
    }).get();
    sections.push({name,lines});
   });
   // Single-venue pages often put price under a generic heading. Only use the
   // page title for these when no other venue heading independently matches.
   const title=$('h1').first().text().trim();
   for(const venue of targets){
    const named=sections.filter(s=>priceIdentityScore(venue,{sourceUrl:url,sourceName:s.name,evidence:s.name})!==null);
    const selected=named.length?named:[];
    if(priceIdentityScore(venue,{sourceUrl:url,sourceName:title,evidence:title})!==null&&!/danh sách|top \d|\d+\+* sân|tổng hợp/i.test(title))
      selected.push({name:title,lines:$('article p,article li,article tr,main p,main li,main tr,.entry-content p,.entry-content li,.entry-content tr').map((_,el)=>$(el).text().replace(/\s+/g,' ')).get()});
    for(const section of selected)for(const price of extractHourlyPrices(section.lines.join('\n'))){
     if(venue.sport==='Bóng bàn'&&!/thuê riêng bàn/i.test(price.evidence))continue;
     const id=crypto.createHash('sha256').update(JSON.stringify([venue.id,url,price.min,price.max,price.dayType])).digest('hex').slice(0,24);
     if((payload.venues[venue.id]?.price_summary||[]).some(c=>c.id===id&&c.matchStatus==='live_price_name_section_50'))continue;
     if(!pending.has(venue.id))pending.set(venue.id,new Map());if(pending.get(venue.id).has(id))continue;
     pending.get(venue.id).set(id,{...price,id,sourceUrl:url,sourceName:section.name,matchStatus:'live_price_name_section_50',status:'candidate_not_approved',checkedAt:new Date().toISOString()});run.newCandidates++;
    }
   }
   results[url]='ok';
  }catch(error){const reason=error.name==='TimeoutError'?'timeout':error.name==='TypeError'?'network_error':error.message;results[url]=reason;run.errors[reason]=(run.errors[reason]||0)+1;}
  if(run.fetched%25===0)console.log(JSON.stringify({...run,processed:cursor}));
 }}
 await Promise.all([worker(),worker(),worker()]);Object.assign(run,{finished:true,checkedAt:new Date().toISOString(),matchedVenues:pending.size,pageResults:results});
 if(save)await sql.begin(async tx=>{
  const [{payload:current}]=await tx`select payload from public."VenueReviewCatalog" where id='venues' for update`;
  for(const venue of venues)if(current.venues[venue.id]?.price_summary)current.venues[venue.id].price_summary=current.venues[venue.id].price_summary.filter(c=>c.matchStatus!=='live_name_section_unverified_50');
  for(const [id,candidates] of pending){current.venues[id]||={image:[],phone:[],price_summary:[]};current.venues[id].price_summary||=[];
   for(const candidate of candidates.values())if(!current.venues[id].price_summary.some(c=>c.id===candidate.id))current.venues[id].price_summary.push(candidate);
  }
  const lists=Object.values(current.venues).map(v=>v.price_summary||[]);current.totals.price_summary={venues:lists.filter(l=>l.length).length,candidates:lists.reduce((n,l)=>n+l.length,0)};current.priceResearch=run;
  await tx`update public."VenueReviewCatalog" set payload=${tx.json(current)},"updatedAt"=now() where id='venues'`;
 });
 console.log(JSON.stringify({...run,pageResults:undefined}));
}finally{await sql.end({timeout:3});}
