// A plausible number is not proof that it belongs to a venue.
export function normalizePhone(value) {
  let digits = String(value || "").replace(/[\s().-]/g, "");
  if (digits.startsWith("+84")) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("84")) digits = `0${digits.slice(2)}`;
  if (!/^(?:0[35789]\d{8}|02\d{9})$/.test(digits)) return null;
  if (/^(\d)\1+$/.test(digits.slice(1)) || /^(?:0123456789|0912345678|0987654321)$/.test(digits)) return null;
  return digits;
}

export function getVenuePhone(venue) {
  if (venue?.phone_status !== "sourced") return null;
  const number = normalizePhone(venue.phone);
  if (!number || !Array.isArray(venue.phone_sources)) return null;
  const sources = venue.phone_sources.filter((source) => {
    try {
      return new URL(source.url).protocol === "https:" &&
        normalizePhone(source.phone) === number;
    } catch { return false; }
  });
  return sources.length ? { number, sources, checkedAt: venue.phone_checked_at } : null;
}
