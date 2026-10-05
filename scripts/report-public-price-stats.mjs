import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const pricePath = path.join(root, "docs", "data", "gia-san-nguon-cong-khai.csv");
const snapshotPath = path.join(root, "data_export", "coordinates", "firestore-snapshot.json");
const csvOutput = path.join(root, "docs", "data", "thong-ke-gia-theo-mon.csv");
const mdOutput = path.join(root, "docs", "data", "thong-ke-gia-theo-mon.md");

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") { row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const repairMojibake = (value) => /Ã|Ä|Æ|áº|á»/.test(value)
  ? Buffer.from(value, "latin1").toString("utf8")
  : value;
const number = (value) => value === "" || value == null ? null : Number(value);
const median = (numbers) => {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value) => value == null ? "" : Math.round(value);
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const prices = parseCsv(await readFile(pricePath, "utf8"));
const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const facilities = snapshot.documents.map((document) => ({
  id: document.name.split("/").at(-1),
  sport: repairMojibake(document.fields?.sport?.stringValue || "Chưa phân loại"),
}));
const sportById = new Map(facilities.map((facility) => [facility.id, facility.sport]));
const facilityCountBySport = Map.groupBy(facilities, (facility) => facility.sport);

const eligiblePrices = prices.filter((row) => row.price_basis === "court_hour" && Number(row.unit_minutes) === 60
  && (!row.source_sport || row.source_sport === sportById.get(row.facility_id)));
const referenceOfferTypes = new Set(["standard", "approximate", "peak_unspecified"]);
const priceRowsBySport = Map.groupBy(eligiblePrices, (row) => sportById.get(row.facility_id) || "Chưa phân loại");
const sports = [...facilityCountBySport.keys()].sort((a, b) => a.localeCompare(b, "vi"));

const stats = sports.map((sport) => {
  const rows = priceRowsBySport.get(sport) || [];
  const representative = rows.map((row) => {
    const min = number(row.price_min_vnd), max = number(row.price_max_vnd);
    return min == null || max == null ? null : (min + max) / 2;
  }).filter(Number.isFinite);
  const referenceRows = rows.filter((row) => referenceOfferTypes.has(row.offer_type));
  const referenceValues = referenceRows.map((row) => {
    const min = number(row.price_min_vnd), max = number(row.price_max_vnd);
    return min == null || max == null ? null : (min + max) / 2;
  }).filter(Number.isFinite);
  const lowerBounds = rows.map((row) => number(row.price_min_vnd)).filter(Number.isFinite);
  const upperBounds = rows.map((row) => number(row.price_max_vnd) ?? number(row.price_min_vnd)).filter(Number.isFinite);
  const frequencies = new Map();
  for (const value of representative) frequencies.set(value, (frequencies.get(value) || 0) + 1);
  const maxFrequency = frequencies.size ? Math.max(...frequencies.values()) : 0;
  const modes = [...frequencies].filter(([, count]) => count === maxFrequency).map(([value]) => value).sort((a, b) => a - b);
  const totalFacilities = facilityCountBySport.get(sport).length;
  const pricedFacilities = new Set(rows.map((row) => row.facility_id)).size;
  return {
    sport,
    totalFacilities,
    pricedFacilities,
    coveragePercent: totalFacilities ? pricedFacilities / totalFacilities * 100 : 0,
    priceRowCount: rows.length,
    meanVnd: representative.length ? representative.reduce((sum, value) => sum + value, 0) / representative.length : null,
    medianVnd: median(representative),
    minVnd: lowerBounds.length ? Math.min(...lowerBounds) : null,
    maxVnd: upperBounds.length ? Math.max(...upperBounds) : null,
    modeVnd: modes.length === 1 ? modes[0] : null,
    modeFrequency: modes.length === 1 ? maxFrequency : 0,
    referenceRowCount: referenceRows.length,
    referenceMeanVnd: referenceValues.length ? referenceValues.reduce((sum, value) => sum + value, 0) / referenceValues.length : null,
    referenceMedianVnd: median(referenceValues),
  };
});

const headers = ["sport", "total_facilities", "priced_facilities", "coverage_percent", "price_row_count", "mean_vnd", "median_vnd", "min_vnd", "max_vnd", "mode_vnd", "mode_frequency", "reference_row_count", "reference_mean_vnd", "reference_median_vnd"];
const csvRows = stats.map((row) => [row.sport, row.totalFacilities, row.pricedFacilities, row.coveragePercent.toFixed(2), row.priceRowCount, round(row.meanVnd), round(row.medianVnd), round(row.minVnd), round(row.maxVnd), round(row.modeVnd), row.modeFrequency, row.referenceRowCount, round(row.referenceMeanVnd), round(row.referenceMedianVnd)].map(csvCell).join(","));
await writeFile(csvOutput, `\uFEFF${headers.map(csvCell).join(",")}\n${csvRows.join("\n")}\n`, "utf8");

const format = (value) => value == null ? "—" : `${Math.round(value).toLocaleString("vi-VN")} đ`;
const tableRows = stats.map((row) => `| ${row.sport} | ${row.totalFacilities} | ${row.pricedFacilities} | ${row.coveragePercent.toFixed(2)}% | ${row.priceRowCount} | ${format(row.meanVnd)} | ${format(row.medianVnd)} | ${format(row.minVnd)} | ${format(row.maxVnd)} | ${format(row.modeVnd)} | ${row.modeFrequency || "—"} |`);
const referenceRows = stats.map((row) => `| ${row.sport} | ${row.referenceRowCount} | ${format(row.referenceMeanVnd)} | ${format(row.referenceMedianVnd)} |`);
const md = `# Thống kê giá theo môn thể thao\n\nNgày tính: 2026-10-04 (UTC+7). Chỉ dùng giá thuê sân theo giờ đã rà soát; loại gói kèm HLV. Với khoảng giá, mean/median dùng trung điểm; min/max dùng biên nguồn. Thống kê không có trọng số theo số giờ hoặc số sân con.\n\n| Môn | Tổng sân | Có giá | Độ phủ | Dòng giá | Trung bình | Median | Min | Max | Mode | Freq |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${tableRows.join("\n")}\n\n## Giá tham chiếu không gồm khuyến mãi và gói dài hạn\n\n| Môn | Dòng tham chiếu | Trung bình | Median |\n|---|---:|---:|---:|\n${referenceRows.join("\n")}\n`;
await writeFile(mdOutput, md + '\nLưu ý: Có giá trong bảng này nghĩa là có giá cả sân/giờ, không phải mọi loại giá tham khảo. Loại nửa sân và lệch môn nguồn/danh mục. Mean/median không dùng cận dưới đơn lẻ. Bảng tổng gồm cả giá nguồn cũ; riêng mẫu bóng đá hiện là giá lịch sử từ nguồn cập nhật năm 2021, không đại diện giá hiện hành. Xem bao-cao-mo-rong-gia-san.md để biết độ phủ mọi đơn vị và giới hạn nguồn.\n', "utf8");
process.stdout.write(`${JSON.stringify({ sports: stats.length, sportsWithPrices: stats.filter((row) => row.pricedFacilities).length, csvOutput: path.relative(root, csvOutput), mdOutput: path.relative(root, mdOutput) }, null, 2)}\n`);
