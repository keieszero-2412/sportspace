import fs from 'node:fs';
import { extractContacts, matchScore, nameKey, overlap } from './lib/venue-phone-crawl.mjs';
const folder = 'data_export/phone-crawl';
const venues = JSON.parse(fs.readFileSync('src/data/venues.json', 'utf8'));
if (process.argv.includes('--select-vnb')) {
  const lists = JSON.parse(fs.readFileSync(`${folder}/urls.json`, 'utf8'));
  lists.vnb_all ||= lists.vnb;
  lists.vnb = lists.vnb_all.filter(url => {
    const key = nameKey(new URL(url).pathname.replace(/\.html$/, ''));
    return venues.some(v => {
      const name = nameKey(v.name);
      const words = name.split(' ');
      return words.length >= 2 && overlap(key, name) >= .9 &&
        words.filter(w => key.split(' ').includes(w)).length >= 2;
    });
  });
  fs.writeFileSync(`${folder}/urls.json`, JSON.stringify(lists, null, 2));
  console.log(`Selected ${lists.vnb.length}/${lists.vnb_all.length} VNB articles with matching venue names.`);
} else {
  const contacts = fs.readdirSync(`${folder}/pages`).flatMap(file =>
    extractContacts(JSON.parse(fs.readFileSync(`${folder}/pages/${file}`, 'utf8'))));
  const candidates = [];
  for (const venue of venues) {
    const matches = contacts.map(contact => ({ contact, match: matchScore(venue, contact) }))
      .filter(m => m.match).sort((a, b) => b.match.score - a.match.score);
    if (matches.length) candidates.push({ id: venue.id, name: venue.name, address: venue.address, sport: venue.sport, matches });
  }
  fs.writeFileSync(`${folder}/contacts.json`, JSON.stringify(contacts, null, 2));
  fs.writeFileSync(`${folder}/candidates.json`, JSON.stringify(candidates, null, 2));
  console.log(JSON.stringify({ contacts: contacts.length, matchedVenues: candidates.length, conflicts: candidates.filter(v => new Set(v.matches.map(m => m.contact.phone)).size > 1).length }));
}
