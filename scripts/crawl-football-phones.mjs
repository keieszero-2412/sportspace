import fs from 'node:fs';
import * as cheerio from 'cheerio';
import { page, folder } from './crawl-venue-phones.mjs';
import { nameKey, overlap } from './lib/venue-phone-crawl.mjs';

const start = 'https://diadiem247.com/san-bong-da-c301.html';
const $ = cheerio.load((await page(start)).html);
const category = $('#more-location').attr('data-category-id');
if (!category) throw new Error('Public pagination no longer present; review the source.');
const all = new Map();
$('a[href]').each((_, el) => {
  const href = $(el).attr('href');
  if (/san-bong.*-l\d+\.html$/.test(href)) all.set(href, { href, name: $(el).text().trim() });
});
for (let number = 2; number <= 150; number++) {
  const file = `${folder}/diadiem-list-${number}.json`;
  let result;
  if (fs.existsSync(file)) result = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!result) {
    await new Promise(resolve => setTimeout(resolve, 800));
    const response = await fetch('https://diadiem247.com/index/get-location-ajax', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SportSpaceContactAudit/1.0', 'X-Requested-With': 'XMLHttpRequest', Referer: start },
      body: new URLSearchParams({ category_id: category, page: String(number) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Public pagination HTTP ${response.status}; stopped.`);
    result = await response.json();
    fs.writeFileSync(file, JSON.stringify(result));
  }
  if (!result?.success || !Array.isArray(result.location_list)) throw new Error('Unexpected public listing response.');
  if (!result.location_list.length) break;
  const previous = all.size;
  for (const item of result.location_list) all.set(item.href, item);
  if (all.size === previous) break;
  if (number % 10 === 0) console.log(`Football directory: ${all.size} venues discovered.`);
}
const venues = JSON.parse(fs.readFileSync('src/data/venues.json', 'utf8'));
const selected = [...all.values()].filter(item => venues.some(v => {
  const a = nameKey(v.name), b = nameKey(item.name);
  const shared = a.split(' ').filter(w => b.split(' ').includes(w));
  return overlap(a, b) >= .8 && (shared.length >= 2 || shared.some(w => w.length >= 5));
}));
fs.writeFileSync(`${folder}/diadiem-discovered.json`, JSON.stringify([...all.values()], null, 2));
console.log(`Football directory: reading ${selected.length}/${all.size} matching venue pages.`);
let done = 0;
for (const item of selected) {
  const url = new URL(item.href, 'https://diadiem247.com');
  if (url.hostname !== 'diadiem247.com') continue;
  await page(url.href);
  if (++done % 20 === 0) console.log(`Football detail pages: ${done}/${selected.length}`);
}
