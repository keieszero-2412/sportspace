function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function getGoogleRating(venue = {}) {
  const imported = venue.raw_data || {};
  const rawRating = numeric(venue.google_rating ?? imported.google_rating ?? venue.rating ?? imported.rating);
  const rawCount = numeric(venue.google_reviews_count ?? imported.google_reviews_count ?? venue.reviews_count ?? imported.reviews_count);
  const rating =
    rawRating !== null && rawRating >= 1 && rawRating <= 5 ? rawRating : null;
  const count =
    rawCount !== null && Number.isInteger(rawCount) && rawCount >= 0
      ? rawCount
      : null;
  // Search links work without an API key. A verified Place ID makes them exact.
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set(
    "query",
    [venue.name, venue.address, venue.province]
      .filter((value) => typeof value === "string" && value.trim())
      .join(", "),
  );
  const placeId = venue.google_place_id ?? imported.google_place_id;
  if (typeof placeId === "string" && placeId.trim())
    url.searchParams.set("query_place_id", placeId.trim());
  return { rating, count, url: url.href };
}
