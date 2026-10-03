import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';

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
  const q = query(collection(db, 'Facilities'), limit(2));
  const querySnapshot = await getDocs(q);
  
  querySnapshot.forEach((doc) => {
    console.log(doc.id, "=>", doc.data());
  });
  
  process.exit(0);
}

run();
