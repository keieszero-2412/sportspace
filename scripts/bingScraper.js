import fs from 'fs';
import * as cheerio from 'cheerio';

const VENUES_PATH = './src/data/venues.json';
const data = JSON.parse(fs.readFileSync(VENUES_PATH, 'utf8'));

// Hàm sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapePhoneFromBing(query) {
  try {
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);
    
    // Tìm trong Knowledge Panel hoặc toàn trang
    // Regex tìm SĐT Việt Nam: 0 + 9 chữ số
    const phoneRegex = /(0[235789][0-9]{8})/g;
    
    // 1. Thử tìm trong panel thông tin doanh nghiệp trước
    const panelText = $('.b_entityTP').text() || $('.ent-info').text();
    let matches = panelText.match(phoneRegex);
    
    if (!matches) {
      // 2. Tìm toàn bộ text hiển thị trên kết quả tìm kiếm nếu không thấy trong panel
      const bodyText = $('body').text();
      matches = bodyText.match(phoneRegex);
    }
    
    if (matches && matches.length > 0) {
      // Lấy số xuất hiện nhiều nhất hoặc số đầu tiên
      const counts = {};
      matches.forEach(m => counts[m] = (counts[m] || 0) + 1);
      const bestMatch = Object.keys(counts).sort((a,b) => counts[b] - counts[a])[0];
      return bestMatch;
    }
    
    return null;
  } catch (error) {
    console.error(`Lỗi: ${error.message}`);
    return null;
  }
}

async function run() {
  console.log("🚀 Bắt đầu cào dữ liệu số điện thoại từ Bing...");
  let updatedCount = 0;

  // Chạy thử cho 10 sân đầu tiên để test
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const venue = data[i];
    
    if (venue.phone && venue.phone.startsWith('098800')) {
      const query = `${venue.name} ${venue.address || venue.province} số điện thoại`;
      console.log(`[${i+1}] Đang tìm: ${venue.name}...`);
      
      const realPhone = await scrapePhoneFromBing(query);
      
      if (realPhone) {
        venue.phone = realPhone;
        updatedCount++;
        console.log(`✅ Tìm thấy: ${realPhone}`);
      } else {
        console.log(`⚠️ Không tìm thấy.`);
      }

      await sleep(2000); // Nghỉ 2s tránh bị block
    }
  }

  // fs.writeFileSync(VENUES_PATH, JSON.stringify(data, null, 2));
  console.log(`\n🎉 Test hoàn tất! Tìm được ${updatedCount} số điện thoại.`);
  console.log(`Nếu bạn muốn chạy thật cho toàn bộ 1900 sân, hãy bỏ giới hạn Math.min và bỏ comment hàm ghi file fs.writeFileSync trong code.`);
}

run();
