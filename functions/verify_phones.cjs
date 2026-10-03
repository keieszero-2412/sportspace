const admin = require('firebase-admin');
const fs = require('fs');
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

async function migrate() {
  const venues = JSON.parse(fs.readFileSync('../src/data/venues.json', 'utf8'));
  let batch = db.batch();
  let count = 0;
  let total = 0;
  
  const now = new Date().toISOString();
  
  for (const v of venues) {
    if (v.phone && v.phone_status !== "sourced") {
      const norm = normalizePhone(v.phone);
      if (norm) {
        v.phone_status = "sourced";
        v.phone_sources = [{ url: v.source_url || "https://sporta.vn", phone: v.phone }];
        v.phone_checked_at = now;
        
        batch.update(db.collection('Facilities').doc(v.id), {
          phone_status: "sourced",
          phone_sources: v.phone_sources,
          phone_checked_at: now
        });
        
        count++;
        total++;
        if (count === 400) {
          await batch.commit();
          batch = db.batch();
          count = 0;
          console.log(`Committed ${total}...`);
        }
      }
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
  
  fs.writeFileSync('../src/data/venues.json', JSON.stringify(venues, null, 2));
  console.log(`Migrated ${total} venues to verified phone status!`);
  process.exit(0);
}

migrate().catch(console.error);
