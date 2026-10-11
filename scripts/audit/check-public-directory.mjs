// Read-only browser verification against the configured public Firebase project.
// No sign-in, Admin SDK, seed data, writes, or service-account credentials.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer from "puppeteer-core";
import { Launcher } from "chrome-launcher";
import { createServer } from "vite";

process.env.VITE_USE_EMULATORS = "false";
const server = await createServer({
  server: { host: "127.0.0.1", port: 3002, strictPort: true, open: false },
});
let browser;
try {
  await server.listen();
  browser = await puppeteer.launch({
    executablePath: Launcher.getInstallations()[0],
    headless: true,
    args: ["--disable-gpu"],
  });
  const page = await browser.newPage();
  const errors = [];
  let functionCalls = 0;
  let blockFirestore = false;
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    if (request.url().includes("cloudfunctions.net")) {
      functionCalls++;
      return request.abort();
    }
    if (request.url().includes("firestore.googleapis.com") && blockFirestore)
      return request.abort();
    // Images are unrelated to the data regression and need no external downloads.
    if (request.resourceType() === "image") return request.abort();
    return request.continue();
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:3002", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".venue-card").length === 24,
    { timeout: 60000 });
  console.log("PASS: 24 public venues render with Cloud Functions blocked.");
  assert.equal(await page.$$eval(".venue-card .google-rating", (links) => links.length), 24);
  assert.ok(await page.$$eval(".venue-card .google-rating", (links) => links.every((link) => {
    const url = new URL(link.href);
    return url.hostname === "www.google.com" && url.pathname === "/maps/search/" &&
      url.searchParams.get("api") === "1" && !!url.searchParams.get("query") &&
      !link.textContent.includes("undefined") &&
      (link.dataset.ratingAvailable !== "false" || !link.textContent.includes("(0)"));
  })));
  const mapsLink = await page.$eval(".venue-card .google-rating", (link) => link.href);
  await page.click(".venue-card h3");
  await page.waitForSelector(".modal-content .google-rating");
  assert.equal(await page.$eval(".modal-content .google-rating", (link) => link.href), mapsLink);
  assert.ok(await page.$eval(".modal-content .google-rating", (link) =>
    !link.textContent.includes("undefined") && !link.textContent.includes("null")));
  await page.click(".modal-content button");
  await page.waitForFunction(() => !document.querySelector(".modal-content .google-rating"));
  console.log("PASS: Google Maps rating links render on cards and venue details without fabricated zero ratings.");
  await page.waitForFunction(async () => {
    const { cachedApi } = await import("/src/services/api.js");
    return cachedApi("catalogue")?.totalVenues > 0;
  }, { timeout: 60000 });
  const summary = await page.evaluate(async () => {
    const { cachedApi } = await import("/src/services/api.js");
    const value = cachedApi("catalogue");
    return { venues: value.totalVenues, courts: value.totalCourts, provinces: value.provinces.length };
  });
  console.log("PASS: live public catalogue", JSON.stringify(summary));
  await page.evaluate(() => [...document.querySelectorAll("button")]
    .find((button) => button.textContent.trim() === "Xem thêm").click());
  await page.waitForFunction(() => document.querySelectorAll(".venue-card").length === 48);
  console.log("PASS: load more renders 48 venues.");

  const checks = await page.evaluate(async () => {
    const { api } = await import("/src/services/api.js");
    const key = Object.keys(localStorage).find((key) => key.startsWith("sportspace:public-catalogue:"));
    const entries = JSON.parse(localStorage.getItem(key));
    const pages = entries.filter(([key]) => JSON.parse(key)[0] === "listVenues");
    const ids = pages.flatMap(([, item]) => item.value.items.map((venue) => venue.id));
    const sample = pages[0][1].value.items[0];
    const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
    const filtered = await api("listVenues", {
      province: sample.province, sport: sample.sport, search: normalize(sample.name),
    });
    const provinceMatches = filtered.items.length > 0 && filtered.items.every(
      (venue) => venue.province === sample.province && venue.sport === sample.sport,
    );
    const searchMatches = filtered.items.some((venue) => venue.id === sample.id);
    const sportPage = await api("listVenues", { sport: sample.sport });
    const sportMatches = sportPage.items.length > 0 && sportPage.items.every(
      (venue) => venue.sport === sample.sport,
    );
    const privateFields = ["bank", "bankAccount", "bankOwner", "bankName", "ownerId", "documentPaths"];
    return {
      uniquePages: new Set(ids).size === ids.length,
      provinceMatches, searchMatches, sportMatches,
      publicOnly: pages.every(([, item]) => item.value.items.every(
        (venue) => privateFields.every((key) => !(key in venue)),
      )),
    };
  });
  for (const [name, passed] of Object.entries(checks)) assert.equal(passed, true, name);
  assert.equal(functionCalls, 0, "Public browsing must not call the undeployed backend");
  console.log("PASS: pagination IDs, province/sport filters, accent-insensitive search, public cache fields.");

  blockFirestore = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".venue-card").length === 24);
  await page.waitForFunction(() => !document.querySelector('[role="alert"]'));
  console.log("PASS: reload renders the cached directory while Firestore is blocked.");
  const availability = await page.evaluate(async () => {
    const { api } = await import("/src/services/api.js");
    try {
      await api("listVenues", { availableDate: "2099-01-01", availableTime: "18:00" });
      return "incorrectly-returned-unverified-availability";
    } catch (error) { return error.code; }
  });
  assert.match(availability, /^functions\//);
  assert.ok(functionCalls > 0);
  console.log("PASS: availability requires the server and fails instead of using cached venues.");
  await page.setViewport({ width: 320, height: 800 });
  await page.evaluate(() => {
    localStorage.setItem("sportspace_lang", "en");
    localStorage.setItem("sportspace_theme", "dark");
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll(".venue-card").length === 24);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  assert.ok(await page.evaluate(() => document.body.innerText.includes("All Locations Venues Directory")));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.deepEqual(errors, []);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/public-directory-mobile.png", fullPage: true });
  await (await page.$(".venue-card")).screenshot({ path: "test-results/google-rating-card.png" });
  console.log("PASS: 320px mobile, English, dark theme, no React errors.");
} finally {
  await browser?.close();
  await server.close();
}
