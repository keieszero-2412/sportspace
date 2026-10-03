import puppeteer from "puppeteer-core";
import { Launcher } from "chrome-launcher";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { localDate } from "../functions/domain.js";
import assert from "node:assert/strict";
if (
  !process.env.FIRESTORE_EMULATOR_HOST ||
  !process.env.FIREBASE_AUTH_EMULATOR_HOST
)
  throw new Error("Emulators required");
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app"),
  { getAuth } = require("firebase-admin/auth"),
  { getFirestore } = require("firebase-admin/firestore");
const fixtureApp = initializeApp({ projectId: "demo-sportspace" }, "browser"),
  fixtureDb = getFirestore(fixtureApp),
  fixtureAuth = getAuth(fixtureApp);
const loginPassword = "EmulatorTestOnly123!";
for (const [uid, name] of [
  ["browser-player", "Browser Player"],
  ["owner", "Owner"],
]) {
  try {
    await fixtureAuth.createUser({
      uid,
      email: uid + "@example.test",
      password: loginPassword,
      displayName: name,
    });
  } catch (e) {
    if (
      e.code !== "auth/uid-already-exists" &&
      e.code !== "auth/email-already-exists"
    )
      throw e;
  }
  await fixtureDb.doc("Users/" + uid).set(
    {
      name,
      role: uid === "owner" ? "merchant" : "user",
      phone: "0900000000",
      credibilityScore: 98,
      createdAt: Date.now(),
    },
    { merge: true },
  );
}
await fetch(
  "http://127.0.0.1:5001/demo-sportspace/asia-southeast1/sportspace",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: { action: "catalogue" } }),
  },
);
const vite = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "3001",
    "--strictPort",
  ],
  {
    env: { ...process.env, VITE_USE_EMULATORS: "true" },
    stdio: "ignore",
    windowsHide: true,
  },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch("http://127.0.0.1:3001");
      if (r.ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const executablePath = Launcher.getInstallations()[0];
  if (!executablePath) throw new Error("Chrome missing");
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--disable-gpu"],
  });
  const page = await browser.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.stack || e.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:3001", { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector(".venue-card", { timeout: 60000 });
  } catch (e) {
    await mkdir("test-results", { recursive: true });
    await page.screenshot({ path: "test-results/failure.png", fullPage: true });
    console.log("React errors:", errors);
    console.log(
      "Page text:",
      await page.evaluate(() => document.body.innerText.slice(-2000)),
    );
    throw e;
  }
  assert.equal(errors.length, 0, errors.join("\n"));
  await mkdir("test-results", { recursive: true });
  const exported = {};
  for (const col of ["Facilities", "Courts", "Bookings", "Matches", "Users"])
    exported[col] = (await fixtureDb.collection(col).get()).docs.map((s) => ({
      id: s.id,
      data: s.data(),
    }));
  await writeFile("test-results/snapshot.json", JSON.stringify(exported));
  await mkdir("test-results", { recursive: true });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.setViewport({ width: 320, height: 800 });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(overflow, false, "Mobile horizontal overflow");
  await page.setViewport({ width: 1440, height: 1000 });
  const buttons = await page.$$("button");
  for (const b of buttons) {
    const value = await b.evaluate((e) => e.textContent.trim());
    if (value === "Đăng nhập" || value === "Đăng nhập / Đăng ký") {
      await b.click();
      break;
    }
  }
  await page.waitForSelector("input[name=email]", { timeout: 10000 });
  async function clickText(text, selector = "button") {
    const buttons = await page.$$(selector);
    for (const button of buttons) {
      if (
        (await button.evaluate((e) => e.textContent.trim())) === text &&
        (await button.boundingBox())
      ) {
        await button.click();
        return;
      }
    }
    throw new Error("Missing visible action: " + text);
  }
  async function login(uid) {
    await page.type("input[name=email]", uid + "@example.test");
    await page.type("input[name=password]", loginPassword);
    await page.click("form button[type=submit]");
    await page.waitForFunction(
      () => !document.querySelector("input[name=email]"),
    );
    await page.waitForFunction(
      (name) => document.querySelector("header")?.innerText.includes(name),
      {},
      uid === "owner" ? "Owner" : "Browser Player",
    );
  }
  async function logout() {
    await page.evaluate(async () => {
      const f = await import("/src/firebase.js");
      await f.signOut(f.auth);
    });
    await page.waitForFunction(() =>
      document.querySelector("header")?.innerText.includes("Đăng nhập"),
    );
    await clickText("Đăng nhập");
    await page.waitForSelector("input[name=email]");
  }
  await login("browser-player");
  await clickText("Đặt sân ngay", ".venue-card button");
  await page.waitForSelector(".court-timetable");
  const bookingDate = localDate(new Date(Date.now() + 3 * 86400000));
  await page.evaluate((date) => {
    const input = document.querySelector(".modal-content input[type=date]");
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(input, date);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, bookingDate);
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".court-timetable button")).some(
      (b) => b.textContent === "Trống" && !b.disabled,
    ),
  );
  await clickText("Trống", ".court-timetable button");
  await clickText("Tiếp tục");
  await clickText("Giữ sân và chuyển khoản");
  await page.waitForSelector(".modal-content input[type=file]");
  const bookingId = await page.evaluate(
    () =>
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("sportspace_booking:"))
        .map((k) => sessionStorage[k])[0],
  );
  assert.ok(bookingId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(".venue-card");
  await page.waitForFunction(() =>
    document.querySelector("header")?.innerText.includes("Browser Player"),
  );
  await clickText("Đặt sân ngay", ".venue-card button");
  await page.waitForSelector(".modal-content input[type=file]");
  assert.ok(
    (await page.$eval(".modal-content", (e) => e.innerText)).includes(
      "Chờ chuyển khoản",
    ),
  );
  await writeFile(
    "test-results/receipt.png",
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6V0AAAAASUVORK5CYII=",
      "base64",
    ),
  );
  await (
    await page.$(".modal-content input[type=file]")
  ).uploadFile("test-results/receipt.png");
  await clickText("Gửi để chủ sân xác minh");
  await page.waitForFunction(() =>
    document
      .querySelector(".modal-content")
      ?.innerText.includes("Chờ xác minh biên lai"),
  );
  await page.click('.modal-content button[aria-label="Đóng"]');
  await logout();
  await login("owner");
  await clickText("Quản lý sân", "header button");
  await page.waitForSelector("#merchant-section");
  await clickText("Đơn và hoàn tiền");
  await page.waitForFunction(() =>
    document
      .querySelector("#merchant-section")
      ?.innerText.includes("Xác minh và duyệt"),
  );
  await clickText("Xác minh và duyệt");
  const fields = await page.$$(".modal-content input");
  await fields[0].type("BROWSER-EMULATOR-PAY");
  await page
    .click(
      ".modal-content button[type=submit], .modal-content form button:not([type])",
    )
    .catch(() => clickText("Xác nhận", ".modal-content button"));
  await page.waitForFunction(() => !document.querySelector(".modal-overlay"));
  assert.equal(
    (await fixtureDb.doc("Bookings/" + bookingId).get()).data().status,
    "confirmed",
  );
  await logout();
  await login("browser-player");
  const profile = await page.$$("header button");
  for (const button of profile)
    if (
      (await button.evaluate((e) => e.textContent)).includes("Browser Player")
    ) {
      await button.click();
      break;
    }
  await page.waitForFunction(() =>
    document.querySelector(".modal-content")?.innerText.includes("Đã xác nhận"),
  );
  await clickText("Hủy đặt sân", ".modal-content button");
  await clickText("Hủy sân và yêu cầu hoàn");
  await page.waitForFunction(() =>
    document
      .querySelector(".modal-content")
      ?.innerText.includes("Chờ hoàn tiền"),
  );
  await page.click('.modal-content button[aria-label="Đóng hồ sơ"]');
  await logout();
  await login("owner");
  await clickText("Quản lý sân", "header button");
  await page.waitForSelector("#merchant-section");
  await clickText("Đơn và hoàn tiền");
  await page.waitForFunction(() =>
    document
      .querySelector("#merchant-section")
      ?.innerText.includes("Xác nhận đã hoàn khoản chuyển"),
  );
  await clickText("Xác nhận đã hoàn khoản chuyển");
  await page.type(".modal-content input", "BROWSER-EMULATOR-REFUND");
  await clickText("Xác nhận", ".modal-content button");
  await page.waitForFunction(() => !document.querySelector(".modal-overlay"));
  assert.equal(
    (await fixtureDb.doc("Bookings/" + bookingId).get()).data().refundStatus,
    "refunded",
  );
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: "test-results/merchant.png", fullPage: true });
  await page.setViewport({ width: 320, height: 800 });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
    "Merchant mobile overflow",
  );
  await page.setViewport({ width: 1440, height: 1000 });
  await page.click('header button[title="Chuyển sang Tiếng Anh"]');
  await page.click('header button[title*="Chế độ Tối"]');
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/english-dark.png",
    fullPage: true,
  });
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Browser passed: catalogue, login, hold, refresh recovery, receipt, approval, cancellation/refund, mobile, EN/dark; no React errors.",
  );
} finally {
  if (browser) await browser.close();
  vite.kill();
  await deleteApp(fixtureApp);
}
