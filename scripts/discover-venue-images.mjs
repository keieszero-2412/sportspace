import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";

const root = path.resolve(import.meta.dirname, "..");
const venuesPath = path.join(root, "src", "data", "venues.json");
const targetsPath = path.join(root, "docs", "data", "venue-image-targets.json");
const outputPath = path.join(root, "docs", "data", "venue-image-candidates.json");
const limit = Math.max(1, Number(process.argv[2] || 25));
const concurrency = Math.min(5, Math.max(1, Number(process.argv[3] || 3)));
const broadMode = process.argv.includes("--broad");
const searchOnlyMode = process.argv.includes("--search-only");
const genericImage = /upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/(?:4\/42\/Football_in_Bloomington|f\/fd\/Olympics_2012_Mixed|b\/b6\/Pickle_Pro_Tour|5\/58\/Mondial_Ping|2\/26\/USA_vs\._China|b\/b0\/Brasil_vence|c\/c4\/Universityofbath)/i;
const ignoredTokens = new Set(["san", "bong", "da", "pickleball", "club", "the", "sport", "sports", "court", "trung", "tam", "ha", "noi", "ho", "chi", "minh"]);
const trustedSourceDomains = [
  "pickleballplus.vn", "shopvnb.com", "sportnet.vn", "thegioithethao.vn",
  "m7sport.vn", "voltano.vn", "toididau.net", "sanbong.vn",
];
const searchablePlaceDomains = [
  "facebook.com", "instagram.com", "google.com", "googleusercontent.com",
  "maps.app.goo.gl", "youtube.com", "tiktok.com",
];

const normalize = (value) => String(value || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const tokens = (value) => [...new Set(normalize(value).split(" ").filter((token) => token.length > 2 && !ignoredTokens.has(token)))];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 (compatible; SportSpaceImageAudit/1.0)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function searchImages(venue) {
  const query = `\"${venue.name}\" \"${venue.address}\"`;
  const html = await fetchText(`https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=HDRSC2`);
  const $ = cheerio.load(html);
  return $("a.iusc").toArray().flatMap((element) => {
    try {
      const metadata = JSON.parse($(element).attr("m") || "{}");
      if (!/^https?:\/\//.test(metadata.murl || "") || !/^https?:\/\//.test(metadata.purl || "")) return [];
      return [{ imageUrl: metadata.murl, sourceUrl: metadata.purl, searchTitle: metadata.t || "" }];
    } catch { return []; }
  }).slice(0, 12);
}

async function verifyCandidate(venue, candidate) {
  try {
    const host = new URL(candidate.sourceUrl).hostname.replace(/^www\./, "");
    const nameTokens = tokens(venue.name);
    const searchTitle = normalize(candidate.searchTitle);
    const searchTitleNameRatio = nameTokens.length
      ? nameTokens.filter((token) => searchTitle.includes(token)).length / nameTokens.length
      : 0;
    if (searchOnlyMode) {
      const allowed = searchablePlaceDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
      if (!allowed || searchTitleNameRatio < 0.8) return null;
      return {
        ...candidate,
        status: "search_title_matches_exact_name_address_query",
        matchedNameTokens: nameTokens.filter((token) => searchTitle.includes(token)),
        matchedAddressTokens: [],
        checkedAt: new Date().toISOString(),
        note: "Lower-confidence candidate from an exact name/address search; source page address was not machine-verifiable and requires visual review.",
      };
    }
    if (!broadMode && !trustedSourceDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return null;
    const html = await fetchText(candidate.sourceUrl);
    const $ = cheerio.load(html);
    $("script,style,noscript").remove();
    const title = normalize(`${$("title").text()} ${$("meta[property='og:title']").attr("content") || ""} ${candidate.searchTitle}`);
    const page = normalize(`${title} ${$("body").text().slice(0, 200000)}`);
    const addressTokens = tokens(venue.address);
    const matchedName = nameTokens.filter((token) => page.includes(token));
    const matchedAddress = addressTokens.filter((token) => page.includes(token));
    const nameRatio = nameTokens.length ? matchedName.length / nameTokens.length : 0;
    const addressEvidence = matchedAddress.length >= Math.min(2, addressTokens.length);
    const titleNameRatio = nameTokens.length
      ? nameTokens.filter((token) => title.includes(token)).length / nameTokens.length
      : 0;
    if (nameRatio < (broadMode ? 0.8 : 0.6) || !addressEvidence) return null;
    if (broadMode && titleNameRatio < 0.6) return null;
    return {
      ...candidate,
      status: "source_matches_name_and_address",
      matchedNameTokens: matchedName,
      matchedAddressTokens: matchedAddress,
      checkedAt: new Date().toISOString(),
      note: "Candidate only; copyright or owner permission is not verified.",
    };
  } catch { return null; }
}

let venues = JSON.parse(await fs.readFile(venuesPath, "utf8"));
try {
  const targetData = JSON.parse(await fs.readFile(targetsPath, "utf8"));
  if (Array.isArray(targetData.targets)) venues = targetData.targets;
} catch {}
let previous = { generatedAt: null, candidates: [] };
try { previous = JSON.parse(await fs.readFile(outputPath, "utf8")); } catch {}
const retryMissing = broadMode || searchOnlyMode;
const completed = new Set(previous.candidates
  .filter((item) => !retryMissing || item.candidates.some((candidate) => candidate.imageUrl))
  .map((item) => item.id));
const queue = venues.filter((venue) => !completed.has(venue.id || venue.facility_id)).slice(0, limit);
const discovered = [];

async function discover(venue) {
  let accepted = [];
  try {
    const candidates = await searchImages(venue);
    const seen = new Set();
    for (const candidate of candidates) {
      const verified = await verifyCandidate(venue, candidate);
      const key = verified && `${verified.imageUrl}|${verified.sourceUrl}`;
      if (verified && !seen.has(key)) {
        seen.add(key);
        accepted.push(verified);
      }
      if (accepted.length >= 3) break;
    }
  } catch (error) {
    accepted = [{ status: "search_failed", error: error.message, checkedAt: new Date().toISOString() }];
  }
  return {
    id: venue.id || venue.facility_id,
    name: venue.name,
    address: venue.address,
    candidates: accepted,
  };
}

let nextIndex = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (nextIndex < queue.length) {
    const venue = queue[nextIndex++];
    discovered.push(await discover(venue));
    await wait(350);
  }
}));

const result = {
  generatedAt: new Date().toISOString(),
  methodology: "Exact-name image search; source page must match venue name and address. Image rights remain unverified.",
  candidates: [
    ...previous.candidates.filter((item) => !discovered.some((next) => next.id === item.id)),
    ...discovered,
  ],
};
await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ processed: queue.length, withCandidate: discovered.filter((item) => item.candidates.some((candidate) => candidate.imageUrl)).length, outputPath }, null, 2));
