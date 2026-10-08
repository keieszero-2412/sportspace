import "dotenv/config";
import fs from "node:fs";
import postgres from "postgres";

const databaseUrl = process.env.MY_SUPABASE_DB_URL;
if (!databaseUrl) throw new Error("Missing MY_SUPABASE_DB_URL");
const read = (name) => JSON.parse(fs.readFileSync(new URL(`../data_export/${name}.json`, import.meta.url), "utf8"));
const users = read("Users").filter((user) =>
  user.id && user.name && user.role === "player" && Number(user.credibilityScore) > 8000
);
const facilities = read("Facilities").filter((venue) => venue.id && venue.name && venue.sport && Number.isFinite(Number(venue.lat)) && Number.isFinite(Number(venue.lng)));
const courts = read("Courts").filter((court) => court.id && court.facility_id && court.is_available !== false);
const courtsByVenue = new Map();
for (const court of courts) {
  if (!courtsByVenue.has(court.facility_id)) courtsByVenue.set(court.facility_id, []);
  courtsByVenue.get(court.facility_id).push(court);
}
if (users.length < 20 || facilities.length < 20) throw new Error("Local exports do not contain enough users or venues");

const seedText = process.env.MATCH_SEED_START_DATE || new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
let state = [...seedText].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
const pick = (items) => items[Math.floor(random() * items.length)];
const shuffle = (items) => [...items].sort(() => random() - 0.5);

const levels = [["Mới chơi", "Beginner"], ["Cơ bản", "Elementary"], ["Trung bình", "Intermediate"], ["Khá", "Upper-intermediate"], ["Nâng cao", "Advanced"], ["Mọi trình độ", "All levels"]];
const genderPreferences = [["Tất cả", "Open"], ["Nam", "Men"], ["Nữ", "Women"], ["Đôi nam nữ", "Mixed doubles"]];
const ageGroups = [["18-24", "18-24"], ["25-34", "25-34"], ["35-44", "35-44"], ["45+", "45+"], ["Mọi độ tuổi", "All ages"]];
const playStyles = [["Giao lưu", "Social"], ["Luyện tập", "Practice"], ["Thi đấu", "Competitive"], ["Cường độ cao", "High intensity"]];
const formats = [["Đánh đơn", "Singles"], ["Đánh đôi", "Doubles"], ["Chia đội", "Team play"], ["Xoay vòng", "Round robin"], ["Giải đấu ngắn", "Mini tournament"]];
const titles = [["Tìm người chơi cùng trình độ", "Players wanted at a similar level"], ["Giao lưu theo lịch cố định", "Scheduled social match"], ["Luyện tập có tổ chức", "Organized practice session"], ["Thi đấu phong trào", "Recreational competition"]];
const starts = ["05:30", "06:30", "08:00", "09:30", "15:30", "17:00", "18:30", "19:30", "20:30"];
const capacities = {
  Pickleball: [4, 6, 8], "Bóng đá": [10, 12, 14, 18, 22], "Cầu lông": [4, 6, 8],
  Tennis: [2, 4], "Bóng rổ": [6, 8, 10], "Bóng bàn": [2, 4, 6], "Bóng chuyền": [8, 10, 12],
};
const sportNamesEn = {
  Pickleball: "Pickleball", "Bóng đá": "Football", "Cầu lông": "Badminton", Tennis: "Tennis",
  "Bóng rổ": "Basketball", "Bóng bàn": "Table tennis", "Bóng chuyền": "Volleyball",
};
const durationBySport = { "Bóng đá": 90, "Bóng rổ": 90, "Bóng chuyền": 120 };
const supportedVenues = facilities.filter((venue) => capacities[venue.sport] && courtsByVenue.has(venue.id));
const bySport = supportedVenues.reduce((groups, venue) => {
  (groups[venue.sport] ||= []).push(venue);
  return groups;
}, {});
const sports = Object.keys(capacities).filter((sport) => bySport[sport]?.length);
if (sports.length !== Object.keys(capacities).length) throw new Error(`Missing real venues for: ${Object.keys(capacities).filter((sport) => !bySport[sport]?.length).join(", ")}`);

