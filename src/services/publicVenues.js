import { supabase } from "../supabase";
import { getDistance } from "../utils/geo";
import { publicPriceReference } from "../utils/venuePrice";

const PAGE_SIZE = 24;
const BATCH_SIZE = 60;
const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

// Only public display fields may reach the persistent catalogue cache.
const publicFields = [
  "facility_id",
  "name",
  "name_en",
  "sport",
  "province",
  "province_en",
  "address",
  "address_en",
  "phone",
  "phone_status",
  "phone_sources",
  "phone_checked_at",
  "operating_hours",
  "scale_courts",
  "price_summary",
  "amenities",
  "image",
  "rating",
  "reviews_count",
  "google_rating",
  "google_reviews_count",
  "google_place_id",
  "status",
  "lat",
  "lng",
];
// Project only public rating fields from imported JSON; do not expose raw_data.
const ratingFields = ["rating", "reviews_count", "google_rating", "google_reviews_count", "google_place_id"];
const queryFields = ["id", ...publicFields, ...ratingFields.map((key) => `imported_${key}:raw_data->${key}`), "imported_imageKind:raw_data->imageKind", "imported_price_reference:raw_data->price_reference"].join(",");

function publicVenue(data) {
  const ratings = Object.fromEntries(ratingFields.map((key) => [key, data[key] ?? data[`imported_${key}`]]));
  return {
    ...Object.fromEntries(
      publicFields
        .filter((key) => data[key] !== undefined)
        .map((key) => [key, data[key]]),
    ),
    ...Object.fromEntries(Object.entries(ratings).filter(([, value]) => value !== undefined)),
    ...(['illustrative','candidate'].includes(data.imported_imageKind) ? { image_kind: data.imported_imageKind } : {}),
    ...(publicPriceReference(data.imported_price_reference) ? {price_reference:publicPriceReference(data.imported_price_reference)} : {}),
    id: data.id,
  };
}


function matchesVenue(venue, data, search) {
  if (venue.status === "archived") return false;
  if (data.province && data.province !== "ALL" && venue.province !== data.province)
    return false;
  if (data.sport && data.sport !== "ALL" && venue.sport !== data.sport)
    return false;
  if (
    data.amenity &&
    data.amenity !== "ALL" &&
    !(Array.isArray(venue.amenities) ? venue.amenities : []).some((value) =>
      normalize(value).includes(normalize(data.amenity)),
    )
  )
    return false;
  if (
    search &&
    !normalize(
        `${venue.name || ""} ${venue.address || ""} ${venue.province || ""} ${venue.name_en || ""}`,
      ).includes(search)
  )
    return false;
  return true;
}

function applyDistance(venue, data) {
  if (data.userLat && data.userLng && data.maxDistance && data.maxDistance !== "ALL") {
    const distance = getDistance(data.userLat, data.userLng, venue.lat, venue.lng);
    if (distance === null || distance > Number(data.maxDistance)) return null;
    return { ...venue, distance };
  }
  return venue;
}


export async function listPublicVenues(data = {}) {
  const items = [];
  let cursor = data.cursor || null;
  let hasMore = true;
  
  const search = normalize(data.search?.trim());
  const remoteSearch = String(data.search || "")
    .trim()
    .replace(/[\\%_(),]/g, " ")
    .replace(/\s+/g, " ");
  while (items.length < PAGE_SIZE && hasMore) {
    const buildQuery = (withSearch) => {
      let q = supabase
        .from("Facilities")
        .select(queryFields)
        .order("id")
        .limit(BATCH_SIZE);
      if (data.province && data.province !== "ALL") q = q.eq("province", data.province);
      if (data.sport && data.sport !== "ALL") q = q.eq("sport", data.sport);
      if (cursor) q = q.gt("id", cursor);
      if (withSearch) {
        q = q.or(
          ["name", "name_en", "address", "address_en", "province", "province_en"]
            .map((field) => `${field}.ilike.%${remoteSearch}%`)
            .join(","),
        );
      }
      return q;
    };

    let { data: snapshot, error } = await buildQuery(Boolean(remoteSearch));
    if (error) {
      throw error;
    }
    // Postgres ilike is accent-sensitive. Retry one unfiltered batch when a
    // normalized client search has no server-side match, preserving accent-insensitive search.
    if (remoteSearch && !items.length && !snapshot.length && !data.cursor) {
      ({ data: snapshot, error } = await buildQuery(false));
      if (error) {
        throw error;
      }
    }
    
    hasMore = snapshot.length === BATCH_SIZE;
    
    for (let i = 0; i < snapshot.length; i++) {
      const doc = snapshot[i];
      cursor = doc.id;
      const venue = publicVenue(doc);
      if (!matchesVenue(venue, data, search)) continue;
      const distanceVenue = applyDistance(venue, data);
      if (!distanceVenue) continue;
      items.push(distanceVenue);
      if (items.length === PAGE_SIZE) {
        hasMore = i < snapshot.length - 1 || hasMore;
        break;
      }
    }
  }
  return { items, cursor, hasMore };
}

async function listProvinces() {
  return [
    "An Giang", "Bắc Ninh", "Cà Mau", "Cao Bằng", "Cần Thơ", "Đà Nẵng", "Đắk Lắk", "Điện Biên", "Đồng Nai", "Đồng Tháp",
    "Gia Lai", "Hà Nội", "Hà Tĩnh", "Hải Phòng", "Hồ Chí Minh", "Huế", "Hưng Yên", "Khánh Hòa", "Lai Châu", "Lâm Đồng",
    "Lạng Sơn", "Lào Cai", "Nghệ An", "Ninh Bình", "Phú Thọ", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sơn La", "Tây Ninh",
    "Thái Nguyên", "Thanh Hóa", "Tuyên Quang", "Vĩnh Long"
  ];
}

export async function publicCatalogue() {
  const [provinces, facilities, courts] = await Promise.all([
    listProvinces(),
    supabase.from("Facilities").select("*", { count: "exact", head: true }),
    supabase.from("Courts").select("*", { count: "exact", head: true }),
  ]);
  if (facilities.error) throw facilities.error;
  if (courts.error) throw courts.error;

  return {
    provinces,
    totalVenues: facilities.count ?? 0,
    totalCourts: courts.count ?? 0,
  };
}
