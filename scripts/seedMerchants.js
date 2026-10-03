import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, writeBatch } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBvLJvPwSAZ2IoG0D_FkCTmwrSe6pJ91Zk",
  authDomain: "sportspace-af6b4.firebaseapp.com",
  projectId: "sportspace-af6b4",
  storageBucket: "sportspace-af6b4.firebasestorage.app",
  messagingSenderId: "490538912999",
  appId: "1:490538912999:web:ab64a9dd6d9e56f20ea642",
  measurementId: "G-R1VKP7KP24"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const firstNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const middleNames = ['Văn', 'Thị', 'Hữu', 'Minh', 'Ngọc', 'Thanh', 'Xuân', 'Thu', 'Hải', 'Tuấn', 'Hoài'];
const lastNames = ['Hùng', 'Hương', 'Hà', 'Long', 'Linh', 'Anh', 'Khoa', 'Tâm', 'Đạt', 'Thảo', 'Trang', 'Sơn', 'Tùng', 'Đức', 'Nam', 'Hiếu', 'Bình', 'Hạnh', 'Lan', 'Quân'];

function generateRandomName() {
  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const middle = middleNames[Math.floor(Math.random() * middleNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  return `${first} ${middle} ${last}`;
}

async function run() {
  console.log("Đang lấy danh sách các sân (Facilities)...");
  const facilitiesSnapshot = await getDocs(collection(db, 'Facilities'));
  
  const ownerMap = new Map(); // phone -> owner data

  facilitiesSnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const phone = data.phone;
    if (phone) {
      if (!ownerMap.has(phone)) {
        ownerMap.set(phone, {
          phone: phone,
          facilityIds: [docSnap.id],
          facilityNames: [data.name]
        });
      } else {
        ownerMap.get(phone).facilityIds.push(docSnap.id);
        ownerMap.get(phone).facilityNames.push(data.name);
      }
    }
  });

  const uniqueOwners = Array.from(ownerMap.values());
  console.log(`Tìm thấy ${uniqueOwners.length} chủ sân độc lập (dựa trên số điện thoại thật).`);

  const usersRef = collection(db, 'Users');
  let totalCreated = 0;
  const batchSize = 400;

  for (let i = 0; i < uniqueOwners.length; i += batchSize) {
    const batch = writeBatch(db);
    const chunk = uniqueOwners.slice(i, i + batchSize);

    for (const owner of chunk) {
      const newDocRef = doc(usersRef); // Tạo ID ngẫu nhiên cho User
      const randomScore = Math.floor(Math.random() * 20) * 100 + 8000; // Chủ sân uy tín cao 8000 - 10000

      batch.set(newDocRef, {
        name: generateRandomName(),
        email: `merchant_${owner.phone}@sportspace.vn`,
        phone: owner.phone,
        role: 'merchant',
        credibilityScore: randomScore,
        createdAt: new Date().toISOString(),
        ownedFacilities: owner.facilityIds, // Lưu ID các sân họ sở hữu
        ownedFacilityNames: owner.facilityNames
      });
    }

    await batch.commit();
    totalCreated += chunk.length;
    console.log(`Đã tạo thành công batch: ${chunk.length} chủ sân. Tổng cộng: ${totalCreated}/${uniqueOwners.length}`);
  }

  console.log(`Hoàn tất! Đã tạo thành công ${uniqueOwners.length} tài khoản Chủ Sân (Merchant).`);
  process.exit(0);
}

run();
