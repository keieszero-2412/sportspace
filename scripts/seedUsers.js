import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, writeBatch } from 'firebase/firestore';

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
  console.log("Bắt đầu tạo 701 users giả lập...");
  const usersRef = collection(db, 'Users');
  
  let totalCreated = 0;
  const totalNeeded = 701;
  const batchSize = 400; // Firebase batch limit is 500
  
  while (totalCreated < totalNeeded) {
    const batch = writeBatch(db);
    const limit = Math.min(batchSize, totalNeeded - totalCreated);
    
    for (let i = 0; i < limit; i++) {
      const newDocRef = doc(usersRef);
      const randomRole = Math.random() > 0.85 ? 'merchant' : 'player'; // 15% là chủ sân, 85% người chơi
      const randomScore = Math.floor(Math.random() * 50) * 100 + 5000; // Uy tín từ 5.000 đến 10.000
      
      batch.set(newDocRef, {
        name: generateRandomName(),
        email: `user${totalCreated + i + 1}@example.com`,
        phone: '09' + Math.floor(10000000 + Math.random() * 90000000).toString(),
        role: randomRole,
        credibilityScore: randomScore,
        createdAt: new Date().toISOString()
      });
    }
    
    await batch.commit();
    totalCreated += limit;
    console.log(`Đã tạo thành công batch: ${limit} users. Tổng cộng: ${totalCreated}/${totalNeeded}`);
  }

  console.log("Hoàn tất tạo 701 users giả lập!");
  process.exit(0);
}

run();
