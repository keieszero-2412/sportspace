// Match rows from public aggregate price tables to the local Firestore export.
// This script never connects to Firebase.
import fs from 'node:fs';
import * as cheerio from 'cheerio';
import { normalize, nameKey, overlap } from './lib/venue-phone-crawl.mjs';

const root = 'data_export/price-expansion';
const snapshot = JSON.parse(fs.readFileSync('data_export/coordinates/firestore-snapshot.json', 'utf8'));
const venues = snapshot.documents.map(d => ({
  id: d.name.split('/').at(-1),
  name: d.fields.name?.stringValue || '',
  address: d.fields.address?.stringValue || '',
  sport: d.fields.sport?.stringValue || '',
}));

const wanted = [
  {domain:'decathlon.vn', sport:'Cầu lông', columns:{name:0, price:1, address:2}},
  {domain:'suasantennis.com', sport:'Tennis', columns:{name:1, address:2, price:4}},
];
const results=[];
for (const file of fs.readdirSync(root).filter(f=>f.endsWith('.json') && f!=='index-output.json' && f!=='review-queue.json')) {
  let page; try { page=JSON.parse(fs.readFileSync(`${root}/${file}`,'utf8')); } catch { continue; }
  const spec=wanted.find(x=>(page.url||'').includes(x.domain));
  if(!spec || !page.html) continue;
  const $=cheerio.load(page.html);
  $('tr').each((_,tr)=>{
    const cells=$(tr).find('th,td').map((__,el)=>$(el).text().replace(/\s+/g,' ').trim()).get();
    const name=cells[spec.columns.name]||'', address=cells[spec.columns.address]||'', price=cells[spec.columns.price]||'';
    if(!/\d[\d.]*\s*(?:₫|–|-)|\d{2,3}\.000/u.test(price) || /tên sân|sản phẩm/i.test(name)) return;
    const nk=nameKey(name), nw=new Set(nk.split(' ').filter(Boolean));
    const candidates=venues.filter(v=>normalize(v.sport)===normalize(spec.sport)).map(v=>{
      const vk=nameKey(v.name), vw=new Set(vk.split(' ').filter(Boolean));
      const common=[...vw].filter(w=>nw.has(w)).length;
      const nameScore=common/Math.max(1,Math.min(vw.size,nw.size));
      const addressScore=overlap(normalize(v.address),normalize(address));
      const numberMatch=(normalize(address).match(/\b\d+[a-z]?\b/g)||[]).some(n=>normalize(v.address).split(' ').includes(n));
      return {...v,nameScore,addressScore,numberMatch,score:nameScore+addressScore+(numberMatch?.25:0)};
    }).filter(v=>v.nameScore>=.45 || v.addressScore>=.38).sort((a,b)=>b.score-a.score).slice(0,5);
    results.push({source_url:page.url,retrieved_at:page.retrievedAt,source_sport:spec.sport,name,address,price,candidates});
  });
}
fs.writeFileSync(`${root}/aggregate-table-matches.json`,JSON.stringify(results,null,2));
console.log(JSON.stringify({rows:results.length,withCandidates:results.filter(r=>r.candidates.length).length,highConfidence:results.filter(r=>r.candidates[0]?.score>=1.3).length}));
for(const r of results.filter(r=>r.candidates[0]?.score>=1.05)) console.log(JSON.stringify({name:r.name,address:r.address,price:r.price,candidates:r.candidates.slice(0,2)}));
