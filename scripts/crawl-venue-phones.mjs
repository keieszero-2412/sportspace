// Read-only public-page crawl. Never writes to Firestore or the venue catalogue.
// Cached pages allow matching/parsing to be repeated without hitting source sites.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';

export const folder = 'data_export/phone-crawl';
fs.mkdirSync(`${folder}/pages`, { recursive: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const failures = [];
export async function page(url) {
  const file = `${folder}/pages/${crypto.createHash('sha256').update(url).digest('hex')}.json`;
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  await pause(700);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'SportSpaceContactAudit/1.0 (public venue contact verification)', Accept: 'text/html,application/xml' },
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = { url, retrievedAt: new Date().toISOString(), html: await response.text() };
    fs.writeFileSync(file, JSON.stringify(value));
    return value;
  } catch (error) {
    failures.push({ url, error: error.message });
    return { url, html: '', error: error.message };
  }
}
function locations(html) {
  const $ = cheerio.load(html, { xml: true });
  return $('loc').map((_, el) => $(el).text()).get();
}
const args = new Set(process.argv.slice(2));
if (args.has('--discover')) {
  const lists = await Promise.all([
    page('https://www.alobo.vn/post-sitemap.xml'),
    page('https://sanpick.com/post-sitemap.xml'),
    page('https://shopvnb.com/sitemaps.xml'),
  ]);
  const alobo = locations(lists[0].html).filter(url => /san-|pickleball|badminton|sport|lien-chau|dat-san/.test(url) && !/phan-mem|chi-phi|luat-|kinh-doanh|thi-cong|kich-thuoc|tieu-chuan|cach-tinh|mua-vot/.test(url));
  const sanpick = locations(lists[1].html).filter(url => /danh-sach|tong-hop|san-pickleball/.test(url) && !/dich-vu|thi-cong|quang-cao|google-map|chi-phi|thiet-ke/.test(url));
  const newsMaps = locations(lists[2].html).filter(url => /\/tin-tuc\//.test(url));
  const vnb = [];
  for (const url of newsMaps) vnb.push(...locations((await page(url)).html).filter(x => /san-cau-long|san-pickleball|san-tennis|san-bong/.test(x)));
  const result = { alobo, sanpick, vnb: [...new Set(vnb)], failures };
  fs.writeFileSync(`${folder}/urls.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.length]))));
}
if (args.has('--crawl')) {
  const lists = JSON.parse(fs.readFileSync(`${folder}/urls.json`, 'utf8'));
  const group = process.argv.find(x => x.startsWith('--source='))?.split('=')[1];
  const groups = group ? [group] : ['alobo', 'sanpick', 'vnb'];
  // Sequential per host, up to three independent hosts in parallel.
  await Promise.all(groups.map(async key => {
    let count = 0;
    for (const url of lists[key] || []) {
      await page(url);
      count += 1;
      if (count % 10 === 0) console.log(`${key}: ${count}/${lists[key].length}`);
    }
  }));
  fs.writeFileSync(`${folder}/failures-${Date.now()}.json`, JSON.stringify(failures, null, 2));
  console.log(`Crawl complete; ${failures.length} failed pages (no access controls bypassed).`);
}
