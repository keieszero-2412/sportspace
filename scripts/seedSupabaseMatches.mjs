import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.MY_SUPABASE_DB_URL;

if ((!url || !serviceRoleKey) && !databaseUrl) {
  throw new Error(
    "Missing Supabase service-role credentials or MY_SUPABASE_DB_URL",
  );
}

const supabase =
  url && serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
const sql = databaseUrl ? postgres(databaseUrl, { max: 1 }) : null;

const sportTemplates = [
  {
    sport: "Pickleball",
    max: [4, 6, 8],
    cost: [50000, 70000, 90000],
    venues: ["Hanoi Pickleball Arena", "Saigon Pickleball Hub"],
  },
  {
    sport: "Bóng đá",
    max: [10, 14, 18, 22],
    cost: [40000, 50000, 60000],
    venues: ["Sân bóng Hoàng Minh Giám", "Sân bóng Phú Thọ"],
  },
  {
    sport: "Cầu lông",
    max: [4, 6, 8],
    cost: [60000, 80000, 100000],
    venues: ["CLB Cầu lông Cầu Giấy", "Nhà thi đấu Tân Bình"],
  },
  {
    sport: "Tennis",
    max: [2, 4],
    cost: [100000, 140000, 180000],
    venues: ["Tennis Mỹ Đình", "Tennis Thảo Điền"],
  },
  {
    sport: "Bóng rổ",
    max: [6, 8, 10],
    cost: [30000, 40000, 50000],
    venues: ["Sân bóng rổ Thanh Xuân", "Sân bóng rổ Phú Thọ"],
  },
  {
    sport: "Bóng bàn",
    max: [2, 4],
    cost: [20000, 30000, 40000],
    venues: ["CLB Bóng bàn Bách Khoa", "CLB Bóng bàn Quận 3"],
  },
  {
    sport: "Bóng chuyền",
    max: [8, 10, 12],
    cost: [30000, 40000, 50000],
    venues: ["NTĐ Đại học Quốc gia", "NTĐ Rạch Miễu"],
  },
];

const locations = [
  { province: "Hà Nội", lat: 21.0285, lng: 105.8542, weight: 28 },
  { province: "Hồ Chí Minh", lat: 10.8231, lng: 106.6297, weight: 28 },
  { province: "Đà Nẵng", lat: 16.0544, lng: 108.2022, weight: 4 },
  { province: "Hải Phòng", lat: 20.8449, lng: 106.6881, weight: 3 },
  { province: "Cần Thơ", lat: 10.0452, lng: 105.7469, weight: 3 },
  { province: "Bình Dương", lat: 11.3254, lng: 106.477, weight: 2 },
  { province: "Nha Trang", lat: 12.2388, lng: 109.1967, weight: 2 },
  { province: "Huế", lat: 16.4637, lng: 107.5909, weight: 1 },
];

const hosts = [
  ["mock-host-01", "Nguyễn Minh Anh", 96],
  ["mock-host-02", "Trần Hoàng Nam", 91],
  ["mock-host-03", "Lê Thu Hà", 98],
  ["mock-host-04", "Phạm Đức Long", 89],
  ["mock-host-05", "Vũ Khánh Linh", 94],
  ["mock-host-06", "Đỗ Gia Huy", 87],
  ["mock-host-07", "Hoàng Mai", 100],
];

const levels = [
  "Mọi trình độ",
  "Phong trào",
  "Phong trào khá",
  "Khá / Cọ xát",
  "Bán chuyên",
];

function choose(list, index) {
  return list[index % list.length];
}

function pickLocation(index) {
  let offset = index;
  for (const location of locations) {
    if (offset < location.weight) return location;
    offset -= location.weight;
  }
  return locations[0];
}

function dateInNext15Days(index) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + (index % 15));
  return date.toISOString().slice(0, 10);
}

function timeRange(index) {
  const startHour = 6 + ((index * 3) % 15);
  const start = `${String(startHour).padStart(2, "0")}:00`;
  const end = `${String(startHour + 2).padStart(2, "0")}:00`;
  return { start, end };
}

function buildFixtures() {
  return Array.from({ length: 71 }, (_, index) => {
    const template = choose(sportTemplates, index);
    const location = pickLocation(index);
    const host = choose(hosts, index);
    const max = choose(template.max, index + 1);
    const joined = Math.max(1, Math.min(max - 1, 1 + ((index * 5) % max)));
    const { start, end } = timeRange(index);
    const date = dateInNext15Days(index);
    const venue = choose(template.venues, index + location.province.length);
    const id = `mock-fixture-${date}-${String(index + 1).padStart(2, "0")}`;
    const joinedUsers = [
      host[0],
      ...Array.from(
        { length: joined - 1 },
        (_, memberIndex) => `mock-player-${String(index * 10 + memberIndex + 1).padStart(3, "0")}`,
      ),
    ];
    const title = `${template.sport} ${index % 3 === 0 ? "giao lưu cuối tuần" : "ghép người chơi"} #${index + 1}`;
    const startAt = Date.parse(`${date}T${start}:00+07:00`);
    const endAt = Date.parse(`${date}T${end}:00+07:00`);
    const rawData = {
      title,
      sport: template.sport,
      province: location.province,
      venueName: `${venue} - ${location.province}`,
      date,
      time: `${start} - ${end}`,
      startAt,
      endAt,
      lat: location.lat + ((index % 5) - 2) * 0.002,
      lng: location.lng + ((index % 7) - 3) * 0.002,
      levelRequired: choose(levels, index),
      costPerPerson: choose(template.cost, index + 2),
      playersMax: max,
      playersJoined: joined,
      joinedUsers,
      memberNames: Object.fromEntries(
        joinedUsers.map((userId, memberIndex) => [
          userId,
          memberIndex === 0 ? host[1] : `Người chơi ${memberIndex}`,
        ]),
      ),
      hostId: host[0],
      hostName: host[1],
      hostCredibility: host[2],
      status: "open",
      createdAt: Date.now(),
      mockData: true,
    };
    return { id, raw_data: rawData };
  });
}

const fixtures = buildFixtures();
if (supabase) {
  const { error } = await supabase.from("Matches").insert(fixtures);
  if (error) throw error;
} else {
  await sql.begin(async (transaction) => {
    for (const fixture of fixtures) {
      await transaction`
        INSERT INTO "Matches" (id, raw_data)
        VALUES (${fixture.id}, ${transaction.json(fixture.raw_data)})
      `;
    }
  });
  await sql.end();
}
console.log(`Inserted ${fixtures.length} mock fixtures into Supabase Matches.`);
