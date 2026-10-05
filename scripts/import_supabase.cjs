const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// TODO: Replace with env vars or arguments
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const exportDir = path.join(__dirname, '../data_export');

const allowedColumns = {
  Users: ['id', 'name', 'email', 'phone', 'role', 'credibilityScore', 'createdAt', 'raw_data'],
  Facilities: ['id', 'name', 'address', 'province', 'sport', 'image', 'lng', 'lat', 'phone', 'phone_status', 'price_summary', 'scale_courts', 'operating_hours', 'amenities', 'source_url', 'raw_data'],
  Courts: ['id', 'facility_id', 'name', 'sport_type', 'surface_type', 'is_indoor', 'is_available', 'basePrice', 'price_day', 'price_night', 'price_weekend', 'raw_data'],
  Availability: ['id', 'court_id', 'date', 'start_time', 'end_time', 'status', 'price', 'slot_id', 'booking_id', 'raw_data'],
  Matches: ['id', 'raw_data'],
  PricingRules: ['id', 'court_id', 'facility_id', 'raw_data']
};

async function importCollection(collectionName) {
  const filePath = path.join(exportDir, `${collectionName}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping ${collectionName} (file not found)`);
    return;
  }

  const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log(`Importing ${rawData.length} records into ${collectionName}...`);

  const chunkSize = 500;
  for (let i = 0; i < rawData.length; i += chunkSize) {
    const chunk = rawData.slice(i, i + chunkSize).map(item => {
      const payload = { id: item.id, raw_data: item };
      
      const allowed = allowedColumns[collectionName];
      Object.keys(item).forEach(key => {
        if (allowed.includes(key) && key !== 'id') {
           payload[key] = item[key];
        }
      });
      
      return payload;
    });

    const { error } = await supabase
      .from(collectionName)
      .upsert(chunk, { onConflict: 'id' });

    if (error) {
      console.error(`Error importing chunk ${i} to ${collectionName}:`, error);
    } else {
      console.log(`✅ Imported ${i + chunk.length}/${rawData.length} into ${collectionName}`);
    }
  }
}

async function main() {
  const collections = ['Users', 'Facilities', 'Courts', 'Availability', 'Matches', 'PricingRules'];
  
  for (const col of collections) {
    await importCollection(col);
  }
  
  console.log('🎉 Import to Supabase finished!');
}

main();
