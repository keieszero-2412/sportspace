import { supabase } from "../supabase";
import { getDistance } from "../utils/geo";
import bundledVenues from "../data/venues.json";

const PAGE_SIZE = 24;
const BATCH_SIZE = 60;
const bundledCourtCount = bundledVenues.reduce(
  (total, venue) => total + (Number(venue.scale_courts) || 0),
  0,
);
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

function publicVenue(data) {
  return {
    ...Object.fromEntries(
      publicFields
        .filter((key) => data[key] !== undefined)
        .map((key) => [key, data[key]]),
    ),
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

function listBundledVenues(data, search) {
  const filtered = bundledVenues
    .map(publicVenue)
    .filter((venue) => matchesVenue(venue, data, search))
    .map((venue) => applyDistance(venue, data))
    .filter(Boolean);
  const nextIndex = data.cursor
    ? filtered.findIndex((venue) => venue.id > data.cursor)
    : 0;
  const start = nextIndex === -1 ? filtered.length : nextIndex;
  const items = filtered.slice(start, start + PAGE_SIZE);
  return {
    items,
    cursor: items.at(-1)?.id || data.cursor || null,
    hasMore: start + items.length < filtered.length,
  };
}

export async function listPublicVenues(data = {}) {
  const items = [];
  let cursor = data.cursor || null;
  let hasMore = true;
  
  const search = normalize(data.search?.trim());
  while (items.length < PAGE_SIZE && hasMore) {
    let q = supabase.from("Facilities").select("*").order("id").limit(BATCH_SIZE);
    
    if (data.province && data.province !== "ALL") {
      q = q.eq("province", data.province);
    } else if (data.sport && data.sport !== "ALL") {
      q = q.eq("sport", data.sport);
    }
    
    if (cursor) {
      q = q.gt("id", cursor);
    }
    
    const { data: snapshot, error } = await q;
    if (error) throw error;
    if (!snapshot.length && !items.length && !data.cursor) {
      return listBundledVenues(data, search);
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
    totalVenues: facilities.count || bundledVenues.length,
    totalCourts: courts.count || bundledCourtCount,
  };
}
