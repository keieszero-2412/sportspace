const fs = require('fs');

function parsePrice(text) {
  if (!text) return null;
  text = text.replace(/[^\d\-\s]/g, '');
  const parts = text.split('-').map(s => parseInt(s.replace(/\D/g, ''))).filter(n => !isNaN(n));
  if (parts.length >= 3) {
    let [day, night, weekend] = parts;
    if (day < 1000) day *= 1000;
    if (night < 1000) night *= 1000;
    if (weekend < 1000) weekend *= 1000;
    return { day, night, weekend };
  } else if (parts.length === 2) {
    let [day, night] = parts;
    if (day < 1000) day *= 1000;
    if (night < 1000) night *= 1000;
    return { day, night, weekend: night };
  } else if (parts.length === 1) {
    let p = parts[0];
    if (p < 1000) p *= 1000;
    return { day: p, night: p, weekend: p };
  }
  return null;
}

function extractFromLocalJSON() {
  console.log('Reading src/data/venues.json...');
  let data;
  try {
    data = JSON.parse(fs.readFileSync('../src/data/venues.json', 'utf8'));
  } catch (e) {
    console.error('Cannot read venues.json:', e.message);
    process.exit(1);
  }

  const csvLines = ['court_id,facility_id,price_day,price_night,price_weekend,basePrice,original_summary'];
  let count = 0;

  data.forEach(venue => {
    const facId = venue.id;
    const prices = parsePrice(venue.price_summary);
    
    let pDay = 100000;
    let pNight = 120000;
    let pWeekend = 120000;
    
    if (prices) {
      pDay = prices.day;
      pNight = prices.night;
      pWeekend = prices.weekend;
    }

    if (venue.courts && Array.isArray(venue.courts)) {
      venue.courts.forEach(court => {
        csvLines.push(`${court.id},${facId},${pDay},${pNight},${pWeekend},${pDay},${venue.price_summary || 'Fallback'}`);
        count++;
      });
    }
  });

  fs.writeFileSync('courts_prices.csv', csvLines.join('\n'));
  console.log(`Saved ${count} courts to functions/courts_prices.csv successfully.`);
}

extractFromLocalJSON();
