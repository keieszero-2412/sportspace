import * as cheerio from 'cheerio';
import { extractContacts, phonesIn, matchScore, normalize, nameKey, overlap } from './venue-phone-crawl.mjs';
import { normalizePhone } from '../../src/services/venuePhone.js';

export function readPhoneContacts(page) {
  const records = extractContacts(page);
  const $ = cheerio.load(page.html);
  const addressText = address => typeof address === 'string' ? address : address
    ? [address.streetAddress, address.addressLocality, address.addressRegion, address.addressCountry].filter(Boolean).join(', ') : '';
  const flatten = value => Array.isArray(value) ? value.flatMap(flatten) : value && typeof value === 'object'
    ? [value, ...flatten(value['@graph'] || [])] : [];
  $('script[type="application/ld+json"]').each((_, element) => {
    let data;
    try { data = JSON.parse($(element).text()); } catch { return; }
    for (const item of flatten(data)) {
      if (!/LocalBusiness|SportsActivityLocation|StadiumOrArena|SportsClub/.test(String(item['@type']))) continue;
      if (!item.name || !addressText(item.address)) continue;
      for (const phone of phonesIn(item.telephone)) records.push({ name: item.name, address: addressText(item.address),
        phone, url: page.url, checkedAt: page.retrievedAt, evidence: `Venue structured telephone: ${item.telephone}` });
    }
  });
  const title=$('h1').first().text().trim();
  const city=/hà nội/i.test(title)?'Hà Nội':/hồ chí minh|tphcm/i.test(title)?'Hồ Chí Minh':null;
  // Named venue rows only; never collect site-wide footer/support phones.
  $('article table, main table, .article-template table').each((_,table)=>{
    const rows=$(table).find('tr').toArray();
    const headers=rows.length?$(rows[0]).find('th,td').map((_,cell)=>$(cell).text().trim()).get():[];
    const nameColumn=headers.findIndex(value=>/^sân$|tên sân|tên địa điểm/i.test(value));
    const addressColumn=headers.findIndex(value=>/địa chỉ/i.test(value));
    const phoneColumn=headers.findIndex(value=>/điện thoại|hotline|sđt|liên hệ đặt sân/i.test(value));
    if(nameColumn<0||addressColumn<0||phoneColumn<0)return;
    for(const row of rows.slice(1)){
      const cells=$(row).find('th,td').map((_,cell)=>$(cell).text().trim()).get();
      const name=cells[nameColumn],rawAddress=cells[addressColumn];if(!name||!rawAddress)continue;
      const address=city&&!normalize(rawAddress).includes(normalize(city))?`${rawAddress}, ${city}`:rawAddress;
      for(const phone of phonesIn(cells[phoneColumn]))records.push({name,address,phone,url:page.url,checkedAt:page.retrievedAt,
        evidence:`Public named venue table: ${name}; ${rawAddress}; telephone ${phone}; geographic context: ${city||'explicit row address'}`});
    }
  });
  if(new URL(page.url).hostname==='pickleballplus.vn'){
    const addressLines=$('main li, article li').map((_,element)=>$(element).text().trim()).get().filter(text=>/^Địa chỉ\s*:/i.test(text));
    const phoneLines=$('main li, article li').map((_,element)=>$(element).text().trim()).get().filter(text=>/^Phone\s*:/i.test(text));
    if(title&&addressLines.length===1&&phoneLines.length===1)for(const phone of phonesIn(phoneLines[0]))records.push({name:title,
      address:addressLines[0].replace(/^Địa chỉ\s*:/i,''),phone,url:page.url,checkedAt:page.retrievedAt,evidence:phoneLines[0]});
  }
  if (new URL(page.url).hostname.endsWith('sporta.vn')) {
    // Only rendered public descriptive paragraphs, never gated contact widgets or script data.
    const name = $('h1').first().text().trim();
    $('main p, article p').each((_, element) => {
      const text = $(element).text().replace(/\s+/g,' ').trim();
      const address = text.match(/Địa\s*chỉ\s*:\s*(.*?)\s*(?:Quy\s*mô|Thời\s*gian\s*hoạt\s*động|Số\s*điện\s*thoại|Giá\s*thuê)\s*:/i)?.[1];
      const telephone = text.match(/(?:Số\s*)?điện\s*thoại\s*(?:liên\s*hệ)?\s*:\s*((?:\+84|0)[\d .()-]+)/i)?.[1];
      if (!name || !address || !telephone) return;
      for (const phone of phonesIn(telephone)) records.push({name,address,phone,url:page.url,checkedAt:page.retrievedAt,
        evidence:`Public venue description: ${name}; ${address}; telephone ${telephone.trim()}`});
    });
  }
  return records;
}

