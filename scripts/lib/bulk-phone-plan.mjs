import crypto from 'node:crypto';
import { normalizePhone } from '../../src/services/venuePhone.js';
import { topVenueChoices } from '../../src/services/venueReviewQueue.js';
import { phonesIn } from './venue-phone-crawl.mjs';
export function usablePhoneCandidate(candidate) {
  const phone=normalizePhone(candidate.value);
  if(!phone||phone==='0598370497'||phonesIn(phone).length!==1
    ||!/^(?:03[2-9]\d{7}|05[25689]\d{7}|07[06789]\d{7}|08[1-9]\d{7}|09[0-46-9]\d{7}|02\d{9})$/.test(phone))return false;
  try{const url=new URL(candidate.sourceUrl);return url.protocol==='https:'&&!url.username&&!url.password
    &&!/(^|\.)(test|localhost)$|^example\.(com|org|net)$/i.test(url.hostname)&&Boolean(candidate.evidence);}
  catch{return false;}
}
export function bulkPhonePlan(venue,candidates=[],history=[]) {
  const normalized=candidates.filter(usablePhoneCandidate).map(candidate=>({...candidate,value:normalizePhone(candidate.value),
    id:candidate.id||crypto.createHash('sha256').update(JSON.stringify([venue.id,candidate.value,candidate.sourceUrl])).digest('hex').slice(0,24)}));
  const byId=new Map();for(const candidate of normalized){
    if(byId.has(candidate.id)&&byId.get(candidate.id).value!==candidate.value)throw new Error('Conflicting phone candidate ID');
    byId.set(candidate.id,candidate);
  }
  const valid=[...byId.values()];
  const approvedCurrent=history.find(row=>row.field==='phone'&&row.status==='approve'&&row.data?.value===venue.phone);
  if(!valid.length)return{action:approvedCurrent?'keep':'hide',candidates:[],excluded:candidates.length};
  // Blanket approval overrides previous candidate rejections only because the user explicitly requested ALL.
  const preferred=approvedCurrent?valid.find(candidate=>candidate.value===venue.phone):null;
  const selected=preferred||topVenueChoices(valid,[],'phone')[0];
  const latest=new Map();
  for(const row of history.filter(row=>row.field==='phone'&&row.data?.candidateId)){
    const prior=latest.get(row.data.candidateId);
    if(!prior||new Date(row.createdAt)>new Date(prior.createdAt)||+new Date(row.createdAt)===+new Date(prior.createdAt)&&row.id>prior.id)latest.set(row.data.candidateId,row);
  }
  const pending=valid.filter(candidate=>latest.get(candidate.id)?.status!=='approve');
  if(!pending.length&&venue.phone===selected.value&&venue.phone_status==='sourced')return{action:'keep',candidates:[],excluded:candidates.length-valid.length};
  // Every candidate gets a history record; the chosen primary is applied last inside one transaction.
  const ordered=pending.filter(candidate=>candidate.id!==selected.id);
  ordered.push(selected);
  return{action:'approve',candidates:ordered,selected,
    selectedSources:valid.filter(candidate=>candidate.value===selected.value),excluded:candidates.length-valid.length};
}
