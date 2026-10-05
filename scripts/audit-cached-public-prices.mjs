import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const pagesDir = path.join(root, "data_export", "phone-crawl", "pages");
const snapshotPath = path.join(root, "data_export", "coordinates", "firestore-snapshot.json");
const contactsPath = path.join(root, "data_export", "phone-crawl", "contacts.json");
const outputPath = path.join(root, "docs", "data", "ung-vien-gia-tu-nguon-bo-sung.csv");

const decodeEntities = (value) => value
  .replace(/&nbsp;|&#160;/gi, " ").replace(/&ndash;|&mdash;/gi, "-")
  .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
const repairMojibake = (value) => /Ã|Ä|Æ|áº|á»/.test(value)
  ? Buffer.from(value, "latin1").toString("utf8")
  : value;
const stripHtml = (html) => repairMojibake(decodeEntities(html
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()));

const stopwords = new Set((
  "san pickleball bong da cau long tennis clb club review kham pha chi tiet chat luong tai va the thao gioi thieu nhan tao mini " +
  "tong hop danh sach uy tin dep xin xo quan huyen thanh pho tinh viet nam " +
  "ha noi ho chi minh sai gon da nang hai phong can tho hue nha trang " +
  "an giang bac ninh ca mau cao bang dak lak dien bien dong nai gia lai hung yen khanh hoa lai chau " +
  "lam dong lang son lao cai nghe an ninh binh phu tho quang ngai quang tri son la tay ninh thanh hoa " +
  "tuyen quang vinh long bac lieu binh duong binh dinh binh thuan dong thap nam dinh thai nguyen"
).split(" "));
const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (value) => new Set(normalize(value).split(" ").filter((token) => token.length > 1 && !stopwords.has(token)));
const similaritySets = (a, b) => {
  if (!a.size || !b.size) return 0;
  const common = [...a].filter((token) => b.has(token)).length;
  return common >= 2 ? common / Math.min(a.size, b.size) : 0;
};
const csvCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const facilities = snapshot.documents.map((doc) => ({
  id: doc.name.split("/").at(-1),
  name: repairMojibake(doc.fields?.name?.stringValue ?? ""),
  address: repairMojibake(doc.fields?.address?.stringValue ?? ""),
  sport: normalize(repairMojibake(doc.fields?.sport?.stringValue ?? "")),
  tokenSet: tokens(repairMojibake(doc.fields?.name?.stringValue ?? "")),
}));

const candidates = [];
const contacts = JSON.parse(await readFile(contactsPath, "utf8"));
for (const contact of contacts) {
  const title = repairMojibake(contact.title ?? "");
  const normalizedTitle = normalize(title);
  const titleTokens = tokens(title);
  let best = { score: 0 };
  for (const facility of facilities) {
    const titleSport = normalizedTitle.includes("pickleball") ? "pickleball"
      : normalizedTitle.includes("cau long") ? "cau long"
        : normalizedTitle.includes("bong da") ? "bong da" : "";
    if (titleSport && facility.sport && !facility.sport.includes(titleSport)) continue;
    const score = similaritySets(titleTokens, facility.tokenSet);
    if (score > best.score) best = { score, facility };
  }
  if (best.score < 0.72) continue;
  const file = `${createHash("sha256").update(contact.url).digest("hex")}.json`;
  let page;
  try { page = JSON.parse(await readFile(path.join(pagesDir, file), "utf8")); } catch { continue; }
  const text = stripHtml(page.html ?? "");
  const cue = /(giá\s*(?:thuê|sân|đặt)|mức\s*giá|chi\s*phí\s*thuê)/giu;
  for (const match of text.matchAll(cue)) {
    const evidence = text.slice(match.index, match.index + 420);
    if (/liên hệ/iu.test(evidence) && !/\d{2,3}(?:[.,]\d{3}|k)\s*(?:đ|vnđ|vnd|k|\/)/iu.test(evidence)) continue;
    if (!/\d{2,3}(?:[.,]\d{3}|k)\s*(?:đ|vnđ|vnd|k|\/)/iu.test(evidence)) continue;
    candidates.push({
      facilityId: best.facility.id,
      facilityName: best.facility.name,
      matchScore: best.score.toFixed(3), title, sourceUrl: page.url,
      retrievedAt: page.retrievedAt, evidence: evidence.slice(0, 800),
      reviewStatus: "matched_pending_price_review",
    });
    break;
  }
}

const unique = [...new Map(candidates.map((row) => [`${row.sourceUrl}|${row.facilityId}`, row])).values()];
const headers = ["facility_id", "facility_name", "match_score", "source_title", "source_url", "retrieved_at", "review_status", "evidence"];
const rows = unique.map((row) => [row.facilityId, row.facilityName, row.matchScore, row.title, row.sourceUrl, row.retrievedAt, row.reviewStatus, row.evidence].map(csvCell).join(","));
await writeFile(outputPath, `\uFEFF${headers.map(csvCell).join(",")}\n${rows.join("\n")}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ candidates: unique.length, matched: unique.filter((row) => row.facilityId).length, output: path.relative(root, outputPath) }, null, 2)}\n`);
