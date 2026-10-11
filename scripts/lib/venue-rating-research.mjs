import { normalize, placeCoordinates, identityHints } from './venue-coordinates.mjs';
import { extractRating } from '../audit/inventory-venue-ratings.mjs';

export function distanceMeters(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return null;
  const radians = n => n * Math.PI / 180;
  const dlat = radians(b.lat - a.lat), dlng = radians(b.lng - a.lng);
  const value = Math.sin(dlat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dlng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function isMapsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['www.google.com', 'maps.google.com'].includes(url.hostname) && url.pathname.startsWith('/maps/');
  } catch { return false; }
}

export function coreNameRatio(expected, actual) {
  const tokens = value => {
    const segments = String(value || '').replace(/['’]/g, '').split(/\s+-\s+/);
    const brandTokens = segment => normalize(segment)
      .replace(/\b(san|bong|da|cau|long|chuyen|tennis|pickleball|indoor|outdoor|facility|club|clb|court|courts|co|nhan|tao)\b/g, ' ')
      .trim().split(/\s+/).filter(Boolean);
    // Skip a generic Maps prefix, but stop before address/branch suffixes.
    for (const segment of segments) {
      const result = brandTokens(segment);
      if (result.length) return result;
    }
    return [];
  };
  const expectedTokens = tokens(expected), actualTokens = new Set(tokens(actual));
  return expectedTokens.length ? expectedTokens.filter(t => actualTokens.has(t)).length / expectedTokens.length : 0;
}

export function rankSearchCandidates(venue, links) {
  return [...links].sort((a, b) => {
    const score = candidate => {
      const distance = distanceMeters(venue, placeCoordinates(candidate.url));
      return coreNameRatio(venue.name, candidate.name) * 10 + (distance !== null && distance < 150 ? 2 : 0);
    };
    return score(b) - score(a);
  });
}

export function selectSearchCandidates(venue, links, fast = false) {
  const ranked = rankSearchCandidates(venue, links);
  if (!fast) return ranked.slice(0, 3);
  return ranked.filter(link => {
    const distance = distanceMeters(venue, placeCoordinates(link.url));
    return coreNameRatio(venue.name, link.name) >= 0.5 || (distance !== null && distance <= 150);
  }).slice(0, 1);
}

export function researchUrl(venue) {
  for (const value of [venue.coordinate_source?.url, venue.google_maps_url, venue.google_url]) {
    if (isMapsUrl(value)) return value;
  }
  const url = new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api', '1');
  url.searchParams.set('query', `${venue.name}, ${venue.address}`);
  if (venue.google_place_id) url.searchParams.set('query_place_id', venue.google_place_id);
  url.searchParams.set('hl', 'vi');
  return url.href;
}

export function classifyPlace(venue, place) {
  const hints = identityHints(venue, place);
  const pin = placeCoordinates(place.url);
  const distance = distanceMeters(venue, pin);
  const exactName = normalize(venue.name) === normalize(place.name);
  const coreRatio = coreNameRatio(venue.name, place.name);
  const reverseCoreRatio = coreNameRatio(place.name, venue.name);
  const normalizedSport = normalize(venue.sport);
  const sportInName = normalizedSport && normalize(place.name).includes(normalizedSport);
  const priorUrl = venue.coordinate_source?.url;
  // Curated historical URL still needs a name match; search links are not exact place IDs.
  const priorPin = priorUrl ? placeCoordinates(priorUrl) : null;
  const priorDistance = distanceMeters(priorPin, pin);
  const incompatibleCategory = /cua hang|shopping|store|shop|restaurant|trung tam mua sam|nha hang|supermarket|sieu thi/.test(normalize(place.category));
  const identityVerified = !incompatibleCategory && !!place.address && !!pin && (
    (priorDistance !== null && priorDistance < 10 && hints.nameRatio >= 0.65) ||
    (distance !== null && distance <= 150 && (hints.nameRatio >= 0.75 || coreRatio >= 0.9)) ||
    // Maps sometimes omits the road/complex suffix from the venue name.
    // A reverse brand match only counts with the same sport, exact pin and address.
    (distance !== null && distance <= 20 && sportInName && reverseCoreRatio === 1 && hints.addressRatio >= 0.7) ||
    // Address-only matching is allowed only when the catalogue has no coordinates.
    // A different pin must not be overridden by a shared brand/street name.
    (distance === null && (exactName || hints.nameRatio >= 0.85 || coreRatio >= 0.9) && hints.addressRatio >= 0.6 && hints.provinceMatches)
  );
  const rating = extractRating(place);
  const countMatch = String(place.reviewsLabel || '').match(/(?:\(?([\d.,\s]+)\)?\s*(?:reviews?|bài đánh giá|lượt đánh giá|đánh giá))/i);
  const count = countMatch ? Number(countMatch[1].replace(/[^\d]/g, '')) : null;
  const noReviewsMatch = String(place.summary || '').match(/chưa có (?:bài )?đánh giá(?: nào)?|no reviews/i);
  const explicitlyUnrated = !!noReviewsMatch;
  return { status: !identityVerified ? 'identity_needs_review' : rating !== null ? 'verified_google_rating'
    : explicitlyUnrated ? 'verified_no_reviews' : 'rating_not_visible',
    rating, reviews_count: Number.isSafeInteger(count) && count >= 0 ? count : null,
    identity_verified: identityVerified, identity_hints: { ...hints, coreNameRatio: coreRatio, reverseCoreNameRatio: reverseCoreRatio },
    distance_meters: distance === null ? null : Math.round(distance),
    coordinate_address_conflict: distance !== null && distance > 150 && hints.addressRatio >= 0.6 && (exactName || coreRatio >= 0.9),
    name: place.name, address: place.address, url: place.url, coordinates: pin,
    category: place.category || null, incompatible_category: incompatibleCategory,
    // Retain only minimal rating evidence, not full reviews, phones, or page text.
    rating_evidence: rating === null ? null : `${place.name}\n${rating}`,
    no_reviews_evidence: noReviewsMatch?.[0] || null };
}
