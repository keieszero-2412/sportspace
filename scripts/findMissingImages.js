import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function run() {
  console.log("Đang tải danh sách sân từ database...");
  const querySnapshot = await getDocs(collection(db, 'Facilities'));
  
  let total = 0;
  let missingImages = [];

  for (const document of querySnapshot.docs) {
    total++;
    const venue = document.data();
    
    // Nếu sân chưa có ảnh hoặc ảnh là rỗng
    if (!venue.image) {
      missingImages.push({
        id: document.id,
        name: venue.name,
        province: venue.province
      });
    }
  }
  
  console.log(`\nTổng số sân trong database: ${total}`);
  console.log(`Số sân CHƯA có ảnh: ${missingImages.length}\n`);
  
  if (missingImages.length > 0) {
    console.log("Danh sách các sân chưa có ảnh:");
    missingImages.forEach((v, index) => {
      console.log(`${index + 1}. [${v.id}] ${v.name} - ${v.province}`);
    });
  }
  
  process.exit(0);
}

run();
