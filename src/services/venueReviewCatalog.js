export const emptyReviewCatalog = { venues: {}, totals: {}, identities: [], coverage: null };
export async function fetchVenueReviewCatalog(client, signal) {
  const { data, error } = await client.from('VenueReviewCatalog').select('payload').eq('id','venues').single().abortSignal(signal);
  if (error) throw error;
  const payload = data?.payload;
  if (!payload || !payload.generatedAt || !payload.venues || !payload.totals || !Array.isArray(payload.identities)) {
    throw new Error('Venue review source catalog is missing or invalid.');
  }
  return payload;
}
