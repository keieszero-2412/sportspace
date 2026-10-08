import fs from "node:fs";
import { readCsv } from "./lib/public-price-csv.mjs";

const cataloguePath = "src/data/venues.json";
const sourcePath = "docs/data/gia-san-nguon-cong-khai-toan-bo.csv";
const reportPath = "docs/data/bao-cao-price-summary.json";

const venues = JSON.parse(fs.readFileSync(cataloguePath, "utf8"));
const sourceRows = readCsv(sourcePath);
const numeric = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};
const formatVnd = (value) => `${Math.round(value).toLocaleString("vi-VN")}đ`;
const sourceBacked = new Map();

for (const row of sourceRows) {
  if (row.status !== "curated_public_price") continue;
  const min = numeric(row.price_min_vnd);
  const max = numeric(row.price_max_vnd) ?? min;
  if (!min || !max || max < min) continue;
  if (row.source_sport && row.source_sport !== row.sport) continue;
  const rows = sourceBacked.get(row.facility_id) || [];
  rows.push({
    min,
    max,
    unitMinutes: numeric(row.unit_minutes),
    priceBasis: row.price_basis,
    offerType: row.offer_type,
    sourceUrl: row.source_url,
    verificationStatus: row.verification_status,
  });
  sourceBacked.set(row.facility_id, rows);
}

const getSummary = (rows) => {
  const courtHourRows = rows.filter(
    (row) => row.priceBasis === "court_hour" && (!row.unitMinutes || row.unitMinutes === 60),
  );
  const selected = courtHourRows.length ? courtHourRows : rows;
  const min = Math.min(...selected.map((row) => row.min));
  const max = Math.max(...selected.map((row) => row.max));
  const hasHourlyEvidence = selected.some((row) => row.priceBasis === "court_hour");
  const suffix = hasHourlyEvidence ? "/h" : "";
  return min === max
    ? `${formatVnd(min)}${suffix}`
    : `${formatVnd(min)} - ${formatVnd(max)}${suffix}`;
};

const realPriceRangeVenueIds = [];
const mockPriceVenueIds = [];
const invalidPriceSummaryVenueIds = [];
const repairedFromSource = [];
const clearedMockPrices = [];

for (const venue of venues) {
  const existing = String(venue.price_summary || "").trim();
  const rows = sourceBacked.get(venue.id);
  if (rows) {
    const next = getSummary(rows);
    realPriceRangeVenueIds.push(venue.id);
    if (existing !== next) repairedFromSource.push({ id: venue.id, from: existing, to: next });
    venue.price_summary = next;
    continue;
  }

  mockPriceVenueIds.push(venue.id);
  if (existing !== "Chưa có giá công khai" && !/\d/.test(existing))
    invalidPriceSummaryVenueIds.push(venue.id);
  if (existing !== "Chưa có giá công khai") {
    clearedMockPrices.push({ id: venue.id, from: existing });
    venue.price_summary = "Chưa có giá công khai";
  }
}

fs.writeFileSync(cataloguePath, `${JSON.stringify(venues, null, 2)}\n`);
fs.writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      catalogueCount: venues.length,
      sourceRowCount: sourceRows.length,
      sourceBackedVenueCount: realPriceRangeVenueIds.length,
      mockVenueCount: mockPriceVenueIds.length,
      invalidSummaryCount: invalidPriceSummaryVenueIds.length,
      repairedFromSourceCount: repairedFromSource.length,
      clearedMockPriceCount: clearedMockPrices.length,
      realPriceRangeVenueIds,
      mockPriceVenueIds,
      invalidPriceSummaryVenueIds,
      repairedFromSource,
      clearedMockPrices,
      caveats: [
        "Nguồn công khai có thể là giá tham khảo, chưa đồng nghĩa giá checkout hiện hành.",
        "Sân chưa có nguồn không được suy diễn giá theo môn hoặc theo khu vực.",
        "Các candidate chưa được duyệt trong review queue không được tự động đưa vào catalogue.",
      ],
    },
    null,
    2,
  )}\n`,
);

console.log(
  JSON.stringify(
    {
      catalogueCount: venues.length,
      sourceBackedVenueCount: realPriceRangeVenueIds.length,
      mockVenueCount: mockPriceVenueIds.length,
      invalidSummaryCount: invalidPriceSummaryVenueIds.length,
      repairedFromSourceCount: repairedFromSource.length,
      clearedMockPriceCount: clearedMockPrices.length,
      reportPath,
    },
    null,
    2,
  ),
);
