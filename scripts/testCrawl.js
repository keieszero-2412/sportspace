import fs from 'fs';

async function searchBingImage(query) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();
    fs.writeFileSync('bing.html', html);
    
    // Tìm các URL ảnh trong kết quả
    const regex = /murl&quot;:&quot;([^&]+)&quot;/g;
    let match;
    const urls = [];
    while ((match = regex.exec(html)) !== null) {
      urls.push(match[1]);
      if (urls.length >= 5) break; // Lấy 5 ảnh đầu tiên để thử
    }
    
    return urls;
  } catch (error) {
    console.error("Error crawling:", error);
    return [];
  }
}

async function run() {
  const query = "Sân Pickleball Đảo Sen Long Biên";
  console.log("Searching for:", query);
  const urls = await searchBingImage(query);
  console.log("Found URLs:", urls);
  
  if (urls.length > 0) {
    for (let url of urls) {
       console.log("Testing download for:", url);
       try {
           const res = await fetch(url);
           if (res.ok) {
               console.log("Success! Status:", res.status);
               break;
           }
       } catch(e) {
           console.log("Failed:", e.message);
       }
    }
  }
}
run();
