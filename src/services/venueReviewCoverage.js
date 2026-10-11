export const reviewFields = ['image', 'phone', 'price_summary'];
export function reviewCoverage(venues, sources) {
  const fields = Object.fromEntries(reviewFields.map(field => [field, { venues: 0, candidates: 0, missing: 0 }]));
  let complete = 0, partial = 0, missingAll = 0;
  const missing = [];
  for (const venue of venues) {
    const absent = [];
    for (const field of reviewFields) {
      const candidates = sources[venue.id]?.[field] || [];
      fields[field].candidates += candidates.length;
      if (candidates.length) fields[field].venues++;
      else { fields[field].missing++; absent.push(field); }
    }
    if (!absent.length) complete++;
    else if (absent.length === reviewFields.length) missingAll++;
    else partial++;
    if (absent.length) missing.push({ id: venue.id, name: venue.name, address: venue.address, fields: absent });
  }
  return { totalVenues: venues.length, complete, partial, missingAll, fields, missing };
}

export function reviewHistoryCounts(rows) {
  const latest = new Map();
  for (const row of rows) {
    const key = `${row.facilityId}:${row.field}`;
    const previous = latest.get(key);
    if (!previous || String(row.createdAt) > String(previous.createdAt)
      || row.createdAt === previous.createdAt && row.id > previous.id) latest.set(key, row);
  }
  return Object.fromEntries(reviewFields.map(field => [field, {
    approved: [...latest.values()].filter(row => row.field === field && row.status === 'approve').length,
    rejected: [...latest.values()].filter(row => row.field === field && row.status === 'reject').length,
  }]));
}

export async function fetchVenueReviewCounts(client, signal) {
  let cursor, rows = [];
  for (;;) {
    let query = client.from('VenueDataReviews').select('id,facilityId,field,status,createdAt').order('id').limit(500);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query.abortSignal(signal);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) return reviewHistoryCounts(rows);
    cursor = data.at(-1).id;
  }
}
