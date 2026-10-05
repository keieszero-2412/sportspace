// Offline validation. No network or Firebase access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseCsv,readCsv} from './lib/public-price-csv.mjs';
assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x,y","quote ""z""\nnext"\r\n'),[{a:'x,y',b:'quote "z"\nnext'}]);
assert.throws(()=>parseCsv('a,b\n"broken'),/Unterminated/);
const prices=readCsv('docs/data/gia-san-nguon-cong-khai.csv');
const coverage=readCsv('docs/data/gia-san-nguon-cong-khai-toan-bo.csv');
const report=JSON.parse(fs.readFileSync('docs/data/bao-cao-gia-san-nguon-cong-khai.json','utf8'));
const decisions=JSON.parse(fs.readFileSync('docs/data/doi-chieu-gia-bo-sung.json','utf8'));
const snapshot=JSON.parse(fs.readFileSync('data_export/coordinates/firestore-snapshot.json','utf8'));
const ids=new Set(snapshot.documents.map(d=>d.name.split('/').at(-1)));
assert.equal(new Set(coverage.map(r=>r.facility_id)).size,ids.size);
const approved=new Set(decisions.approved.map(r=>r.candidate_id));
assert.equal(approved.size,decisions.approved.length);
const seen=new Set();
for(const r of prices){
 assert(ids.has(r.facility_id));
 assert(Number(r.price_min_vnd)>0,`Invalid min ${r.facility_id}`);
 assert(r.price_max_vnd===''||Number(r.price_max_vnd)>=Number(r.price_min_vnd));
 assert.equal(new URL(r.source_url).protocol,'https:');
 if(['court_unknown_duration','court_match'].includes(r.price_basis))assert.equal(r.unit_minutes,'');
 if(r.price_basis==='court_hour')assert.equal(r.unit_minutes,'60');
 if(r.candidate_id){
  assert(approved.has(r.candidate_id));assert(!seen.has(r.candidate_id));seen.add(r.candidate_id);
  assert.equal(r.day_group,'unknown');
  assert(r.source_address && r.source_name && r.retrieved_at);
 }
 for(const t of [r.start_time,r.end_time])if(t)assert(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/.test(t),`Invalid time ${t}`);
 if(r.start_time && r.end_time)assert(r.start_time<r.end_time);
}
assert.equal(seen.size,approved.size);
assert.equal(report.pricedFacilities,new Set(prices.map(r=>r.facility_id)).size);
assert.equal(report.priceRows,prices.length);
assert.equal(report.coverageRows,coverage.length);
assert.equal(report.pricedFacilities+report.remainingFacilities,ids.size);
assert.equal(coverage.filter(r=>r.status==='curated_public_price').length,prices.length);
// Known false joins and basis mistakes must not reappear.
assert(!prices.some(r=>r.facility_id==='VN_0048'&&r.source_url.includes('163-tran-hoa')));
assert(!prices.some(r=>r.facility_id==='VN_0627'&&r.source_address?.includes('174')));
assert(!prices.some(r=>r.facility_id==='VN_1105'&&r.source_url.includes('bravo')));
const star=prices.filter(r=>r.facility_id==='VN_0097'&&r.candidate_id);
assert.deepEqual(star.map(r=>[r.start_time,r.end_time,r.price_min_vnd,r.price_max_vnd]),[['06:00','17:00','100000','100000'],['17:00','22:00','180000','180000']]);
assert.equal(prices.filter(r=>r.facility_id==='VN_0272'&&r.price_basis==='half_court_hour').length,2);
console.log(JSON.stringify({ok:true,facilities:ids.size,priced:report.pricedFacilities,rows:prices.length,approved:approved.size}));
