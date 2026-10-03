// Searches only missing venues from a local snapshot. No Firebase imports or calls.
import fs from 'node:fs';
import crypto from 'node:crypto';
import puppeteer from 'puppeteer-core';
import { Launcher } from 'chrome-launcher';
import { placeCoordinates, identityHints } from './lib/venue-coordinates.mjs';
const folder = 'data_export/coordinates';
fs.mkdirSync(`${folder}/lookups`, { recursive: true });
const missing = JSON.parse(fs.readFileSync(`${folder}/missing-before.json`, 'utf8'));
const overrideFile = `${folder}/query-overrides.json`;
const overrides = fs.existsSync(overrideFile) ? JSON.parse(fs.readFileSync(overrideFile, 'utf8')) : {};
const only = process.argv.find(a => a.startsWith('--ids='))?.slice(6).split(',');
const browser = await puppeteer.launch({ executablePath: Launcher.getInstallations()[0], headless: true, args: ['--disable-gpu'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', request => ['image', 'font', 'media'].includes(request.resourceType()) || request.url().includes('firestore.googleapis.com') ? request.abort() : request.continue());
  let done = 0;
  for (const venue of missing.filter(v => !only || only.includes(v.id))) {
    const query = overrides[venue.id] || `${venue.name}, ${venue.address}`;
    const hash = crypto.createHash('sha256').update(query).digest('hex').slice(0,12);
    const file = `${folder}/lookups/${venue.id}-${hash}.json`;
    if (fs.existsSync(file) && !(process.argv.includes('--retry-incomplete') && !JSON.parse(fs.readFileSync(file, 'utf8')).candidates?.length)) continue;
    const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&hl=vi`;
    const record = { id: venue.id, query, searchUrl, checkedAt: new Date().toISOString(), candidates: [] };
    try {
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() =>
        (document.querySelector('h1') && document.querySelector('[data-item-id="address"]')) ||
        document.querySelector('[role="feed"]') || /unusual traffic|không tìm thấy|could not find/i.test(document.body.innerText),
      { timeout: 20000 }).catch(() => {});
      // The detail panel can render before Maps updates its place URL.
      if (await page.$('[data-item-id="address"]')) {
        await page.waitForFunction(() => location.pathname.startsWith('/maps/place/'), { timeout: 8000 }).catch(() => {});
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
      const result = await page.evaluate(() => ({
        url: location.href,
        name: document.querySelector('h1')?.textContent?.trim() || '',
        address: document.querySelector('[data-item-id="address"]')?.getAttribute('aria-label') || '',
        summary: document.body.innerText.slice(0, 4500),
        results: [...document.querySelectorAll('a[href*="/maps/place/"]')].filter(a => a.getAttribute('aria-label')).slice(0, 8).map(a => ({
          name: a.getAttribute('aria-label'), url: a.href,
          summary: a.closest('[role="article"]')?.innerText || a.parentElement?.innerText || '',
        })),
      }));
      if (result.url.includes('/sorry/') || /unusual traffic|not a robot|không phải là rô.bốt/i.test(result.summary)) {
        throw new Error('ACCESS_CHALLENGE: stopped; no challenge bypass or automatic retry.');
      }
      const raw = result.name && result.address ? [result] : result.results;
      record.resultUrl = result.url;
      record.rawResults = raw.map(item => ({ name: item.name, address: item.address || '', url: item.url, summary: item.summary }));
      record.candidates = raw.map(item => ({ name: item.name, address: item.address || '', summary: item.summary, url: item.url,
        ...placeCoordinates(item.url), match: identityHints(venue, item),
      })).filter(item => item.lat !== undefined);
      record.status = record.candidates.length ? 'needs_review' : 'not_found';
      if (!record.candidates.length) record.note = result.summary.slice(0, 1000);
    } catch (error) {
      record.status = 'error'; record.note = error.message;
      fs.writeFileSync(file, JSON.stringify(record, null, 2));
      if (error.message.startsWith('ACCESS_CHALLENGE')) throw error;
    }
    fs.writeFileSync(file, JSON.stringify(record, null, 2));
    console.log(`${++done}: ${venue.id} ${record.status} (${record.candidates.length} candidate pins)`);
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
} finally { await browser.close(); }
