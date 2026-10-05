// Offline and idempotent: only explicit reviewed candidates are promoted.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readCsv,writeCsv} from './lib/public-price-csv.mjs';
const dir='docs/data',cache='data_export/price-expansion';
const curatedFile=`${dir}/gia-san-nguon-cong-khai.csv`,coverageFile=`${dir}/gia-san-nguon-cong-khai-toan-bo.csv`;
const decisions=JSON.parse(fs.readFileSync(`${dir}/doi-chieu-gia-bo-sung.json`,'utf8'));
const queue=JSON.parse(fs.readFileSync(`${cache}/review-queue.json`,'utf8'));
const allCandidates=[...queue.candidates,...(decisions.manual_candidates||[])];
const candidates=new Map(allCandidates.map(q=>[q.candidate_id,q]));
const curated=readCsv(curatedFile),oldCoverage=readCsv(coverageFile);
const baselineIds=new Set(curated.filter(r=>!r.candidate_id).map(r=>r.facility_id));
let added=0;
for(const decision of decisions.approved){
 const q=candidates.get(decision.candidate_id);assert(q,`Missing reviewed candidate ${decision.candidate_id}`);
 if(curated.some(r=>r.candidate_id===q.candidate_id))continue;
 assert(q.price_min_vnd>0 && (!q.price_max_vnd||q.price_min_vnd<=q.price_max_vnd));
 curated.push({facility_id:q.facility_id,facility_name:q.facility_name,day_group:'unknown',start_time:'',end_time:'',price_min_vnd:q.price_min_vnd,price_max_vnd:q.price_max_vnd,unit_minutes:q.unit_minutes,precision:q.precision,price_basis:q.price_basis,offer_type:q.offer_type,source_url:q.source_url,source_published_date:'',observed_at:q.retrieved_at?.slice(0,10)||'',confidence:'medium',verification_status:'public_source_matched',notes:decision.notes||'Giá tham khảo công khai; đã đối chiếu tên và địa chỉ. Chưa xác nhận giá đang áp dụng; nguồn không phân ngày/giờ.',source_name:q.source_name,source_address:q.source_address,source_sport:q.source_sport,retrieved_at:q.retrieved_at,candidate_id:q.candidate_id});
 const row=curated.at(-1);
 row.source_published_date=q.source_published_date||'';
 row.start_time=q.start_time||'';row.end_time=q.end_time||'';
 added++;
}
const headers=[...new Set(curated.flatMap(r=>Object.keys(r)))];
for(const row of curated.filter(r=>r.candidate_id)){
 const q=candidates.get(row.candidate_id);
 assert(q,`Missing provenance ${row.candidate_id}`);
 row.confidence=q.confidence || (row.price_basis==='court_hour'?'medium':'low');
 row.start_time=q.start_time||'';row.end_time=q.end_time||'';
 row.precision=q.precision;row.price_max_vnd=q.price_max_vnd;
}
writeCsv(curatedFile,curated,headers);
const byId=Map.groupBy(curated,r=>r.facility_id),oldById=new Map(oldCoverage.map(r=>[r.facility_id,r]));
const snapshot=JSON.parse(fs.readFileSync('data_export/coordinates/firestore-snapshot.json','utf8'));
const coverage=[];
for(const d of snapshot.documents){
 const id=d.name.split('/').at(-1),old=oldById.get(id);
 assert(old,`No coverage baseline for ${id}`);
 const rows=byId.get(id);
 if(!rows){coverage.push(old);continue;}
 for(const r of rows)coverage.push({facility_id:id,facility_name:d.fields.name.stringValue,address:d.fields.address.stringValue,sport:d.fields.sport.stringValue,status:'curated_public_price',day_group:r.day_group,start_time:r.start_time,end_time:r.end_time,price_min_vnd:r.price_min_vnd,price_max_vnd:r.price_max_vnd,unit_minutes:r.unit_minutes,precision:r.precision,source_url:r.source_url,retrieved_at:r.retrieved_at||'',observed_at:r.observed_at,confidence:r.confidence,evidence:r.notes,price_basis:r.price_basis,offer_type:r.offer_type,source_sport:r.source_sport||'',verification_status:r.verification_status});
}
writeCsv(coverageFile,coverage,[...new Set(coverage.flatMap(r=>Object.keys(r)))]);
const venues=snapshot.documents.map(d=>({id:d.name.split('/').at(-1),sport:d.fields.sport.stringValue}));
const counts=Object.fromEntries([...Map.groupBy(venues,v=>byId.has(v.id)?'curated_public_price':oldById.get(v.id).status)].map(([k,a])=>[k,a.length]));
const hourly=curated.filter(r=>r.price_basis==='court_hour'&&Number(r.unit_minutes)===60);
const sportMap=new Map(venues.map(v=>[v.id,v.sport]));
const sportCounts=[...Map.groupBy(venues,v=>v.sport)].map(([sport,vs])=>({sport,total:vs.length,withPublicPrice:vs.filter(v=>byId.has(v.id)).length,withHourlyPrice:new Set(hourly.filter(r=>sportMap.get(r.facility_id)===sport && (!r.source_sport||r.source_sport===sport)).map(r=>r.facility_id)).size}));
const report={generatedAt:new Date().toISOString(),totalFacilities:venues.length,baselinePricedFacilities:baselineIds.size,pricedFacilities:byId.size,newPricedFacilities:byId.size-baselineIds.size,coveragePercent:Number((byId.size/venues.length*100).toFixed(2)),remainingFacilities:venues.length-byId.size,priceRows:curated.length,coverageRows:coverage.length,hourlyPricedFacilities:new Set(hourly.map(r=>r.facility_id)).size,sourceDomains:[...new Set(curated.map(r=>new URL(r.source_url).hostname))],counts,sportCounts,localPagesScanned:queue.localPages,bookingPagesScanned:queue.bookingPages,candidateRows:queue.candidates.length,approvedCandidateRows:decisions.approved.length,remainingCandidateRows:queue.candidates.length-decisions.approved.length,caveats:['Coverage counts facility IDs, not deduplicated real-world venues.','Public reference prices are not verified current checkout prices.','Unknown days, times and duration are never inferred.','Source/local sport mismatches are excluded from hourly sport statistics.']};
report.candidateRows=allCandidates.length;
report.remainingCandidateRows=allCandidates.length-decisions.approved.length;
report.manualCandidateRows=(decisions.manual_candidates||[]).length;
fs.writeFileSync(`${dir}/bao-cao-gia-san-nguon-cong-khai.json`,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({added,...report},null,2));
