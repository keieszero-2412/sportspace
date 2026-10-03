export const normalize = value => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

export function validCoordinates(lat, lng) {
  return typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
export function inVietnam(lat, lng) {
  return validCoordinates(lat, lng) && lat >= 8 && lat <= 24 && lng >= 102 && lng <= 110;
}
export function firestoreNumber(value) {
  if (typeof value?.doubleValue === 'number') return value.doubleValue;
  if (value?.integerValue !== undefined) return Number(value.integerValue);
  return null;
}
export function snapshotVenues(snapshot) {
  return snapshot.documents.map(doc => ({
    id: doc.name.split('/').at(-1), updateTime: doc.updateTime,
    ...Object.fromEntries(Object.entries(doc.fields).map(([key, value]) =>
      [key, value.stringValue ?? firestoreNumber(value)])),
  }));
}
export function placeCoordinates(value) {
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!['www.google.com', 'maps.google.com'].includes(url.hostname) || !url.pathname.startsWith('/maps/place/')) return null;
  // @lat,lng is the camera centre, not necessarily the venue. Only a place pin counts.
  const pins = [...decodeURIComponent(url.href).matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  if (pins.length !== 1) return null;
  const lat = Number(pins[0][1]), lng = Number(pins[0][2]);
  return inVietnam(lat, lng) ? { lat, lng } : null;
}
export function identityHints(venue, result) {
  const cleanName = s => normalize(s).replace(/\b(san|bong|da|co|nhan|tao|clb|cau|lac|bo|mini)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const expected = cleanName(venue.name).split(' ').filter(Boolean);
  const actual = new Set(cleanName(result.name).split(' '));
  const nameRatio = expected.length ? expected.filter(w => actual.has(w)).length / expected.length : 0;
  const address = normalize(result.address || result.summary);
  const expectedAddress = normalize(venue.address).split(' ').filter(w => !['so','duong','phuong','quan','thanh','pho','tinh','tp','viet','nam'].includes(w));
  const addressRatio = expectedAddress.length ? expectedAddress.filter(w => address.split(' ').includes(w)).length / expectedAddress.length : 0;
  const provinceMatches = address.includes(normalize(venue.province));
  return { nameRatio, addressRatio, provinceMatches };
}
