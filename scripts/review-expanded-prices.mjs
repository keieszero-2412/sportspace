// Offline extraction. Output is a review queue, never automatically a verified price list.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import {normalize,nameKey,overlap} from './lib/venue-phone-crawl.mjs';
const dir='data_export/price-expansion';
const venues=JSON.parse(fs.readFileSync('data_export/coordinates/firestore-snapshot.json','utf8')).documents.map(d=>({id:d.name.split('/').at(-1),name:d.fields.name.stringValue,address:d.fields.address.stringValue,sport:d.fields.sport.stringValue,province:d.fields.province.stringValue}));
const sportOf=s=>{const t=normalize(s);return /pickleball|pickelball/.test(t)?'Pickleball':/cau long|badminton/.test(t)?'Cầu lông':/bong ro|basketball/.test(t)?'Bóng rổ':/bong ban/.test(t)?'Bóng bàn':/bong chuyen/.test(t)?'Bóng chuyền':/tennis/.test(t)?'Tennis':/bong da|san bong\b|san banh|football|san co/.test(t)?'Bóng đá':'';};
const prepared=venues.map(v=>({...v,key:nameKey(v.name.split(' - ')[0])||nameKey(v.name),addr:normalize(v.address),sourceSport:sportOf(v.name)||v.sport}));
for(const v of prepared)v.words=new Set(v.key.split(' '));
const clean=s=>s.replace(/\s+/g,' ').trim();
const queue=[];
function extract(source){
 if(!source.address)return;
 const key=nameKey(source.name),addr=normalize(source.address),sourceSport=sportOf(source.name);
 const words=new Set(key.split(' '));
 const matches=prepared.map(v=>({v,ns:[...v.words].filter(w=>words.has(w)).length/Math.min(words.size,v.words.size)})).filter(m=>m.ns>=.85).map(m=>({...m,as:overlap(m.v.addr,addr)})).filter(m=>{
  if(m.ns<.85||m.as<.5||m.v.key.length<3)return false;
  if(sourceSport && m.v.sourceSport!==sourceSport)return false;
  const province=normalize(m.v.province);
  if(!addr.includes(province) && !(province==='ho chi minh'&&/hcm|tphcm|sai gon/.test(addr)))return false;
  return true;
 }).sort((a,b)=>(b.ns+b.as)-(a.ns+a.as)).slice(0,3);
 if(!matches.length)return;
 for(const line of source.lines){
  // Crop at end of rental-price sentence: do not export entire copyrighted paragraphs.
  const evidence=clean(line).split(/(?<!\d)\.\s+/)[0].slice(0,550);
  const amounts=[...evidence.matchAll(/(?<![\d.,])(\d{1,3}(?:[.,]\d{3})+|\d+\s*[kK])(?=[\sđĐvV/–—\-.,;:]|$)/g)].map(m=>/[kK]/.test(m[1])?parseInt(m[1])*1000:Number(m[1].replace(/[.,]/g,''))).filter(n=>n>=10000&&n<=5000000);
  if(!amounts.length||amounts.length>2)continue;
  if(/người|học phí|học viên|giá vợt|thuê vợt|gửi xe|vé vào|thành viên|hội viên|miễn phí/i.test(evidence))continue;
  const hourly=/\/\s*(?:giờ|h\b)|đồng một giờ/i.test(evidence);
  const match=/\/\s*trận/i.test(evidence);
  const minutes=hourly?60:/90\s*phút/.test(evidence)?90:'';
  const basis=hourly?'court_hour':match?'court_match':'court_unknown_duration';
  const lower=amounts.length===1 && /(?:chỉ từ|giá từ|từ mức|từ)\s*\d{1,3}[.,]\d{3}/i.test(evidence);
  const time=evidence.match(/\b(\d{1,2})h(\d{2})?\s*[-–]\s*(\d{1,2})h(\d{2})?/i);
  const start_time=time?`${time[1].padStart(2,'0')}:${time[2]||'00'}`:'';
  const end_time=time?`${time[3].padStart(2,'0')}:${time[4]||'00'}`:'';
  for(const m of matches){
   const v=m.v;
   const id=crypto.createHash('sha256').update([source.url,source.name,v.id,evidence].join('|')).digest('hex').slice(0,16);
   queue.push({candidate_id:id,facility_id:v.id,facility_name:v.name,local_address:v.address,local_sport:v.sport,source_name:source.name,source_address:source.address,source_sport:sourceSport,source_url:source.url,retrieved_at:source.retrievedAt,price_min_vnd:Math.min(...amounts),price_max_vnd:lower?'':Math.max(...amounts),unit_minutes:minutes,price_basis:basis,start_time,end_time,precision:time?'time_slots':lower?'lower_bound':amounts.length>1?'price_range_only':'price_only',offer_type:/giờ vàng|cao điểm/.test(evidence)?'peak_unspecified':'approximate',name_score:m.ns,address_score:m.as,evidence});
  }
 }
}
const index=JSON.parse(fs.readFileSync(`${dir}/index-output.json`,'utf8'));
for(const p of index.documents){
 // Individual articles have one address. Multi-venue lists are handled per heading.
 if(p.address)extract({name:p.title,address:p.address,lines:p.priceLines,url:p.url,retrievedAt:p.retrievedAt});
 else for(const b of p.blocks||[]){
  const a=b.lines.filter(l=>/địa\s*chỉ\s*:/i.test(l));
  if(a.length!==1)continue;
  const address=a[0].split(/địa\s*chỉ\s*:/i)[1].split(/hotline|điện thoại|link map|giờ mở|quy mô/i)[0];
  extract({name:b.heading,address,lines:b.lines.filter(l=>/giá|chi phí/i.test(l)),url:p.url,retrievedAt:p.retrievedAt});
 }
}
let bookingPages=0;
// Directory pages put their price summary in divs, not article paragraphs.
let directoryPages=0;
for(const file of fs.readdirSync('data_export/phone-crawl/pages').filter(f=>f.endsWith('.json'))){
 const p=JSON.parse(fs.readFileSync(`data_export/phone-crawl/pages/${file}`,'utf8'));
 if(!p.url?.includes('diadiem247.com')||!p.html)continue;
 directoryPages++;
 let business;
 for(const m of p.html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{const d=JSON.parse(m[1]);if(d['@type']==='LocalBusiness')business=d;}catch{}
 if(!business?.name||typeof business.address!=='string')continue;
 const t=clean(p.html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' '));
 const m=t.match(/Giá dịch vụ\s*:?\s*[\d.,\s–-]+(?:VND|VNĐ)/);
 if(m)extract({name:business.name,address:business.address,lines:[m[0]],url:p.url,retrievedAt:p.retrievedAt});
}
for(const file of fs.readdirSync(dir).filter(f=>/^[a-f0-9]{64}\.json$/.test(f))){
 const p=JSON.parse(fs.readFileSync(`${dir}/${file}`,'utf8'));
 if(!p.html||!p.url.includes('thegioithethao.vn/')||!/-f-/.test(p.url))continue;
 bookingPages++;
 if(bookingPages%100===0)console.log(`Reviewed ${bookingPages} booking pages`);
 const html=p.html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
 const $=cheerio.load(html),name=clean($('h1').first().text()),address=clean($('.product-rating .address').first().text());
 const lines=$('.item').toArray().filter(e=>/^Giá sân/.test(clean($(e).find('.title').text()))).map(e=>clean($(e).text()));
 extract({name,address,lines,url:p.url,retrievedAt:p.retrievedAt});
}
const unique=[...new Map(queue.map(q=>[q.candidate_id,q])).values()].sort((a,b)=>a.facility_id.localeCompare(b.facility_id)||a.source_url.localeCompare(b.source_url));
fs.writeFileSync(`${dir}/review-queue.json`,JSON.stringify({localPages:index.pagesScanned,directoryPages,bookingPages,candidates:unique},null,2));
const headers=Object.keys(unique[0]||{}),cell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
fs.writeFileSync('docs/data/ung-vien-gia-tu-nguon-bo-sung.csv','\uFEFF'+headers.map(cell).join(',')+'\n'+unique.map(q=>headers.map(h=>cell(q[h])).join(',')).join('\n')+'\n');
console.log(JSON.stringify({localPages:index.pagesScanned,bookingPages,candidates:unique.length,facilities:new Set(unique.map(q=>q.facility_id)).size}));
if(process.argv.includes('--verbose'))for(const q of unique)console.log(JSON.stringify(q));
