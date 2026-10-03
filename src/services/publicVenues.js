import {
  collection,
  documentId,
  getCountFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { getDistance } from "../utils/geo";

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
function publicVenue(snapshot) {
  const data = snapshot.data();
  return {
    ...Object.fromEntries(
      publicFields
        .filter((key) => data[key] !== undefined)
        .map((key) => [key, data[key]]),
    ),
    id: snapshot.id,
  };
}

export async function listPublicVenues(data = {}) {
  const items = [];
  let cursor = data.cursor || null;
  let hasMore = true;
  // Use one equality index so production needs no new composite index.
  const constraints = [];
  if (data.province && data.province !== "ALL")
    constraints.push(where("province", "==", data.province));
  else if (data.sport && data.sport !== "ALL")
    constraints.push(where("sport", "==", data.sport));
  const search = normalize(data.search?.trim());
  while (items.length < PAGE_SIZE && hasMore) {
    const snapshot = await getDocsFromServer(
      query(
        collection(db, "Facilities"),
        ...constraints,
        orderBy(documentId()),
        ...(cursor ? [startAfter(cursor)] : []),
        limit(BATCH_SIZE),
      ),
    );
    hasMore = snapshot.size === BATCH_SIZE;
    for (let i = 0; i < snapshot.docs.length; i++) {
      const doc = snapshot.docs[i];
      cursor = doc.id;
      const venue = publicVenue(doc);
      if (venue.status === "archived") continue;
      if (data.sport && data.sport !== "ALL" && venue.sport !== data.sport)
        continue;
      if (
        data.amenity &&
        data.amenity !== "ALL" &&
        !(Array.isArray(venue.amenities) ? venue.amenities : []).some((value) =>
          normalize(value).includes(normalize(data.amenity)),
        )
      )
        continue;
      if (
        search &&
        !normalize(
          `${venue.name || ""} ${venue.address || ""} ${venue.province || ""} ${venue.name_en || ""}`,
        ).includes(search)
      )
        continue;

      if (data.userLat && data.userLng && data.maxDistance && data.maxDistance !== "ALL") {
        const dist = getDistance(data.userLat, data.userLng, venue.lat, venue.lng);
        if (dist === null || dist > Number(data.maxDistance)) {
          continue;
        }
        venue.distance = dist; // attach to show in UI
      }

      items.push(venue);
      if (items.length === PAGE_SIZE) {
        hasMore = i < snapshot.docs.length - 1 || hasMore;
        break;
      }
    }
  }
  return { items, cursor, hasMore };
}

async function listProvinces() {
  const provinces = [];
  let cursor;
  // Jump past each province's entire index range instead of reading every venue.
  while (true) {
    const snapshot = await getDocsFromServer(
      query(
        collection(db, "Facilities"),
        orderBy("province"),
        ...(cursor === undefined ? [] : [startAfter(cursor)]),
        limit(1),
      ),
    );
    if (snapshot.empty) return provinces.sort();
    cursor = snapshot.docs[0].data().province;
    if (typeof cursor === "string" && cursor.trim()) provinces.push(cursor);
  }
}

export async function publicCatalogue() {
  const [provinces, facilities, courts] = await Promise.all([
    listProvinces(),
    getCountFromServer(collection(db, "Facilities")),
    getCountFromServer(collection(db, "Courts")),
  ]);
  return {
    provinces,
    totalVenues: facilities.data().count,
    totalCourts: courts.data().count,
  };
}
