import fs from 'fs';

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const VENUES_PATH = './src/data/venues.json';

if (!API_KEY) {
  console.error("❌ Không tìm thấy GOOGLE_PLACES_API_KEY trong file .env");
  console.error("Vui lòng tạo file .env ở thư mục gốc và thêm: GOOGLE_PLACES_API_KEY=your_api_key_here");
  process.exit(1);
}

// Hàm sleep để tránh rate limit của Google API
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPlacePhone(query) {
  try {
    // 1. Tìm place_id từ tên sân và địa chỉ
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${API_KEY}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.status !== 'OK' || !searchData.results || searchData.results.length === 0) {
      return null;
    }

    const placeId = searchData.results[0].place_id;

    // 2. Lấy thông tin chi tiết (bao gồm số điện thoại) từ place_id
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=formatted_phone_number&key=${API_KEY}`;
    const detailsRes = await fetch(detailsUrl);
    const detailsData = await detailsRes.json();

    if (detailsData.status === 'OK' && detailsData.result && detailsData.result.formatted_phone_number) {
      return detailsData.result.formatted_phone_number;
    }
    
    return null;
  } catch (error) {
    console.error(`Lỗi khi fetch data cho query "${query}":`, error.message);
    return null;
  }
}

async function run() {
  console.log("🚀 Bắt đầu quá trình cập nhật số điện thoại thật...");
  const data = JSON.parse(fs.readFileSync(VENUES_PATH, 'utf8'));
  let updatedCount = 0;

  for (let i = 0; i < data.length; i++) {
    const venue = data[i];
    
    // Chỉ cập nhật những sân đang dùng số ảo theo mẫu 098800...
    if (venue.phone && venue.phone.startsWith('098800')) {
      console.log(`Đang tìm kiếm cho [${i+1}/${data.length}]: ${venue.name}...`);
      
      const query = `${venue.name} ${venue.address || venue.province}`;
      const realPhone = await fetchPlacePhone(query);
      
      if (realPhone) {
        venue.phone = realPhone;
        updatedCount++;
        console.log(`✅ Đã tìm thấy: ${realPhone}`);
        
        // Ghi lưu dữ liệu ngay lập tức để tránh mất mát nếu script bị dừng giữa chừng
        fs.writeFileSync(VENUES_PATH, JSON.stringify(data, null, 2));
      } else {
        console.log(`⚠️ Không tìm thấy số điện thoại.`);
      }

      // Nghỉ 1 giây giữa các request để không bị Google block (Rate Limiting)
      await sleep(1000);
    }
  }

  console.log(`🎉 Hoàn tất! Đã cập nhật thành công số điện thoại thật cho ${updatedCount} sân.`);
}

run();
