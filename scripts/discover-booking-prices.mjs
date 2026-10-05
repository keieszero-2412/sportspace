// Public HTML GETs only; never credentials, Firebase SDKs or booking mutations.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {normalize,nameKey} from './lib/venue-phone-crawl.mjs';
const dir='data_export/price-expansion';
fs.mkdirSync(dir,{recursive:true});
const venues=JSON.parse(fs.readFileSync('data_export/coordinates/firestore-snapshot.json','utf8')).documents.map(d=>({id:d.name.split('/').at(-1),name:d.fields.name.stringValue,address:d.fields.address.stringValue}));
const keys=venues.map(v=>({...v,key:nameKey(v.name.split(' - ')[0])})).filter(v=>v.key.length>=4);
async function get(url){
 const file=`${dir}/${crypto.createHash('sha256').update(url).digest('hex')}.json`;
 if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
 const res=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{'User-Agent':'SportSpacePublicPriceResearch/1.0'}});
 const page={url,retrievedAt:new Date().toISOString(),status:res.status,html:res.ok?await res.text():''};
 fs.writeFileSync(file,JSON.stringify(page));return page;
}
const urls=new Set();
// LOOL was sampled manually; its schema/sport labels are not supported by this importer.
for(const domain of ['https://thegioithethao.vn']){
 const root=await get(`${domain}/sitemap.xml`);
 const locs=[...root.html.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
 let pages=locs.filter(u=>!u.endsWith('.xml'));
 for(const sitemap of locs.filter(u=>/sitemap-playground(?:-\d+)?\.xml$/.test(u))){
  const p=await get(sitemap);pages.push(...[...p.html.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]));
 }
 const candidates=pages.filter(u=>domain.includes('thegioithethao')?/-f-[a-z0-9]+$/i.test(u):/\/v\//.test(u));
 console.log(`${domain}: ${candidates.length} venue URLs`);
 for(const u of candidates){
  const slug=nameKey(decodeURI(u.split('/').at(-1)).replace(/-f-[a-z0-9]+$/i,''));
  if(keys.some(v=>(' '+slug+' ').includes(' '+v.key+' ')))urls.add(u);
 }
}
fs.writeFileSync(`${dir}/booking-urls.json`,JSON.stringify([...urls],null,2));
console.log(`Fetching ${urls.size} matching public venue pages`);
let cursor=0,done=0;const list=[...urls];
await Promise.all(Array.from({length:3},async()=>{while(cursor<list.length){const u=list[cursor++];try{await get(u);}catch(e){console.log('Failed',u,e.message);}done++;if(done%20===0)console.log(`Fetched ${done}/${list.length}`);await new Promise(r=>setTimeout(r,500));}}));
console.log('Done');
