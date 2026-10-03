import fs from 'fs';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as chromeLauncher from 'chrome-launcher';

puppeteer.use(StealthPlugin());

const VENUES_PATH = './src/data/venues.json';

// Hàm nghỉ ngơi ngẫu nhiên (từ min đến max giây)
const sleepRandom = (minSeconds, maxSeconds) => {
  const ms = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
  console.log(`⏳ Nghỉ ngơi ${ms / 1000} giây để né Captcha...`);
  return new Promise(resolve => setTimeout(resolve, ms));
};

async function run() {
  console.log("🚀 Bắt đầu chế độ QUÉT CHẬM (Treo máy qua đêm)...");
  
  const chromePath = chromeLauncher.Launcher.getInstallations()[0];
  if (!chromePath) {
    console.error("❌ Không tìm thấy Chrome.");
    return;
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: false, // Hiện cửa sổ để bạn bấm Captcha nếu bị hỏi
    args: ['--start-maximized', '--disable-notifications']
  });

  const page = await browser.newPage();
  let updatedCount = 0;

  // Đọc lại data mới nhất
  const data = JSON.parse(fs.readFileSync(VENUES_PATH, 'utf8'));

  for (let i = 0; i < data.length; i++) {
    const venue = data[i];
    
    // Chỉ quét những sân đang bị bỏ trống số điện thoại
    if (!venue.phone || venue.phone.trim() === '') {
      const query = `${venue.name} ${venue.address || venue.province} số điện thoại`;
      console.log(`\n[${i+1}/${data.length}] Đang tìm: ${venue.name}...`);
      
      try {
        await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2' });
        
        // Kiểm tra xem có bị dính Captcha không
        const isCaptcha = await page.$('#captcha-form, iframe[src*="recaptcha"]');
        if (isCaptcha) {
          console.log('🚨 PHÁT HIỆN CAPTCHA! Script đang tạm dừng.');
          console.log('👉 Vui lòng thao tác trên cửa sổ Chrome để giải Captcha, sau khi giải xong script sẽ tự chạy tiếp!');
          // Đợi đến khi ô Captcha biến mất vĩnh viễn (timeout = 0 nghĩa là đợi vô hạn)
          await page.waitForFunction(() => !document.querySelector('#captcha-form, iframe[src*="recaptcha"]'), { timeout: 0 });
          console.log('✅ Đã giải xong Captcha, tiếp tục làm việc...');
        }

        // Đợi kết quả hiển thị (chờ id rso hoặc div chính của trang)
        await page.waitForSelector('#main, #search, .g', { timeout: 5000 }).catch(() => {});
        
        const phoneElement = await page.$('span[data-dtype="d3ph"] span, a[data-phone-number], span.LrzXr.zdqRlf.kno-fv');
        
        let realPhone = null;
        if (phoneElement) {
          realPhone = await page.evaluate(el => el.textContent || el.getAttribute('data-phone-number'), phoneElement);
        } else {
          const bodyText = await page.evaluate(() => document.body.innerText);
          const phoneRegex = /(0\d{2,3}[\s.-]?\d{3,4}[\s.-]?\d{3,4})/g;
          const matches = bodyText.match(phoneRegex);
          if (matches && matches.length > 0) {
            const counts = {};
            matches.forEach(m => {
              const clean = m.replace(/[\s.-]/g, '');
              if (clean.length === 10) counts[clean] = (counts[clean] || 0) + 1;
            });
            if (Object.keys(counts).length > 0) {
              realPhone = Object.keys(counts).sort((a,b) => counts[b] - counts[a])[0];
            }
          }
        }
        
        if (realPhone) {
          venue.phone = realPhone.replace(/[\s.-]/g, '');
          updatedCount++;
          console.log(`✅ Tìm thấy: ${venue.phone}`);
          fs.writeFileSync(VENUES_PATH, JSON.stringify(data, null, 2));
        } else {
          console.log(`⚠️ Không tìm thấy.`);
        }
      } catch (e) {
        console.error(`Lỗi: ${e.message}`);
      }

      // Nghỉ ngẫu nhiên từ 20 đến 45 giây sau mỗi lần tìm
      await sleepRandom(20, 45);
    }
  }

  console.log(`\n🎉 Hoàn tất quá trình cào! Đã tìm được ${updatedCount} số thật.`);
  await browser.close();
}

run();
