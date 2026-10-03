const admin = require('firebase-admin');
const fs = require('fs');
const https = require('https');
const serviceAccount = require('../sportspace-af6b4-5e4dea043c76.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

function normalizePhone(value) {
  let digits = String(value || "").replace(/[\s().-]/g, "");
  if (digits.startsWith("+84")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("84")) digits = `0${digits.slice(2)}`;
  if (!/^(?:0[35789]\d{8}|02\d{9})$/.test(digits)) return null;
  if (/^(\d)\1+$/.test(digits.slice(1)) || /^(?:0123456789|0912345678|0987654321)$/.test(digits)) return null;
  return digits;
}

const fetchUrl = (url) => new Promise((resolve, reject) => {
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => resolve(data));
  }).on('error', reject);
});

async function crawlPhones() {
  const venuesPath = '../src/data/venues.json';
  const venues = JSON.parse(fs.readFileSync(venuesPath, 'utf8'));
  
  const toProcess = venues.filter(v => v.phone && v.phone.startsWith('098800') && v.source_url);
  console.log(`Found ${toProcess.length} mock phones to crawl.`);
  
  let successCount = 0;
  let batch = db.batch();
  let batchCount = 0;
  let totalCommitted = 0;
  
  const now = new Date().toISOString();
  const concurrency = 15;
  
  for (let i = 0; i < toProcess.length; i += concurrency) {
    const chunk = toProcess.slice(i, i + concurrency);
    const promises = chunk.map(async (v) => {
      try {
        const html = await fetchUrl(v.source_url);
        // Look for phone numbers in the HTML
        const phoneMatch = html.match(/(?:0|\+84)[35789]\d{8}/g);
        if (phoneMatch && phoneMatch.length > 0) {
          // Use the most frequent phone number or first
          const counts = {};
          let maxCount = 0;
          let bestPhone = phoneMatch[0];
          phoneMatch.forEach(p => {
            counts[p] = (counts[p] || 0) + 1;
            if (counts[p] > maxCount) {
              maxCount = counts[p];
              bestPhone = p;
            }
          });
          
          const norm = normalizePhone(bestPhone);
          if (norm && !norm.startsWith('098800')) {
            v.phone = norm;
            v.phone_status = "sourced";
            v.phone_sources = [{ url: v.source_url, phone: norm }];
            v.phone_checked_at = now;
            return { venue: v, success: true };
          }
        }
      } catch (e) {
        // Ignore fetch errors
      }
      return { venue: v, success: false };
    });
    
    const results = await Promise.all(promises);
    
    for (const res of results) {
      if (res.success) {
        successCount++;
        batch.update(db.collection('Facilities').doc(res.venue.id), {
          phone: res.venue.phone,
          phone_status: "sourced",
          phone_sources: res.venue.phone_sources,
          phone_checked_at: res.venue.phone_checked_at
        });
        batchCount++;
        
        if (batchCount === 400) {
          await batch.commit();
          batch = db.batch();
          totalCommitted += batchCount;
          batchCount = 0;
        }
      }
    }
    
    console.log(`Processed ${Math.min(i + concurrency, toProcess.length)} / ${toProcess.length}... Found ${successCount} real phones so far.`);
    // Save locally every 100
    if (i % 105 === 0) {
      fs.writeFileSync(venuesPath, JSON.stringify(venues, null, 2));
    }
  }
  
  if (batchCount > 0) {
    await batch.commit();
    totalCommitted += batchCount;
  }
  
  fs.writeFileSync(venuesPath, JSON.stringify(venues, null, 2));
  console.log(`\nCrawl complete! Found and updated ${successCount} real phone numbers out of ${toProcess.length}.`);
}

crawlPhones().catch(console.error);
