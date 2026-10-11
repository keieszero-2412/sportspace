import { classifyPlace } from './venue-rating-research.mjs';
import { normalize } from './venue-coordinates.mjs';

export function googlePlaceKey(observation) {
  const feature = decodeURIComponent(observation.url || '').match(/!1s(0x[a-f0-9]+:0x[a-f0-9]+)/i)?.[1];
  if (feature) return feature.toLowerCase();
  const pin = observation.coordinates;
  return pin && Number.isFinite(pin.lat) && Number.isFinite(pin.lng)
    ? `${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}:${normalize(observation.name)}` : null;
}

export function buildGoogleRatingReport(venues, lookups, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const decisions = options.decisions || {};
  const facilities = venues.map(v => {
    const lookup = lookups.get(v.id) || null;
    if (lookup && lookup.facility_id !== v.id) throw new Error(`Lookup facility mismatch: ${v.id}`);
    const observations = (lookup?.observations || []).map(o => {
      const summary = o.rating_evidence || `${o.name}\n${o.no_reviews_evidence || ''}`;
      const reviewed = classifyPlace(v, { ...o, summary,
        reviewsLabel: o.reviews_count === null ? '' : `${o.reviews_count} reviews` });
      const decision = decisions[v.id];
      if (decision && decision.expected_name === v.name && normalize(decision.google_name) === normalize(o.name)
        && decision.google_place_key === googlePlaceKey(reviewed) && decision.reason && decision.reviewed_at
        && decision.alias_sources?.length && decision.alias_sources.every(url => /^https:\/\//.test(url))
        && reviewed.distance_meters !== null && reviewed.distance_meters <= 20
        && reviewed.identity_hints.addressRatio >= 0.8 && !reviewed.incompatible_category) {
        return { ...reviewed, identity_verified: true, status: reviewed.rating !== null ? 'verified_google_rating' : reviewed.no_reviews_evidence ? 'verified_no_reviews' : 'rating_not_visible',
          review_method: 'external_name_alias_and_exact_maps_pin_address', alias_sources: decision.alias_sources,
          review_note: decision.reason, identity_reviewed_at: decision.reviewed_at };
      }
      return { ...reviewed, review_method: 'offline_maps_identity_revalidation' };
    });
    const matched = observations.filter(o => o.identity_verified);
    const placeKeys = new Set(matched.map(googlePlaceKey).filter(Boolean));
    const scores = new Set(matched.map(o => o.rating).filter(n => n !== null));
    const ambiguous = placeKeys.size > 1 || scores.size > 1;
    const claimedCertificateWithoutMatch = !matched.length && ['verified_google_rating', 'verified_no_reviews'].includes(lookup?.status);
    const status = ambiguous ? 'ambiguous_google_places' : matched[0]?.status || (claimedCertificateWithoutMatch ? 'identity_needs_review' : lookup?.status) || 'not_yet_checked';
    const existing = [v.rating, v.google_rating, v.raw_data?.rating, v.raw_data?.google_rating]
      .find(n => n !== null && n !== undefined && n !== '' && Number(n) >= 1 && Number(n) <= 5);
    return { facility_id: v.id, name: v.name, address: v.address, province: v.province, sport: v.sport,
      existing_rating: existing === undefined ? null : Number(existing), status,
      requested_url: lookup?.requested_url || null, checked_at: lookup?.checked_at || null,
      attempt_count: lookup ? 1 + (lookup.previous_attempts?.length || 0) : 0,
      certificate_without_matching_evidence: claimedCertificateWithoutMatch,
      observations, research_file: lookup ? `data_export/ratings/google-lookups/${v.id}.json` : null };
  });
  const groups = new Map();
  for (const facility of facilities) {
    if (facility.status !== 'verified_google_rating') continue;
    const key = googlePlaceKey(facility.observations.find(o => o.identity_verified));
    if (!key) continue;
    const ids = groups.get(key) || [];
    ids.push(facility.facility_id);
    groups.set(key, ids);
  }
  const sharedPlaces = [...groups.entries()].filter(([, ids]) => ids.length > 1)
    .map(([place_key, facility_ids]) => ({ place_key, facility_ids, note: 'Same Google place matched multiple catalogue records; review before any import.' }));
  const counts = {};
  let newlyFound = 0;
  for (const facility of facilities) {
    const group = sharedPlaces.find(g => g.facility_ids.includes(facility.facility_id));
    facility.same_google_place_as = group ? group.facility_ids.filter(id => id !== facility.facility_id) : [];
    counts[facility.status] = (counts[facility.status] || 0) + 1;
    if (facility.status === 'verified_google_rating' && facility.existing_rating === null) newlyFound++;
  }
  return { generated_at: generatedAt, total: venues.length, checked: venues.length - (counts.not_yet_checked || 0),
    statuses: counts, newly_found_ratings: newlyFound, verified_unique_google_places: groups.size,
    shared_google_places: sharedPlaces, production_modified: false, facilities };
}
