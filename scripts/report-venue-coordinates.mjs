import fs from 'node:fs';
const folder = 'data_export/coordinates';
const snapshot = JSON.parse(fs.readFileSync(`${folder}/firestore-snapshot.json`, 'utf8'));
const missing = JSON.parse(fs.readFileSync(`${folder}/missing-before.json`, 'utf8'));
const decisionsFile = `${folder}/review-decisions.json`;
const decisions = fs.existsSync(decisionsFile) ? JSON.parse(fs.readFileSync(decisionsFile, 'utf8')) : {};
const lookups = fs.readdirSync(`${folder}/lookups`).map(file => ({ file, ...JSON.parse(fs.readFileSync(`${folder}/lookups/${file}`, 'utf8')) }));
const accepted = [], pending = [];
for (const venue of missing) {
  const decision = decisions[venue.id];
  if (decision?.lookup && Number.isInteger(decision.candidate)) {
    const lookup = lookups.find(row => row.file === decision.lookup && row.id === venue.id);
    const candidate = lookup?.candidates[decision.candidate];
    if (!candidate || !decision.note) throw new Error(`Review evidence missing: ${venue.id}`);
    accepted.push({ id: venue.id, name: venue.name, address: venue.address, lat: candidate.lat, lng: candidate.lng,
      source: { provider: 'Google Maps public place', url: candidate.url, name: candidate.name,
        address: candidate.address || candidate.summary, checkedAt: lookup.checkedAt, precision: decision.precision || 'venue' },
      reviewNote: decision.note,
    });
  } else {
    const latest = lookups.filter(row => row.id === venue.id).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0];
    pending.push({ id: venue.id, name: venue.name, address: venue.address, reason: decision?.reason || (latest?.candidates.length ? 'Cần đối chiếu tên/địa chỉ của kết quả bản đồ.' : 'Chưa tìm được điểm sân đủ căn cứ.'),
      searchUrl: latest?.searchUrl || '', candidateCount: latest?.candidates.length || 0,
    });
  }
}
const manifest = { snapshotAt: snapshot.retrievedAt, reviewedAt: new Date().toISOString(), venues: accepted };
fs.writeFileSync('src/data/venue-coordinates.json', JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(`${folder}/pending.json`, JSON.stringify(pending, null, 2));
const csv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
fs.mkdirSync('docs/data', { recursive: true });
fs.writeFileSync('docs/data/san-thieu-toa-do.csv', '\ufeff' + [['id','ten_san','dia_chi','ly_do','link_tra_cuu'], ...pending.map(v => [v.id,v.name,v.address,v.reason,v.searchUrl])].map(row => row.map(csv).join(',')).join('\n') + '\n');
fs.writeFileSync('docs/data/toa-do-san-da-doi-chieu.csv', '\ufeff' + [['id','ten_san','lat','lng','ten_tren_ban_do','dia_chi_nguon','nguon','ghi_chu'], ...accepted.map(v => [v.id,v.name,v.lat,v.lng,v.source.name,v.source.address,v.source.url,v.reviewNote])].map(row => row.map(csv).join(',')).join('\n') + '\n');
console.log(JSON.stringify({ originalMissing: missing.length, reviewed: accepted.length, pending: pending.length }));