const dateAtOffset = (offset) => {
  const [year, month, day] = seedText.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
};
const addMinutes = (time, minutes) => {
  const [hour, minute] = time.split(":").map(Number);
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const courtRate = (court, start) => Number(start >= "17:00" ? court.price_night : court.price_day) || Number(court.basePrice) || 120000;

const majorVenues = {
  "Hà Nội": supportedVenues.filter((venue) => venue.province === "Hà Nội"),
  "Hồ Chí Minh": supportedVenues.filter((venue) => venue.province === "Hồ Chí Minh"),
};
const otherVenues = supportedVenues.filter((venue) => !majorVenues[venue.province]);
const venueFor = (pool, sport) => {
  const sameSport = pool.filter((venue) => venue.sport === sport);
  return pick(sameSport.length ? sameSport : pool);
};
const fixtures = [];
for (let day = 1; day <= 20; day += 1) {
  for (let slot = 0; slot < 20; slot += 1) {
    const sport = sports[(day * 20 + slot) % sports.length];
    const pool = slot < 8 ? majorVenues["Hà Nội"] : slot < 15 ? majorVenues["Hồ Chí Minh"] : otherVenues;
    const venue = venueFor(pool, sport);
    const court = pick(courtsByVenue.get(venue.id));
    const host = pick(users);
    const max = pick(capacities[sport]);
    const joinedCount = 1 + Math.floor(random() * Math.max(1, max - 1));
    const members = [host, ...shuffle(users.filter((user) => user.id !== host.id)).slice(0, joinedCount - 1)];
    const joinedUsers = members.map((user) => user.id);
    const memberNames = Object.fromEntries(members.map((user) => [user.id, user.name]));
    const start = pick(starts);
    const end = addMinutes(start, durationBySport[sport] || 60);
    const date = dateAtOffset(day);
    const startAt = Date.parse(`${date}T${start}:00+07:00`);
    const endAt = Date.parse(`${date}T${end}:00+07:00`);
    const [levelRequiredVi, levelRequiredEn] = pick(levels);
    const [genderPreferenceVi, genderPreferenceEn] = pick(genderPreferences);
    const [ageGroupVi, ageGroupEn] = pick(ageGroups);
    const [playStyleVi, playStyleEn] = pick(playStyles);
    const [matchFormatVi, matchFormatEn] = pick(formats);
    const [titleSuffixVi, titleSuffixEn] = pick(titles);
    const costPerPerson = Math.max(10000, Math.ceil((courtRate(court, start) / max) / 5000) * 5000);
    const slug = sport.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
    const id = `mock-match-${date}-${String(slot + 1).padStart(2, "0")}-${slug}`;
    const rawData = {
      title: `${sport}: ${titleSuffixVi}`,
      titleVi: `${sport}: ${titleSuffixVi}`,
      titleEn: `${sportNamesEn[sport]}: ${titleSuffixEn}`,
      sport, province: venue.province, venueId: venue.id, venueName: venue.name, venueAddress: venue.address,
      courtId: court.id, courtName: court.name, bookingId: `SIM-BOOKING-${date.replaceAll("-", "")}-${court.id}`,
      reservationStatus: "confirmed", reservationLabel: "Sân đã xác nhận", date, time: `${start} - ${end}`,
      startAt, endAt, levelRequired: levelRequiredVi, levelRequiredVi, levelRequiredEn,
      skillLevel: levelRequiredVi, genderPreference: genderPreferenceVi, genderPreferenceVi, genderPreferenceEn,
      ageGroup: ageGroupVi, ageGroupVi, ageGroupEn, playStyle: playStyleVi, playStyleVi, playStyleEn,
      matchFormat: matchFormatVi, matchFormatVi, matchFormatEn,
      reservationLabelVi: "Sân đã xác nhận", reservationLabelEn: "Court confirmed",
      language: random() > 0.8 ? "Việt / English" : "Tiếng Việt", equipmentProvided: random() > 0.45,
      indoor: Boolean(court.is_indoor), surfaceType: court.surface_type || "Theo tiêu chuẩn sân", costPerPerson,
      playersMax: max, playersJoined: joinedUsers.length, joinedUsers, memberNames,
      hostId: host.id, hostName: host.name,
      hostCredibility: Math.min(100, Math.round(Number(host.credibilityScore || 8500) / 100)),
      hostProfile: { role: host.role, preferredSport: sport, skillLevel: levelRequiredVi },
      status: "open", lat: Number(venue.lat), lng: Number(venue.lng),
      createdAt: Date.now() - Math.floor(random() * 7 * 86400000), mockData: true, seedVersion: 2,
    };
    fixtures.push({
      id,
      title: rawData.title,
      sport: rawData.sport,
      province: rawData.province || "",
      venueId: rawData.venueId,
      venueName: rawData.venueName,
      courtId: rawData.courtId,
      courtName: rawData.courtName || "",
      date: rawData.date,
      time: rawData.time,
      startAt: rawData.startAt,
      endAt: rawData.endAt,
      levelRequired: rawData.levelRequiredVi,
      costPerPerson: rawData.costPerPerson,
      playersMax: rawData.playersMax,
      playersJoined: rawData.playersJoined,
      joinedUsers: rawData.joinedUsers,
      memberNames: rawData.memberNames,
      hostId: rawData.hostId,
      hostName: rawData.hostName,
      hostCredibility: rawData.hostCredibility,
      status: rawData.status,
      lat: rawData.lat,
      lng: rawData.lng,
      createdAt: rawData.createdAt,
      updatedAt: null,
      raw_data: rawData,
    });
  }
}

if (process.env.MATCH_SEED_DRY_RUN !== "1") {
  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql.begin(async (tx) => {
      await tx`delete from "Matches" where raw_data ->> 'mockData' = 'true'`;
      for (const match of fixtures) {
        await tx`insert into "Matches" ${tx(match, ...Object.keys(match))}
          on conflict (id) do update set ${tx(match, ...Object.keys(match).filter((key) => key !== "id"))}`;
      }
    });
  } finally {
    await sql.end();
  }
}
const counts = Object.fromEntries(sports.map((sport) => [sport, fixtures.filter((match) => match.sport === sport).length]));
const provinces = fixtures.reduce((result, match) => {
  result[match.province] = (result[match.province] || 0) + 1;
  return result;
}, {});
console.log(JSON.stringify({
  dryRun: process.env.MATCH_SEED_DRY_RUN === "1",
  inserted: fixtures.length,
  range: [fixtures[0].date, fixtures.at(-1).date],
  counts,
  majorCities: { "Hà Nội": provinces["Hà Nội"] || 0, "Hồ Chí Minh": provinces["Hồ Chí Minh"] || 0 },
  otherProvinces: Object.entries(provinces).filter(([province]) => !["Hà Nội", "Hồ Chí Minh"].includes(province)).length,
  minimumHostCredibility: Math.min(...fixtures.map((match) => match.hostCredibility)),
}, null, 2));
