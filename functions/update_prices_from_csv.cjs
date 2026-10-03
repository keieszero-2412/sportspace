const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = require('../sportspace-af6b4-5e4dea043c76.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function update() {
  const csv = fs.readFileSync('courts_prices.csv', 'utf8');
  const lines = csv.split('\n').slice(1).filter(l => l.trim());
  let batch = db.batch();
  let count = 0;
  let total = 0;
  
  console.log(`Bắt đầu cập nhật ${lines.length} sân...`);
  
  for (const line of lines) {
    const [courtId, facId, pDay, pNight, pWeekend, basePrice] = line.split(',');
    const ref = db.collection('Courts').doc(courtId);
    
    // Ghi dữ liệu vào batch
    batch.update(ref, {
      price_day: Number(pDay),
      price_night: Number(pNight),
      price_weekend: Number(pWeekend),
      basePrice: Number(basePrice)
    });
    
    count++;
    total++;
    
    // Firebase Batch giới hạn 500 operations mỗi lần, ta dùng 400 cho an toàn
    if (count === 400) {
      await batch.commit();
      console.log(`Đã ghi ${total} sân lên Database...`);
      batch = db.batch();
      count = 0;
    }
  }
  
  if (count > 0) {
    await batch.commit();
    console.log(`Đã ghi xong phần còn lại. Tổng cộng: ${total} sân được cập nhật.`);
  }
  
  console.log('Hoàn thành!');
  process.exit(0);
}

update().catch(console.error);
