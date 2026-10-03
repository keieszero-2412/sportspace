import * as cheerio from 'cheerio';
import { normalizePhone } from '../../src/services/venuePhone.js';

export const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Public support/sales numbers of the source websites, never venue contacts.
const platformPhones = new Set(['0816996839', '0967373003', '0918493225', '0918109405', '0984090432', '0977508430', '0947342259', '0911195711', '0911105211', '0334741141', '0338000308', '02473030247', '0982421313', '0335088588', '0346673287']);
export function phonesIn(text) {
  return [...new Set((String(text).match(/(?<!\d)(?:\+84|84|0)(?:[ .()-]*\d){8,11}(?!\d)/g) || [])
    .map(normalizePhone).filter(n => n && !platformPhones.has(n)))];
}
export function extractContacts(page) {
  const { url, html, retrievedAt } = page;
  const $ = cheerio.load(html);
  if (url.includes('diadiem247.com') && /-l\d+\.html$/.test(url)) {
    const records = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).text());
        if (data['@type'] !== 'LocalBusiness' || !data.telephone || typeof data.address !== 'string') return;
        for (const phone of phonesIn(data.telephone)) records.push({
          name: data.name, title: data.name, address: data.address, phone, url,
          checkedAt: retrievedAt, evidence: `LocalBusiness.telephone: ${data.telephone}`,
        });
      } catch { /* Malformed metadata needs manual review. */ }
    });
    return records;
  }
  $('script,style,nav,footer,aside,.related-posts,.comment-respond').remove();
  const title = $('h1').first().text().trim();
  const container = url.includes('shopvnb.com') ? $('.article-details .rte').first()
    : url.includes('sanpick.com') ? $('.entry-content').first() : $('article').first();
  if (!container.length) return [];
  const rows = [];
  let heading = title, lines = [];
  const flush = () => {
    const addresses = lines.filter(t => /địa\s*chỉ\s*:/i.test(t)).map(t =>
      t.split(/địa\s*chỉ\s*:/i)[1].split(/hotline|điện thoại|giờ mở|link map|📞|☎/i)[0].trim());
    const phoneLines = lines.filter(t => /điện\s*thoại|hotline|sđt|liên\s*hệ|đặt\s*sân|gọi.*số/i.test(t));
    if (addresses.length !== 1) return; // Multiple branches require separate review.
    for (const line of phoneLines) for (const phone of phonesIn(line)) {
      rows.push({ name: heading, title, address: addresses[0], phone, url, checkedAt: retrievedAt,
        evidence: line.slice(0, 700) });
    }
  };
  container.find('h1,h2,h3,h4,p,li').each((_, el) => {
    // A list item containing a paragraph is visited once at the paragraph.
    if ($(el).is('li') && $(el).find('p').length) return;
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (/^h[1-4]$/.test(el.tagName)) {
      flush(); lines = []; heading = t;
    } else if (t) lines.push(t);
  });
  flush();
  return rows;
}
const generic = /\b(san|cau|long|bong|da|pickleball|tennis|clb|club|cum|co|nhan|tao|the|thao|trung|tam|indoor|facility|badminton)\b/g;
export function nameKey(s) { return normalize(s).replace(generic, ' ').replace(/\s+/g, ' ').trim(); }
export function overlap(a, b) {
  const left = new Set(normalize(a).split(' ').filter(Boolean));
  const right = new Set(normalize(b).split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  return [...left].filter(w => right.has(w)).length / Math.min(left.size, right.size);
}
export function matchScore(venue, contact) {
  const sportTerms = { 'Bóng đá': /bong da|san bong\b|san co\b/, 'Cầu lông': /cau long|badminton/, 'Pickleball': /pickleball/, 'Bóng rổ': /bong ro|basketball/, 'Bóng bàn': /bong ban|table tennis/, 'Bóng chuyền': /bong chuyen|volleyball/, 'Tennis': /tennis/ };
  const sourceName = normalize(contact.name);
  const mentioned = Object.entries(sportTerms).filter(([, regex]) => regex.test(sourceName)).map(([sport]) => sport);
  if (mentioned.length && !mentioned.includes(venue.sport)) return null;
  const name = nameKey(venue.name), candidate = nameKey(contact.name);
  if (!name || !candidate || /\b(demo|test)\b/.test(candidate)) return null;
  const nameOverlap = overlap(name, candidate);
  const venueWords = name.split(' '), candidateWords = candidate.split(' ');
  const common = venueWords.filter(w => candidateWords.includes(w));
  // Require the identifying name and address, never just the province or sport.
  if (nameOverlap < .75 || (common.length < 2 && !common.some(w => w.length >= 5))) return null;
  const address = normalize(venue.address), sourceAddress = normalize(contact.address);
  const addressOverlap = overlap(address, sourceAddress);
  const province = normalize(venue.province).replace(/^tinh |^thanh pho /, '');
  const provinceMatch = sourceAddress.includes(province) ||
    (province.includes('ho chi minh') && /\b(tphcm|hcm|ho chi minh)\b/.test(sourceAddress));
  const numbers = address.match(/\b\d+[a-z]?\b/g) || [];
  const numberMatch = numbers.some(n => new RegExp(`\\b${n}\\b`).test(sourceAddress));
  const usefulAddress = address.split(' ').filter(w => !['quan','phuong','thanh','pho','duong','tinh','viet','nam','ha','noi','ho','chi','minh'].includes(w));
  const commonAddress = usefulAddress.filter(w => sourceAddress.split(' ').includes(w)).length;
  if (!provinceMatch || addressOverlap < .55 || commonAddress < 3) return null;
  // Missing numbered address must have a particularly strong location match.
  if (numbers.length && !numberMatch && addressOverlap < .88) return null;
  return { nameOverlap, addressOverlap, numberMatch, score: nameOverlap + addressOverlap };
}
