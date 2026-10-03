const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = require('../sportspace-af6b4-5e4dea043c76.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const mapping = {
  "Thừa Thiên Huế": "Huế",
  "Hà Giang": "Tuyên Quang",
  "Yên Bái": "Lào Cai",
  "Bắc Kạn": "Thái Nguyên",
  "Vĩnh Phúc": "Phú Thọ",
  "Hòa Bình": "Phú Thọ",
  "Bắc Giang": "Bắc Ninh",
  "Thái Bình": "Hưng Yên",
  "Hải Dương": "Hải Phòng",
  "Nam Định": "Ninh Bình",
  "Hà Nam": "Ninh Bình",
  "Quảng Bình": "Quảng Trị",
  "Quảng Nam": "Đà Nẵng",
  "Kon Tum": "Quảng Ngãi",
  "Bình Định": "Gia Lai",
  "Ninh Thuận": "Khánh Hòa",
  "Đắk Nông": "Lâm Đồng",
  "Bình Thuận": "Lâm Đồng",
  "Phú Yên": "Đắk Lắk",
  "Bình Dương": "Hồ Chí Minh",
  "Bà Rịa - Vũng Tàu": "Hồ Chí Minh",
  "Bà Rịa-Vũng Tàu": "Hồ Chí Minh",
  "Bình Phước": "Đồng Nai",
  "Long An": "Tây Ninh",
  "Hậu Giang": "Cần Thơ",
  "Trà Vinh": "Vĩnh Long",
  "Tiền Giang": "Đồng Tháp",
  "Bến Tre": "Đồng Tháp",
  "Sóc Trăng": "Cà Mau",
  "Bạc Liêu": "Cà Mau",
  "Kiên Giang": "An Giang"
};

async function migrate() {
  const venues = JSON.parse(fs.readFileSync('../src/data/venues.json', 'utf8'));
  let batch = db.batch();
  let count = 0;
  let total = 0;
  
  // Update local file in memory
  let modifiedLocal = false;
  
  for (const v of venues) {
    if (v.province) {
      let oldProv = v.province.trim();
      if (mapping[oldProv]) {
        let newProv = mapping[oldProv];
        v.province = newProv; // Update in JSON
        modifiedLocal = true;
        
        batch.update(db.collection('Facilities').doc(v.id), { province: newProv });
        count++;
        total++;
        if (count === 400) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      } else if (oldProv === "Thừa Thiên Huế") {
        v.province = "Huế";
        modifiedLocal = true;
        batch.update(db.collection('Facilities').doc(v.id), { province: "Huế" });
        count++;
        total++;
        if (count === 400) {
          await batch.commit();
          batch = db.batch();
          count = 0;
        }
      }
    }
  }
  
  if (count > 0) {
    await batch.commit();
  }
  
  if (modifiedLocal) {
    fs.writeFileSync('../src/data/venues.json', JSON.stringify(venues, null, 2));
  }
  
  console.log(`Migrated ${total} facilities to the new 34-province system!`);
  process.exit(0);
}

migrate().catch(console.error);
