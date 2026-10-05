// Crawl only public venue URLs exposed in sanbong.vn/sitemap.xml.
// Never connects to Firebase; matching uses the local Firestore export.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { normalize, nameKey, overlap } from './lib/venue-phone-crawl.mjs';

const cacheDir='data_export/price-expansion/sanbong-pages';
fs.mkdirSync(cacheDir,{recursive:true});
const sitemapUrl='https://sanbong.vn/sitemap.xml';
const sitemapFile=`${cacheDir}/sitemap.xml`;
if(process.argv.includes('--fetch')) {
  const xml=await (await fetch(sitemapUrl,{headers:{'User-Agent':'SportSpacePriceResearch/1.0'},signal:AbortSignal.timeout(30000)})).text();
  fs.writeFileSync(sitemapFile,xml);
  const urls=[...xml.matchAll(/<loc>(https:\/\/sanbong\.vn\/(?:bong-da|cau-long|tennis|bong-ro|bong-chuyen|bong-ban)\/[^<]+)<\/loc>/g)].map(m=>m[1]);
  let cursor=0,done=0;
  await Promise.all(Array.from({length:3},async()=>{while(cursor<urls.length){
    const url=urls[cursor++], file=`${cacheDir}/${crypto.createHash('sha1').update(url).digest('hex')}.json`;
    if(fs.existsSync(file)){done++;continue;}
    try{const res=await fetch(url,{headers:{'User-Agent':'SportSpacePriceResearch/1.0'},signal:AbortSignal.timeout(20000)});const html=res.ok?await res.text():'';fs.writeFileSync(file,JSON.stringify({url,status:res.status,retrievedAt:new Date().toISOString(),html}));}catch(e){fs.writeFileSync(file,JSON.stringify({url,error:e.message,retrievedAt:new Date().toISOString()}));}
    done++;if(done%50===0)console.log(`Fetched ${done}/${urls.length}`);await new Promise(r=>setTimeout(r,450));
  }}));
  console.log(JSON.stringify({sitemapVenueUrls:urls.length,cached:done}));
}

const sportMap={'bong-da':'Bóng đá','cau-long':'Cầu lông','tennis':'Tennis','bong-ro':'Bóng rổ','bong-chuyen':'Bóng chuyền','bong-ban':'Bóng bàn'};
const snapshot=JSON.parse(fs.readFileSync('data_export/coordinates/firestore-snapshot.json','utf8'));
const venues=snapshot.documents.map(d=>({id:d.name.split('/').at(-1),name:d.fields.name?.stringValue||'',address:d.fields.address?.stringValue||'',sport:d.fields.sport?.stringValue||''}));
const out=[];
for(const file of fs.readdirSync(cacheDir).filter(f=>f.endsWith('.json'))){
  const p=JSON.parse(fs.readFileSync(`${cacheDir}/${file}`,'utf8'));if(!p.html)continue;
  const $=cheerio.load(p.html);$('script,style,nav,footer').remove();const text=$('body').text().replace(/\s+/g,' ').trim();
  const name=$('h1').first().text().replace(/\s+/g,' ').trim();
  const slug=new URL(p.url).pathname.split('/')[1], sourceSport=sportMap[slug];
  if(!name||!sourceSport||!/Bảng giá thuê sân/i.test(text))continue;
  const address=(text.match(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s+(.{3,160}?)\\s+Mở cửa`,'i'))||[])[1]||'';
  const priceBlock=(text.match(/Bảng giá thuê sân\s+(.{0,400}?)\s+(?:Giá đã bao gồm|Lịch trống)/i)||[])[1]||'';
  if(!/\d+K\/h/i.test(priceBlock))continue;
  const nk=nameKey(name), nw=new Set(nk.split(' ').filter(Boolean));
  const candidates=venues.filter(v=>normalize(v.sport)===normalize(sourceSport)).map(v=>{
    const vk=nameKey(v.name),vw=new Set(vk.split(' ').filter(Boolean));const common=[...vw].filter(w=>nw.has(w)).length;
    const nameScore=common/Math.max(1,Math.min(vw.size,nw.size));const addressScore=overlap(normalize(v.address),normalize(address));
    return {...v,nameScore,addressScore,score:nameScore+addressScore};
  }).filter(x=>x.nameScore>=.55&&x.addressScore>=.35).sort((a,b)=>b.score-a.score).slice(0,3);
  out.push({source_url:p.url,retrieved_at:p.retrievedAt,source_name:name,source_address:address,source_sport:sourceSport,price_text:priceBlock,price_provenance:'platform_template_unverified',candidates});
}
fs.writeFileSync('data_export/price-expansion/sanbong-matches.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({pricePages:out.length,matchedPages:out.filter(x=>x.candidates.length).length,highConfidence:out.filter(x=>x.candidates[0]?.score>=1.45).length}));
