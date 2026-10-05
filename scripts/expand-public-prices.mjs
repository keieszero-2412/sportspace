// Local/public HTML only. No Firebase SDK or database access.
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { normalize, nameKey, overlap } from './lib/venue-phone-crawl.mjs';

const snapshot = JSON.parse(fs.readFileSync('data_export/coordinates/firestore-snapshot.json', 'utf8'));
const venues = snapshot.documents.map(d => ({id:d.name.split('/').at(-1),name:d.fields.name?.stringValue || '',address:d.fields.address?.stringValue || '',sport:d.fields.sport?.stringValue || ''}));
const prepared = venues.map(v=>({v,key:nameKey(v.name),words:new Set(nameKey(v.name).split(' ')),address:normalize(v.address)}));
const cache = 'data_export/price-expansion';
fs.mkdirSync(cache, {recursive:true});
const hash = u => crypto.createHash('sha256').update(u).digest('hex');
if (process.argv.includes('--fetch')) {
  const urls = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--fetch')+1], 'utf8'));
  let cursor=0, done=0;
  await Promise.all(Array.from({length:3}, async()=>{
    while(cursor<urls.length) {
      const url=urls[cursor++], file=`${cache}/${hash(url)}.json`;
      if(fs.existsSync(file)) continue;
      try {
        const res=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'User-Agent':'SportSpacePriceResearch/1.0'}});
        const html=res.ok?await res.text():'';
        fs.writeFileSync(file,JSON.stringify({url,retrievedAt:new Date().toISOString(),status:res.status,html}));
      } catch(e){console.log(JSON.stringify({url,error:e.message}));}
      done++;
      if(done%10===0)console.log(`Fetched ${done}/${urls.length}`);
      await new Promise(r=>setTimeout(r,700));
    }
  }));
}

const clean=s=>s.replace(/\s+/g,' ').trim();
const documents=[];
const seen=new Set();
for(const folder of process.argv.includes('--local-only')?['data_export/phone-crawl/pages']:['data_export/phone-crawl/pages',cache]) {
 for(const file of fs.readdirSync(folder).filter(f=>f.endsWith('.json'))) {
  const page=JSON.parse(fs.readFileSync(`${folder}/${file}`,'utf8'));
  if(!page.html || seen.has(page.url))continue;
  seen.add(page.url);
  if(seen.size%50===0)console.log(`Scanned ${seen.size} pages`);
  const $=cheerio.load(page.html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''));
  const title=clean($('h1').first().text() || $('title').text());
  let address='';
  $('script[type="application/ld+json"]').each((_,el)=>{try{const d=JSON.parse($(el).text());if(d['@type']==='LocalBusiness' && typeof d.address==='string')address=d.address;}catch{}});
  $('script,style,nav,footer,aside,header').remove();
  let body=page.url.includes('shopvnb.com')?$('.article-details .rte').first():$('.entry-content,article,main').first();
  if(!body.length)body=$('body');
  const lines=body.find('h1,h2,h3,h4,p,li,tr').toArray().filter(el=>!$(el).find('p,li,tr').length).map(el=>({heading:/^h[1-4]$/.test(el.tagName),text:clean($(el).text())})).filter(x=>x.text);
  const allText=clean(body.text());
  const addresses=lines.filter(x=>/địa\s*chỉ\s*:/iu.test(x.text)).map(x=>x.text.split(/địa\s*chỉ\s*:/iu)[1].split(/hotline|điện thoại|link map/iu)[0]);
  if(!address && addresses.length===1)address=addresses[0];
  const blocks=[];
  // Single-venue articles: keep price section bounded by headings.
  let current={heading:title,lines:[]};
  for(const l of lines){if(l.heading){if(current.lines.length)blocks.push(current);current={heading:l.text,lines:[]};}else current.lines.push(l.text);}
  if(current.lines.length)blocks.push(current);
  let priceLines=blocks.flatMap(b=>/giá|chi phí/iu.test(b.heading)?b.lines:b.lines.filter(l=>/(giá|thuê|chi phí)/iu.test(l)));
  if(!priceLines.length && /Giá dịch vụ/iu.test(allText))priceLines=[allText.slice(Math.max(0,allText.indexOf('Giá dịch vụ')),allText.indexOf('Giá dịch vụ')+180)];
  // Contact instructions often occur AFTER a valid rental price in the same paragraph.
  priceLines=priceLines.filter(l=>/\d\s*(?:[.,]\s*\d{3}|k\b)/iu.test(l));
  const images=body.find('img').toArray().filter(el=>/giá/iu.test($(el).attr('alt')||'')).map(el=>$(el).attr('src')||$(el).attr('data-src'));
  if(!priceLines.length && !images.length)continue;
  const nt=normalize(title);
  const titleKey=nameKey(title);
  const titleWords=new Set(titleKey.split(' '));
  const candidates=prepared.map(({v,key,words})=>{
    const common=[...words].filter(w=>titleWords.has(w));
    const nameScore=common.length/Math.min(words.size,titleWords.size);
    if(nameScore<.7)return null;
    const addrScore=address?overlap(v.address,address):0;
    const contained=titleKey.includes(key) && key.length>=5;
    return {v,nameScore,addrScore,score:nameScore+addrScore,common:common.length,contained};
  }).filter(c=>c && c.nameScore>=0.7 && (c.common>=2||c.contained)).sort((a,b)=>b.score-a.score).slice(0,4);
  documents.push({url:page.url,retrievedAt:page.retrievedAt,title,address,priceLines,images,candidates,blocks});
 }
}
fs.writeFileSync(`${cache}/index-output.json`,JSON.stringify({pagesScanned:seen.size,documents},null,2));
console.log(JSON.stringify({pagesScanned:seen.size,priceDocuments:documents.length,withCandidates:documents.filter(d=>d.candidates.length).length}));
if(process.argv.includes('--verbose'))for(const d of documents.filter(d=>d.candidates.some(c=>c.addrScore>=.5)).sort((a,b)=>b.candidates[0].score-a.candidates[0].score))console.log(JSON.stringify({url:d.url,title:d.title,address:d.address,prices:d.priceLines,candidates:d.candidates.map(c=>({id:c.v.id,name:c.v.name,address:c.v.address,sport:c.v.sport,score:c.score}))}));
