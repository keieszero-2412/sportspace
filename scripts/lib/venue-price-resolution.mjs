const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase();
export function priceIdentityScore(venue,candidate) {
 const words=norm(venue.name).replace(/[^a-z0-9]+/g,' ').split(' ').filter(w=>w&&!/^(san|bong|ban|ro|chuyen|da|cau|long|clb|cau|lac|bo|club|pickleball|tennis|court|sport|sports|the|thao|trung|tam|nha|thi|dau|dai|hoc|dh|ha|noi|ho|chi|minh|quan|phuong|so|indoor|facility|badminton|basketball|football)$/.test(w));
 if(!words.length)return null;
 const heading=norm(candidate.sourceName).replace(/[^a-z0-9]+/g,' '),text=norm(`${candidate.sourceName||''} ${candidate.sourceAddress||''} ${candidate.evidence||''}`);
 const coverage=words.filter(w=>new RegExp(`\\b${w}\\b`).test(heading)).length/words.length;
 if(coverage<.7)return null;
 const context=norm(`${candidate.sourceName||''} ${new URL(candidate.sourceUrl||'https://example.com').pathname.replaceAll('-',' ')}`);
 const sports=[['Tennis',/\btennis\b/],['Bóng đá',/\bbong da\b|\bfootball\b/],['Cầu lông',/\bcau long\b|\bbadminton\b/],['Bóng bàn',/\bbong ban\b|\btable tennis\b/],['Pickleball',/\bpickleball\b/],['Bóng rổ',/\bbong ro\b|\bbasketball\b/],['Bóng chuyền',/\bbong chuyen\b|\bvolleyball\b/]].filter(([,r])=>r.test(context)).map(([s])=>s);
 if(sports.length&&!sports.includes(venue.sport))return null;
 const address=norm(venue.address).split(/[^a-z0-9]+/).filter(w=>w.length>2),a=address.length?address.filter(w=>new RegExp(`\\b${w}\\b`).test(text)).length/address.length:0;
 const score=.6*coverage+.4*a;return score>=.5?score:null;
}
export const peakPrice=min=>Math.round(min*1.2/10000)*10000;
export function extractHourlyPrices(text) {
  const results=[];
  for(const line of String(text).split(/\n/)) {
    const n=norm(line);
    if(!/(gia|thue|chi phi)/.test(n)||!/(?:\/\s*(?:gio|h)\b|vnd\s*\/\s*gio)/.test(n)
      ||/nguoi|hoc phi|hoc ca nhan|hlv|hoi vien|thang|thue vot|gui xe|may ban bong|theo luot|\/\s*(?:1\s*)?buoi|nua san|half|san 5.*san 7|san 7.*san 5/.test(n))continue;
    const amounts=[...line.matchAll(/\b(\d{1,3}(?:[.,]\d{3})+|\d{2,4}\s*[kK])\s*(?:đ|₫|vnđ|vnd)?/gi)]
      .map(match=>/[kK]/.test(match[1])?parseInt(match[1])*1000:Number(match[1].replace(/[.,]/g,''))).filter(amount=>amount>=10000&&amount<=2000000);
    if(!amounts.length)continue;
    results.push({min:Math.min(...amounts),max:Math.max(...amounts),basis:'court_hour',unitMinutes:60,evidence:line.trim().slice(0,1600),
      dayType:/cuoi tuan|thu bay|chu nhat|t7|thu\s*7/.test(n)?'weekend':/ngay thuong|t2.*t6|thu\s*2.*thu\s*6|thu hai.*thu sau/.test(n)?'weekday':null});
  }
  return results;
}
export function hourlyChoices(venue,candidates,history=[]) {
  const decisions=new Map();for(const row of history)if(!decisions.has(row.data?.candidateId))decisions.set(row.data?.candidateId,row.status);
  return candidates.filter(c=>{
    if(c.basis!=='court_hour'||Number(c.unitMinutes)!==60||!Number.isSafeInteger(c.min)||!Number.isSafeInteger(c.max)||c.min<10000||c.max<c.min||c.max>2000000||!c.evidence||decisions.get(c.id)==='reject')return false;
    try{const url=new URL(c.sourceUrl);if(url.protocol!=='https:'||url.username||url.password||/muc-gia-trung-binh|\/category\//.test(url.pathname))return false;}catch{return false;}
    return priceIdentityScore(venue,c)!==null;
  }).sort((a,b)=>Number(Boolean(b.dayType))-Number(Boolean(a.dayType))||String(b.checkedAt||'').localeCompare(String(a.checkedAt||'')));
}
export function sourceSchedule(choices) {
  if(!choices.length)return null;
  const weekday=choices.find(c=>c.dayType==='weekday'),weekend=choices.find(c=>c.dayType==='weekend');
  const selected=choices[0],siblings=choices.filter(c=>c.sourceUrl===selected.sourceUrl&&!c.dayType);
  const min=weekday?.min??(siblings.length?Math.min(...siblings.map(c=>c.min)):selected.min),max=weekend?.max??Math.max(min,siblings.length?Math.max(...siblings.map(c=>c.max)):selected.max);
  if(max<min)return null;
  return {min,max,peak:peakPrice(min),method:'source',scheduleAssumed:!(weekday&&weekend),
    sources:[...new Map([weekday,weekend,selected,...siblings].filter(Boolean).map(c=>[c.id||`${c.sourceUrl}:${c.min}:${c.max}`,c])).values()]};
}
const distance=(a,b)=>{
  if(![a.lat,a.lng,b.lat,b.lng].every(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v))))return null;
  const rad=Math.PI/180,x=(a.lat-b.lat)*rad,y=(a.lng-b.lng)*rad;
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(x/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(y/2)**2)));
};
export function estimateSchedule(venue,seeds) {
  let peers=seeds.filter(seed=>seed.venue.sport===venue.sport&&seed.venue.id!==venue.id);
  if(!peers.length)return null;
  const local=peers.filter(seed=>seed.venue.province===venue.province);if(local.length>=3)peers=local;
  peers=peers.map(seed=>{const km=distance(venue,seed.venue),localWeight=seed.venue.province===venue.province?2:1;return {...seed,weight:localWeight/(1+(km??100))};}).sort((a,b)=>b.weight-a.weight).slice(0,8);
  const sum=peers.reduce((s,p)=>s+p.weight,0),weighted=key=>Math.round(peers.reduce((s,p)=>s+p.schedule[key]*p.weight,0)/sum/1000)*1000;
  const min=weighted('min'),max=Math.max(min,weighted('max'));
  return {min,max,peak:peakPrice(min),method:'estimated',scheduleAssumed:true,localPeers:Boolean(local.length),
    sources:peers.map(p=>({facilityId:p.venue.id,min:p.schedule.min,max:p.schedule.max,weight:p.weight,sourceUrl:p.schedule.sources[0].sourceUrl}))};
}
