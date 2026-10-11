import crypto from 'node:crypto';
import { topVenueChoices } from '../../src/services/venueReviewQueue.js';
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const nameWords=value=>normalize(value).split(' ').filter(word=>word.length>1&&!/^(san|bong|da|cau|long|clb|club|pickleball|tennis|court|sport|sports|the|thao|trung|tam)$/.test(word));
export function relaxedImageScore(venue,candidate) {
  const name=nameWords(venue.name),text=normalize(`${candidate.sourceName||''} ${candidate.sourceAddress||''} ${candidate.evidence||''}`);
  if(!name.length)return null;
  const coverage=name.filter(word=>new RegExp(`\\b${word}\\b`).test(text)).length/name.length;
  if(coverage<.7)return null;
  const mentionedSports=[['pickleball',/\bpickleball\b/],['cau long',/\bbadminton\b|\bcau long\b/],['bong da',/\bfootball\b|\bsoccer\b|\bbong da\b/],['bong ro',/\bbasketball\b|\bbong ro\b/],['bong ban',/\btable tennis\b|\bbong ban\b/],['bong chuyen',/\bvolleyball\b|\bbong chuyen\b/]];
  const sports=mentionedSports.filter(([,regex])=>regex.test(text)).map(([sport])=>sport);
  if(sports.length&&!sports.includes(normalize(venue.sport)))return null;
  const address=normalize(venue.address).split(' ').filter(word=>word.length>2&&!/^(viet|nam|tinh|thanh|pho|quan|phuong|duong)$/.test(word));
  const addressCoverage=address.length?address.filter(word=>new RegExp(`\\b${word}\\b`).test(text)).length/address.length:0;
  const score=Math.round((.6*coverage+.4*addressCoverage)*1000)/1000;
  return score>=.5?score:null;
}
export function relaxedImageChoices(venue,candidates,history=[]) {
  const strictIds=new Set(actualImageChoices(candidates).map(candidate=>candidate.id));
  const scored=candidates.flatMap(candidate=>{
    try{imageIdentity(candidate.value);imageIdentity(candidate.sourceUrl);}catch{return[];}
    if(!candidate.evidence||/logo|placeholder|mock|unsplash|wikimedia|avatar|favicon/i.test(candidate.value))return[];
    const score=relaxedImageScore(venue,candidate);
    if(score===null&&!strictIds.has(candidate.id))return[];
    return[{...candidate,score:score??1,identityConfidence:strictIds.has(candidate.id)?'source_name_address':'user_accepted_50_similarity'}];
  });
  // Rejections made by the earlier STRICT automatic filter may be reconsidered
  // only under this explicitly requested relaxed mode. Manual rejections stay.
  const decisions=history.filter(row=>!String(row.data?.reason||'').startsWith('Automatic correction: source title match'));
  const result=[];let remaining=scored;
  while(remaining.length){const best=topVenueChoices(remaining,decisions,'image');if(!best.length)break;result.push(...best);const values=new Set(best.map(item=>item.value));remaining=remaining.filter(item=>!values.has(item.value));}
  return result;
}
export function imageIdentity(value) {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('unsafe-image-url');
  url.hash='';
  for(const key of ['width','height','w','h','quality','q','utm_source','utm_medium','utm_campaign'])url.searchParams.delete(key);
  // Wikimedia thumbnails and their original are the same photograph.
  url.pathname=url.pathname.replace(/\/commons\/thumb\/(.+)\/[^/]+$/,'/commons/$1');
  return url.href;
}
export function actualImageChoices(candidates,history=[]) {
  return topVenueChoices(candidates.filter(candidate=>{
    try{imageIdentity(candidate.value);imageIdentity(candidate.sourceUrl);}catch{return false;}
    return Boolean(candidate.evidence)&&/^(?:source_matches_name_and_address|name_address|strict(?:_.*)?|verified(?:_.*)?|curated(?:_.*)?)$/.test(candidate.matchStatus||'')
      &&!/unverified|requires_recheck|weak/.test(candidate.matchStatus||'')
      &&!/logo|placeholder|mock|unsplash|wikimedia|avatar|favicon/i.test(candidate.value);
  }),history,'image');
}
export async function inspectImage(url) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  try{
    imageIdentity(url);
    const response=await fetch(url,{signal:controller.signal,redirect:'follow'});
    imageIdentity(response.url);
    if(!response.ok)throw new Error(`image-http-${response.status}`);
    if(!/^image\/(jpeg|png|webp)$/i.test((response.headers.get('content-type')||'').split(';')[0]))throw new Error('unsupported-image-content');
    const chunks=[];let bytes=0;
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>5*1024*1024)throw new Error('image-too-large');chunks.push(chunk);}
    const data=Buffer.concat(chunks);
    const jpeg=data[0]===255&&data[1]===216&&data[2]===255;
    const png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp=data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
    if(bytes<2048||!(jpeg||png||webp))throw new Error('invalid-image-bytes');
    return{sha256:crypto.createHash('sha256').update(data).digest('hex'),bytes,url:response.url};
  }finally{clearTimeout(timer);}
}
