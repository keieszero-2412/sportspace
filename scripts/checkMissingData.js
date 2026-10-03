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

async function analyzeCollection(collectionName) {
  console.log(`\nĐang phân tích collection: ${collectionName}...`);
  const snapshot = await getDocs(collection(db, collectionName));
  const totalDocs = snapshot.size;
  
  if (totalDocs === 0) {
    console.log(`Collection ${collectionName} trống.`);
    return;
  }

  const fieldStats = {}; // { fieldName: countOfDocsWithValue }

  snapshot.forEach((doc) => {
    const data = doc.data();
    // Gather all fields
    Object.keys(data).forEach(key => {
      if (!fieldStats[key]) fieldStats[key] = 0;
      
      const val = data[key];
      // Check if value is not empty (not null, undefined, empty string, or empty array)
      let hasValue = false;
      if (val !== null && val !== undefined && val !== '') {
        if (Array.isArray(val)) {
          if (val.length > 0) hasValue = true;
        } else {
          hasValue = true;
        }
      }
      
      if (hasValue) {
        fieldStats[key]++;
      }
    });
  });

  console.log(`Tổng số documents: ${totalDocs}`);
  console.log('Thống kê các trường dữ liệu:');
  
  Object.keys(fieldStats).sort().forEach(key => {
    const count = fieldStats[key];
    const missing = totalDocs - count;
    const missingPercent = ((missing / totalDocs) * 100).toFixed(2);
    
    if (missing > 0) {
      console.log(`- Trường '${key}': BỊ TRỐNG ${missing} docs (${missingPercent}%)`);
    } else {
      console.log(`- Trường '${key}': Đầy đủ (100%)`);
    }
  });
}

async function run() {
  await analyzeCollection('Facilities');
  await analyzeCollection('Users');
  await analyzeCollection('Courts');
  process.exit(0);
}

run();
