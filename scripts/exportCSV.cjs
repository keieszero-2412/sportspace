const fs = require('fs');
const venues = JSON.parse(fs.readFileSync('./src/data/venues.json', 'utf8'));
let csv = 'ID,Name,Address,Phone\n';
venues.forEach(v => {
  if (!v.phone || v.phone.trim() === '') {
    const name = '"' + v.name.replace(/"/g, '""') + '"';
    const address = '"' + (v.address || v.province).replace(/"/g, '""') + '"';
    csv += `${v.id},${name},${address},\n`;
  }
});
fs.writeFileSync('danh_sach_san_thieu_so.csv', csv);
console.log('Exported to danh_sach_san_thieu_so.csv');
