import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

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
const storage = getStorage(app);

async function searchBingImage(query) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();
    
    // Tìm URL ảnh (murl) trong JSON của Bing HTML
    const regex = /murl&quot;:&quot;([^&]+)&quot;/g;
    let match;
    const urls = [];
    while ((match = regex.exec(html)) !== null) {
      urls.push(match[1]);
      if (urls.length >= 5) break; 
    }
    return urls;
  } catch (error) {
    return [];
  }
}

async function run() {
  console.log("Bắt đầu crawl ảnh thật từ Bing Images...");
  const querySnapshot = await getDocs(collection(db, 'Facilities'));
  
  for (const document of querySnapshot.docs) {
    const venue = document.data();
    
    // Bỏ qua nếu đã có ảnh thật
    if (venue.image && venue.image.includes('firebasestorage')) {
      console.log(`Bỏ qua: ${venue.name} (Đã có ảnh thật)`);
      continue;
    }

    // Chỉ dùng Tên sân và Tỉnh/Thành phố để tìm kiếm chính xác hơn
    const query = `${venue.name} ${venue.province}`;
    console.log(`\nĐang tìm kiếm: ${query}`);
    
    try {
      const urls = await searchBingImage(query);
      let success = false;

      for (let photoUrl of urls) {
        try {
          // Thử tải ảnh về để lấy buffer
          const imgRes = await fetch(photoUrl);
          if (!imgRes.ok) continue;

          const arrayBuffer = await imgRes.arrayBuffer();
          
          let contentType = 'image/jpeg';
          if (photoUrl.toLowerCase().includes('.png')) contentType = 'image/png';
          else if (photoUrl.toLowerCase().includes('.webp')) contentType = 'image/webp';
          
          let finalUrl = photoUrl; // Default to direct URL
          let savedToStorage = false;

          try {
            // Thử upload ảnh lên Firebase Storage (Cách 1)
            console.log(`Đang tải ảnh lên Firebase Storage từ: ${photoUrl.substring(0, 50)}...`);
            const storageRef = ref(storage, `venues_crawled/${document.id}.${contentType.split('/')[1]}`);
            await uploadBytes(storageRef, arrayBuffer, { contentType });
            
            finalUrl = await getDownloadURL(storageRef);
            savedToStorage = true;
            console.log(`✅ Tải lên Storage thành công.`);
          } catch (storageErr) {
            console.log(`⚠️ Lỗi tải lên Storage (có thể do Rules chặn): ${storageErr.message}. Tự động chuyển sang lưu URL trực tiếp (Cách 2).`);
          }
          
          // Cập nhật link vào Firestore
          await updateDoc(doc(db, 'Facilities', document.id), {
            image: finalUrl
          });
          
          if (savedToStorage) {
            console.log(`✅ Hoàn tất: Đã lưu bằng CÁCH 1 (File gốc trên Storage) cho ${venue.name}`);
          } else {
            console.log(`✅ Hoàn tất: Đã lưu bằng CÁCH 2 (URL trực tiếp) cho ${venue.name}`);
          }
          success = true;
          break; // Chỉ cần 1 ảnh thành công là đủ
        } catch (e) {
          console.log(`Bỏ qua ảnh này do lỗi tải: ${e.message}`);
        }
      }

      if (!success) {
        console.log(`❌ Thất bại: Không lấy được ảnh nào cho ${venue.name}`);
      }
    } catch (error) {
      console.error(`Lỗi khi xử lý ${venue.name}:`, error);
    }
    
    // Tránh quá tải
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log("\nHoàn tất quá trình crawl!");
  process.exit(0);
}

run();
