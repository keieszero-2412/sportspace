import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone, getVenuePhone } from '../src/services/venuePhone.js';
import { extractContacts, matchScore, phonesIn } from '../scripts/lib/venue-phone-crawl.mjs';

test('normalizes Vietnamese mobile/landline numbers without accepting masked or demo numbers', () => {
  assert.equal(normalizePhone('+84 825.815.815'), '0825815815');
  assert.equal(normalizePhone('(024) 6684 9023'), '02466849023');
  for (const value of ['0988***123', '0123456789', '0912345678', '1234', '09000000000']) assert.equal(normalizePhone(value), null);
  assert.deepEqual(phonesIn('Hotline 0967 373 003, sân: 0825.815.815'), ['0825815815']);
});
test('does not show legacy fake contacts, unsafe links, or evidence for a different number', () => {
  assert.equal(getVenuePhone({ phone: '0988000004' }), null);
  const venue = { phone: '0825815815', phone_status: 'sourced', phone_sources: [{ phone: '0825815815', url: 'https://example.com/venue' }] };
  assert.equal(getVenuePhone(venue).number, '0825815815');
  assert.equal(getVenuePhone({ ...venue, phone: '0988000004' }), null);
  assert.equal(getVenuePhone({ ...venue, phone_sources: [{ phone: venue.phone, url: 'javascript:alert(1)' }] }), null);
});
test('extracts only contacts in the venue section, excluding footer and multi-branch ambiguity', () => {
  const page = { url: 'https://www.alobo.vn/example/', retrievedAt: '2026-10-03', html: `<h1>Sân A</h1><article><h2>Sân A</h2><p>Địa chỉ: 125D Nguyễn Sơn, Hà Nội</p><p>Hotline: 0825.815.815</p><h2>Sân B</h2><p>Địa chỉ: 1 Lê Duẩn, Hà Nội</p><p>Địa chỉ: 2 Lê Duẩn, Hà Nội</p><p>Hotline: 0982.338.395</p></article><footer>Hotline: 0906.073.333</footer>` };
  const contacts = extractContacts(page);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].phone, '0825815815');
  assert.equal(contacts[0].name, 'Sân A');
});
test('same name in another location or sport is not sufficient for a match', () => {
  const venue = { name: 'Đảo Sen Pickleball', address: '125D Nguyễn Sơn, Hà Nội', province: 'Hà Nội', sport: 'Pickleball' };
  const contact = { name: 'Đảo Sen Pickleball', address: '125D Nguyễn Sơn, Long Biên, Hà Nội' };
  assert.ok(matchScore(venue, contact));
  assert.equal(matchScore(venue, { ...contact, address: '29 Nguyễn Du, Hồ Chí Minh' }), null);
  assert.equal(matchScore({ ...venue, sport: 'Bóng đá' }, contact), null);
});
