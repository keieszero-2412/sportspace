import { randomInt } from 'node:crypto';
import { imageIdentity } from './venue-image-resolution.mjs';
// Only visually checked real photographs may enter the illustration pool.
// A URL change, crop or resize is NOT a new photograph.
export function allocateSportIllustrations(venues,pool,reservations=[]) {
  const usedUrls=new Set(reservations.map(item=>imageIdentity(item.url)));
  const usedHashes=new Set(reservations.map(item=>item.sha256).filter(Boolean));
  const available=[];
  for(const photo of pool){
    if(photo.kind!=='photograph'||photo.locationFree!==true||photo.visuallyChecked!==true||!photo.sport
      ||!photo.rightsConfirmed||!photo.sourceUrl||!/^[a-f0-9]{64}$/.test(photo.sha256||''))continue;
    let identity;try{identity=imageIdentity(photo.url);imageIdentity(photo.sourceUrl);}catch{continue;}
    if(usedUrls.has(identity)||usedHashes.has(photo.sha256))continue;
    usedUrls.add(identity);usedHashes.add(photo.sha256);available.push(photo);
  }
  // Cryptographically randomized shuffle, then draw without replacement.
  for(let index=available.length-1;index>0;index--){const swap=randomInt(index+1);[available[index],available[swap]]=[available[swap],available[index]];}
  const assigned=[],missing=[];
  for(const venue of venues){
    const index=available.findIndex(photo=>photo.sport===venue.sport);
    if(index<0){missing.push(venue.id);continue;}
    assigned.push({venueId:venue.id,photo:available.splice(index,1)[0],imageKind:'illustrative'});
  }
  return{assigned,missing};
}
