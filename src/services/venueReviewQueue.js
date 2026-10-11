import { normalizePhone } from './venuePhone.js';
export const venueReviewFields = ['phone','image','price_summary'];
// Relative ranking, not a claim of verified accuracy. Prefer explicit matching
// evidence, independent supporting sources and documented price units.
export function topVenueChoices(candidates = [], history = [], field) {
  const score = candidate => {
    const status = String(candidate.matchStatus || '');
    let points = Math.max(0, Math.min(1, Number(candidate.score) || 0)) * 40;
    if (/name_address|strict|verified|curated/.test(status) && !/unverified/.test(status)) points += 30;
    if (/requires_recheck|weak|unverified/.test(status)) points -= 15;
    if (candidate.sourceName) points += 5;
    if (candidate.sourceAddress) points += 5;
    if (candidate.evidence) points += 5;
    points += Math.min(3, candidate.sources?.length || 1) * 4;
    if (field === 'image' && /logo|placeholder|wikimedia|unsplash/i.test(candidate.value)) points -= 100;
    if (field === 'price_summary' && candidate.basis && candidate.basis !== 'unknown') points += 10;
    return points;
  };
  return candidateChoices(candidates, history, field)
    .sort((a,b) => score(b)-score(a) || String(b.checkedAt || '').localeCompare(String(a.checkedAt || '')) || String(a.id).localeCompare(String(b.id)))
    .slice(0,3);
}
export function candidateChoices(candidates = [], history = [], field) {
  const decisions = new Map();
  for (const row of history.filter(row => row.field === field && row.data?.candidateId)) {
    const previous = decisions.get(row.data.candidateId);
    if (!previous || row.createdAt > previous.createdAt || row.createdAt === previous.createdAt && row.id > previous.id) decisions.set(row.data.candidateId, row);
  }
  const rejected = new Set([...decisions].filter(([, row]) => row.status === 'reject').map(([id]) => id));
  const grouped = new Map();
  for (const candidate of candidates) {
    if (rejected.has(candidate.id)) continue;
    const key = field === 'price_summary' ? JSON.stringify([candidate.min,candidate.max,candidate.basis,candidate.unitMinutes]) : candidate.value;
    if (!grouped.has(key)) grouped.set(key,{...candidate,sources:[]});
    const choice = grouped.get(key);
    if (!choice.sources.some(source=>source.sourceUrl===candidate.sourceUrl)) choice.sources.push(candidate);
  }
  return [...grouped.values()];
}
export function venueReviewQueue(venues, sources, history = []) {
  const byVenue = new Map(), phones = new Map();
  for (const venue of venues) if (venue.phone) phones.set(venue.phone,(phones.get(venue.phone)||0)+1);
  for (const row of history) {
    if (!byVenue.has(row.facilityId)) byVenue.set(row.facilityId,[]);
    byVenue.get(row.facilityId).push(row);
  }
  return venues.map(venue=>({...venue,reviewTasks:Object.fromEntries(venueReviewFields.map(field=>{
    const current=venue[field];
    const choices=candidateChoices(sources[venue.id]?.[field],byVenue.get(venue.id),field);
    const approved=(byVenue.get(venue.id) || []).some(row => row.field === field && row.status === 'approve' && row.data?.value === current);
    let reason=!current?'missing':'unverified';
    if(field==='phone' && current && (!normalizePhone(current) || current==='0598370497'))reason='invalid_phone';
    else if(field==='phone' && (phones.get(current)||0)>3)reason='repeated_phone';
    else if(field==='image' && /wikimedia|unsplash|placeholder|\/logo\./i.test(current||''))reason='generic_image';
    return [field,{reason,choices,status:approved?'verified':choices.length>1?'choose':choices.length?'review':'research'}];
  }))}));
}
export async function fetchVenueReviewRecords(client,signal) {
  const rows=[];
  let cursor;
  for(;;){
    let query=client.from('VenueDataReviews').select('id,facilityId,field,status,data,createdAt').order('id').limit(500);
    if(cursor)query=query.gt('id',cursor);
    const {data,error}=await query.abortSignal(signal);
    if(error)throw error;
    rows.push(...(data||[]));
    if(!data || data.length<500)return rows;
    cursor=data.at(-1).id;
  }
}