export function strictPhoneMatch(venue, record) {
  const phone = normalizePhone(record.phone);
  // Real mobile prefix allocations, plus domestic geographic landlines.
  if (!phone || !/^(?:03[2-9]\d{7}|05[25689]\d{7}|07[06789]\d{7}|08[1-9]\d{7}|09[0-46-9]\d{7}|02\d{9})$/.test(phone)
    || phone === '0598370497' || phonesIn(phone).length !== 1) return false;
  const score = matchScore(venue, record);
  if (!score || score.nameOverlap < .85 || score.addressOverlap < .8) return false;
  const numbers = normalize(venue.address).match(/\b\d+[a-z]?\b/g) || [];
  const address = normalize(record.address);
  return numbers.every(number => new RegExp(`\\b${number}\\b`).test(address));
}

// A heuristic similarity score, NOT a measured probability of ownership.
export function loosePhoneMatch(venue, record) {
  const phone = normalizePhone(record.phone);
  if (!phone || phone === '0598370497' || phonesIn(phone).length !== 1
    || !/^(?:03[2-9]\d{7}|05[25689]\d{7}|07[06789]\d{7}|08[1-9]\d{7}|09[0-46-9]\d{7}|02\d{9})$/.test(phone)) return null;
  const name = nameKey(venue.name), other = nameKey(record.name);
  if (!name || !other || /\b(mock|demo|test)\b/.test(other)) return null;
  const shared = name.split(' ').filter(word => other.split(' ').includes(word));
  if (!shared.some(word => word.length >= 4) && shared.length < 2) return null;
  const address = normalize(venue.address), sourceAddress = normalize(record.address);
  const province = normalize(venue.province).replace(/^tinh |^thanh pho /, '');
  const nameScore = overlap(name,other), addressScore = overlap(address,sourceAddress);
  const provinceMatches=province&&(sourceAddress.includes(province)
    || province.includes('ho chi minh') && /\b(tphcm|tp hcm|hcm)\b/.test(sourceAddress));
  // Native province labels and source addresses can use different region labels.
  // Allow a weak candidate only when the actual venue name AND street address strongly agree.
  const streetNumbers=address.match(/\b\d+[a-z]?\b/g)||[];
  const distinctStreet=streetNumbers.length>=2&&streetNumbers.every(number=>new RegExp(`\\b${number}\\b`).test(sourceAddress));
  if(!sourceAddress||!provinceMatches&&!(nameScore>=.85&&(addressScore>=.85||addressScore>=.7&&distinctStreet)))return null;
  const generic = new Set(['quan','phuong','thanh','pho','duong','tinh','viet','nam','ha','noi','ho','chi','minh']);
  const addressShared = new Set(address.split(' ').filter(word => !generic.has(word) && sourceAddress.split(' ').includes(word)));
  if (addressShared.size < 2) return null;
  const sourceName = normalize(record.name), sport = normalize(venue.sport);
  if (/pickleball/.test(sourceName) && !sport.includes('pickleball')) return null;
  if (/cau long|badminton/.test(sourceName) && !/cau long|badminton/.test(sport)) return null;
  if (/bong da|san bong\b|san banh/.test(sourceName) && !sport.includes('bong da')) return null;
  const score = .55 * nameScore + .45 * addressScore;
  return nameScore >= .5 && addressScore >= .35 && score >= .5 ? Number(score.toFixed(3)) : null;
}

export function phoneDecisions(venues, contacts, reviews = []) {
  const matches = new Map(), skips = new Map();
  const wordIndex = new Map();
  for (const venue of venues) for (const word of new Set(nameKey(venue.name).split(' '))) {
    if (word.length < 2) continue;
    if (!wordIndex.has(word)) wordIndex.set(word,new Set());
    wordIndex.get(word).add(venue);
  }
  for (const contact of contacts) {
    const candidates = new Set(nameKey(contact.name).split(' ').flatMap(word => [...(wordIndex.get(word) || [])]));
    const targets = [...candidates].filter(venue => strictPhoneMatch(venue, contact));
    if (targets.length !== 1) continue;
    const id = targets[0].id;
    if (!matches.has(id)) matches.set(id, []);
    matches.get(id).push(contact);
  }
  const owners = new Map();
  for (const [id, records] of matches) for (const record of records) {
    if (!owners.has(record.phone)) owners.set(record.phone, new Set());
    owners.get(record.phone).add(id);
  }
  const decisions = [];
  for (const venue of venues) {
    const records = matches.get(venue.id) || [];
    const skip = reason => skips.set(reason, (skips.get(reason) || 0) + 1);
    const history = reviews.filter(row => row.facilityId === venue.id && row.field === 'phone');
    if (history.some(row => row.status === 'approve' && row.data?.value === venue.phone)) { skip('already_approved'); continue; }
    if (!records.length) { skip('no_strict_live_match'); continue; }
    const numbers = [...new Set(records.map(record => record.phone))];
    if (numbers.length !== 1) { skip('conflicting_live_numbers'); continue; }
    const value = numbers[0];
    if (owners.get(value).size !== 1) { skip('shared_number_requires_manual_review'); continue; }
    if (history.some(row => row.status === 'reject' && row.data?.value === value)) { skip('previously_rejected'); continue; }
    decisions.push({ venue, value, records: [...new Map(records.map(record => [record.url, record])).values()] });
  }
  return { decisions, skipped: Object.fromEntries(skips) };
}
