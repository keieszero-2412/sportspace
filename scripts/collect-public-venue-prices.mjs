import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readCsv } from './lib/public-price-csv.mjs';

const root = process.cwd();
const snapshotPath = path.join(root, "data_export", "coordinates", "firestore-snapshot.json");
const outputDir = path.join(root, "data_export", "public-prices");
const pageDir = path.join(outputDir, "pages");
const csvPath = path.join(root, "docs", "data", "gia-san-nguon-cong-khai-toan-bo.csv");
const reportPath = path.join(root, "docs", "data", "bao-cao-gia-san-nguon-cong-khai.json");

const args = new Set(process.argv.slice(2));
const valueAfter = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
};
const limit = valueAfter("--limit", Infinity);
const concurrency = Math.max(1, Math.min(8, valueAfter("--concurrency", 4)));
const refresh = args.has("--refresh");
const curatedFacilityIds = new Set(readCsv(path.join(root,'docs/data/gia-san-nguon-cong-khai.csv')).map(r=>r.facility_id));
const rejectedNonRentalIds = new Set(["VN_0043", "VN_0096"]);
const observedAt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const decodeEntities = (value) => value
  .replace(/&nbsp;|&#160;/gi, " ")
  .replace(/&ndash;|&mdash;|&#8211;|&#8212;/gi, "-")
  .replace(/&quot;|&#34;/gi, '"')
  .replace(/&apos;|&#39;/gi, "'")
  .replace(/&amp;|&#38;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");

const htmlToText = (html) => decodeEntities(html)
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const parseMoney = (raw, suffix = "") => {
  const compact = raw.replace(/\s/g, "");
  let amount;
  if (/^[0-9]{1,3}(?:[.,][0-9]{3})+$/.test(compact)) {
    amount = Number(compact.replace(/[.,]/g, ""));
  } else {
    amount = Number(compact.replace(",", "."));
  }
  if (!Number.isFinite(amount)) return null;
  if (/k|nghìn|ngàn/i.test(suffix)) amount *= 1_000;
  if (/triệu|tr/i.test(suffix)) amount *= 1_000_000;
  if (amount >= 10 && amount < 10_000 && !suffix) amount *= 1_000;
  return amount >= 10_000 && amount <= 10_000_000 ? Math.round(amount) : null;
};

const moneyPattern = /(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(đồng|vnđ|vnd|đ|k|nghìn|ngàn|triệu)\b/giu;
const priceCuePattern = /(giá\s*(?:thuê|sân|đặt|chơi)?|chi\s*phí|mức\s*giá|\/\s*(?:giờ|h|phút|ca))/iu;

function extractPriceEvidence(html) {
  const text = htmlToText(html);
  const lower = text.toLocaleLowerCase("vi");
  const cueIndexes = [];
  const cuePattern = /(giá\s*(?:thuê|sân|đặt|chơi)?|chi\s*phí|mức\s*giá)/giu;
  for (const match of lower.matchAll(cuePattern)) cueIndexes.push(match.index);

  const snippets = [];
  const amounts = [];
  for (const index of cueIndexes) {
    const snippet = text.slice(Math.max(0, index - 80), Math.min(text.length, index + 240));
    if (/luôn\s*xác\s*nhận\s*giá/iu.test(snippet)) continue;
    const found = [...snippet.matchAll(moneyPattern)]
      .map((match) => parseMoney(match[1], match[2]))
      .filter(Boolean);
    if (!found.length || !priceCuePattern.test(snippet)) continue;
    snippets.push(snippet.trim());
    amounts.push(...found);
    if (snippets.length === 3) break;
  }

  const uniqueAmounts = [...new Set(amounts)].sort((a, b) => a - b);
  const evidence = [...new Set(snippets)].join(" | ").slice(0, 1_500);
  const contactOnly = !uniqueAmounts.length && /(giá[^.]{0,80}(liên hệ|inbox)|liên hệ[^.]{0,80}(giá|báo giá))/iu.test(text);
  const timeSlots = extractTimeSlots(text);
  return {
    status: uniqueAmounts.length ? "price_found" : contactOnly ? "contact_only" : "no_public_price",
    priceMinVnd: uniqueAmounts[0] ?? "",
    priceMaxVnd: uniqueAmounts.at(-1) ?? "",
    evidence,
    timeSlots,
  };
}

const normalizeTime = (hour, minute = "00") => {
  const h = Number(hour);
  const m = Number(minute || 0);
  if (h > 24 || m > 59 || (h === 24 && m !== 0)) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

function inferDayGroup(context) {
  const normalized = context.toLocaleLowerCase("vi");
  const candidates = [
    [/(thứ\s*(?:2|hai)\s*(?:đến|tới|[-–—])\s*thứ\s*(?:6|sáu)|từ\s*thứ\s*(?:2|hai)\s*đến\s*thứ\s*(?:6|sáu)|ngày\s*thường)/giu, "mon-fri"],
    [/(thứ\s*(?:7|bảy)\s*(?:và|,|[-–—])?\s*(?:chủ\s*nhật|cn)|cuối\s*tuần)/giu, "sat-sun"],
    [/(thứ\s*(?:2|hai)\s*(?:đến|tới|[-–—])\s*(?:chủ\s*nhật|cn)|tất\s*cả\s*các\s*ngày|hàng\s*ngày)/giu, "mon-sun"],
  ];
  let best = { index: -1, value: "unknown" };
  for (const [pattern, value] of candidates) {
    for (const match of normalized.matchAll(pattern)) {
      if (match.index > best.index) best = { index: match.index, value };
    }
  }
  return best.value;
}

function extractTimeSlots(text) {
  const slots = [];
  const rangePattern = /\b(?:từ\s*)?(\d{1,2})(?:\s*(?:h|:|giờ)\s*(\d{1,2})?)?\s*(?:đến|tới|[-–—])\s*(\d{1,2})(?:\s*(?:h|:|giờ)\s*(\d{1,2})?)?\b/giu;
  for (const match of text.matchAll(rangePattern)) {
    const startTime = normalizeTime(match[1], match[2]);
    const endTime = normalizeTime(match[3], match[4]);
    if (!startTime || !endTime) continue;
    const before = text.slice(Math.max(0, match.index - 320), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 180);
    const context = `${before.slice(-180)} ${match[0]} ${after}`;
    if (!priceCuePattern.test(context) || /luôn\s*xác\s*nhận\s*giá/iu.test(context)) continue;
    const priceMatches = [...after.matchAll(moneyPattern)];
    const prices = [];
    if (priceMatches[0]) {
      const firstPrice = parseMoney(priceMatches[0][1], priceMatches[0][2]);
      if (firstPrice) prices.push(firstPrice);
      if (priceMatches[1]) {
        const separator = after.slice(
          priceMatches[0].index + priceMatches[0][0].length,
          priceMatches[1].index,
        );
        if (/^\s*(?:[-–—~]|đến|tới)\s*$/iu.test(separator)) {
          const secondPrice = parseMoney(priceMatches[1][1], priceMatches[1][2]);
          if (secondPrice) prices.push(secondPrice);
        }
      }
    }
    if (!prices.length) continue;
    const firstPriceMatch = priceMatches[0];
    const priceTail = after.slice(
      firstPriceMatch.index,
      firstPriceMatch.index + firstPriceMatch[0].length + 16,
    );
    if (!/(?:\/|mỗi\s*)(?:1\s*)?(?:giờ|h)\b/iu.test(priceTail)) continue;
    slots.push({
      dayGroup: inferDayGroup(before),
      startTime,
      endTime,
      priceMinVnd: Math.min(...prices),
      priceMaxVnd: Math.max(...prices),
      evidence: context.trim().slice(0, 700),
    });
  }
  return [...new Map(slots.map((slot) => [
    [slot.dayGroup, slot.startTime, slot.endTime, slot.priceMinVnd, slot.priceMaxVnd].join("|"), slot,
  ])).values()];
}

const firestoreString = (fields, key) => fields?.[key]?.stringValue ?? "";
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const hashUrl = (url) => createHash("sha256").update(url).digest("hex");

async function fetchWithCache(url) {
  const cachePath = path.join(pageDir, `${hashUrl(url)}.json`);
  if (!refresh) {
    try {
      return JSON.parse(await readFile(cachePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "SportSpacePublicPriceResearch/1.0 (+public-source-audit)" },
    });
    const record = {
      url,
      retrievedAt: new Date().toISOString(),
      statusCode: response.status,
      html: response.ok ? await response.text() : "",
    };
    await writeFile(cachePath, JSON.stringify(record), "utf8");
    return record;
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  await mkdir(pageDir, { recursive: true });
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const facilities = snapshot.documents.slice(0, limit).map((document) => ({
    facilityId: document.name.split("/").at(-1),
    facilityName: firestoreString(document.fields, "name"),
    address: firestoreString(document.fields, "address"),
    sport: firestoreString(document.fields, "sport"),
    sourceUrl: firestoreString(document.fields, "source_url"),
  }));

  const results = new Array(facilities.length);
  let cursor = 0;
  async function worker() {
    while (cursor < facilities.length) {
      const index = cursor++;
      const facility = facilities[index];
      if (!facility.sourceUrl) {
        results[index] = { ...facility, status: "missing_source_url", priceMinVnd: "", priceMaxVnd: "", evidence: "" };
        continue;
      }
      try {
        const page = await fetchWithCache(facility.sourceUrl);
        results[index] = page.statusCode === 200
          ? { ...facility, ...extractPriceEvidence(page.html), retrievedAt: page.retrievedAt, httpStatus: page.statusCode }
          : { ...facility, status: "fetch_failed", priceMinVnd: "", priceMaxVnd: "", evidence: "", retrievedAt: page.retrievedAt, httpStatus: page.statusCode };
      } catch (error) {
        results[index] = { ...facility, status: "fetch_failed", priceMinVnd: "", priceMaxVnd: "", evidence: error.message, retrievedAt: "", httpStatus: "" };
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  for (const row of results) {
    if (rejectedNonRentalIds.has(row.facilityId)) {
      row.status = "rejected_non_rental_price";
      row.priceMinVnd = "";
      row.priceMaxVnd = "";
      row.timeSlots = [];
      continue;
    }
    if (!curatedFacilityIds.has(row.facilityId)) continue;
    row.status = "superseded_by_curated";
    row.priceMinVnd = "";
    row.priceMaxVnd = "";
    row.timeSlots = [];
  }

  const headers = ["facility_id", "facility_name", "address", "sport", "status", "day_group", "start_time", "end_time", "price_min_vnd", "price_max_vnd", "unit_minutes", "precision", "source_url", "retrieved_at", "observed_at", "confidence", "evidence"];
  const rows = results.flatMap((row) => {
    const candidates = row.timeSlots?.length ? row.timeSlots : [{
      dayGroup: "", startTime: "", endTime: "", priceMinVnd: row.priceMinVnd,
      priceMaxVnd: row.priceMaxVnd, evidence: row.evidence,
    }];
    return candidates.map((candidate) => [
      row.facilityId, row.facilityName, row.address, row.sport, row.status,
      candidate.dayGroup, candidate.startTime, candidate.endTime,
      candidate.priceMinVnd, candidate.priceMaxVnd,
      row.timeSlots?.length ? 60 : "",
      row.timeSlots?.length ? "time_slots" : row.status === "price_found" ? "price_range_only" : "none",
      row.sourceUrl, row.retrievedAt ?? "", observedAt,
      row.timeSlots?.length ? "medium_pending_review" : row.status === "price_found" ? "low_pending_review" : "none",
      candidate.evidence,
    ].map(csvCell).join(","));
  });
  await writeFile(csvPath, `\uFEFF${headers.map(csvCell).join(",")}\n${rows.join("\n")}\n`, "utf8");

  const counts = Object.fromEntries(Object.entries(Object.groupBy(results, (row) => row.status)).map(([key, rowsForStatus]) => [key, rowsForStatus.length]));
  const report = {
    generatedAt: new Date().toISOString(), observedAt, totalFacilities: facilities.length,
    counts,
    facilitiesWithTimeSlots: results.filter((row) => row.timeSlots?.length).length,
    extractedTimeSlots: results.reduce((sum, row) => sum + (row.timeSlots?.length ?? 0), 0),
    output: path.relative(root, csvPath).replaceAll("\\", "/"),
    caveats: [
      "Automatic extraction produces review candidates, not checkout-ready prices.",
      "A public source may be stale, incomplete, or describe another service near a price cue.",
      "Detailed day/time rules require manual evidence review and remain in the curated CSV.",
    ],
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
