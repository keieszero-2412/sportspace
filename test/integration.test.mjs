import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getBytes } from "firebase/storage";
import { createService } from "../functions/service.js";
import { localDate, dateTime } from "../functions/domain.js";
import {
  maintainBookings,
  finishAccountDeletion,
} from "../functions/maintenance.js";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const projectId = "demo-sportspace";
const testDate = localDate(new Date(Date.now() + 2 * 86400000));
let env,
  app,
  db,
  service,
  t = dateTime(testDate, 0) - 2 * 86400000 + 12 * 3600000;
before(async () => {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    "Tests require Firestore Emulator; production access is forbidden.",
  );
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(
        new URL("../firestore.rules", import.meta.url),
        "utf8",
      ),
    },
    storage: {
      rules: await readFile(
        new URL("../storage.rules", import.meta.url),
        "utf8",
      ),
    },
  });
  app = initializeApp({ projectId }, "integration");
  db = getFirestore(app);
  service = createService(db, {
    now: () => t,
    bucket: {
      file: () => ({
        getMetadata: async () => [{ contentType: "image/png", size: "100" }],
      }),
    },
  });
  await env.clearFirestore();
  await env.clearStorage();
  const batch = db.batch();
  batch.set(db.doc("Users/owner"), { role: "merchant", name: "Owner" });
  batch.set(db.doc("Users/other-owner"), { role: "merchant" });
  batch.set(db.doc("Facilities/facility"), {
    name: "Emulator test facility",
    ownerId: "owner",
    operating_hours: "06:00-22:00",
    province: "Test",
    sport: "Tennis",
  });
  batch.set(db.doc("Courts/court"), {
    name: "Test court",
    facilityId: "facility",
    facility_id: "facility",
    status: "active",
    basePrice: 100000,
  });
  batch.set(db.doc("PaymentConfig/facility"), {
    bin: "970000",
    account: "00000000",
    name: "EMULATOR ONLY",
    verifiedAt: 1,
  });
  await batch.commit();
});
after(async () => {
  await env?.cleanup();
  if (app) await deleteApp(app);
});
const actor = (uid) => ({ uid, email: uid + "@example.test" });
const hold = (uid, key, time = "18:00") =>
  service(actor(uid), {
    action: "holdBooking",
    key,
    facilityId: "facility",
    courtId: "court",
    date: testDate,
    times: [time],
    duration: 60,
    customerName: uid,
    phone: "0900000000",
  });
test("two concurrent bookings cannot reserve overlapping intervals", async () => {
  const results = await Promise.allSettled([
    hold("a", "race-a"),
    hold("b", "race-b", "18:30"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const winner = results.find((r) => r.status === "fulfilled").value;
  assert.equal(winner.depositPaid, 0);
  assert.equal(winner.paymentStatus, "unpaid");
  assert.equal(
    (await hold(winner.userId, winner.key, winner.time)).id,
    winner.id,
  );
  await service(actor(winner.userId), {
    action: "bookingTransition",
    bookingId: winner.id,
    operation: "cancel",
  });
});
test("only the owner may verify a receipt; expiry and duplicate references are rejected", async () => {
  const b = await hold("a", "payment", "08:00");
  await assert.rejects(
    service(actor("a"), {
      action: "bookingTransition",
      bookingId: b.id,
      operation: "approve",
      reference: "REF",
      amount: b.totalAmount,
    }),
  );
  await service(actor("a"), {
    action: "submitReceipt",
    bookingId: b.id,
    path: "receipts/a/" + b.id + "/file",
  });
  await assert.rejects(
    service(actor("other-owner"), {
      action: "bookingTransition",
      bookingId: b.id,
      operation: "approve",
      reference: "REF",
      amount: b.totalAmount,
    }),
  );
  const approved = await service(actor("owner"), {
    action: "bookingTransition",
    bookingId: b.id,
    operation: "approve",
    reference: "REF",
    amount: b.totalAmount,
  });
  assert.equal(approved.status, "confirmed");
  assert.equal(approved.depositPaid, b.totalAmount);
  const b2 = await hold("b", "payment-2", "09:00");
  await service(actor("b"), {
    action: "submitReceipt",
    bookingId: b2.id,
    path: "receipts/b/" + b2.id + "/file",
  });
  await assert.rejects(
    service(actor("owner"), {
      action: "bookingTransition",
      bookingId: b2.id,
      operation: "approve",
      reference: "REF",
      amount: b2.totalAmount,
    }),
  );
  t += 11 * 60000;
  await assert.rejects(
    service(actor("owner"), {
      action: "bookingTransition",
      bookingId: b2.id,
      operation: "approve",
      reference: "NEW",
      amount: b2.totalAmount,
    }),
  );
});
test("cancellation and refund are separate, repeat refund is idempotent", async () => {
  const bookings = await db
    .collection("Bookings")
    .where("paymentStatus", "==", "paid")
    .get();
  const b = bookings.docs[0];
  assert.ok(b);
  const cancelled = await service(actor("a"), {
    action: "bookingTransition",
    bookingId: b.id,
    operation: "cancel",
  });
  assert.equal(cancelled.refundStatus, "requested");
  const data = {
    action: "bookingTransition",
    bookingId: b.id,
    operation: "refund",
    reference: "REFUND-1",
    amount: cancelled.refundAmount,
  };
  await service(actor("owner"), data);
  await service(actor("owner"), data);
  assert.equal(
    (await b.ref.get()).data().refundedAmount,
    cancelled.refundAmount,
  );
});
test("membership transactions enforce the last place and repeated joins", async () => {
  const m = await service(actor("a"), {
    action: "createMatch",
    key: "m",
    title: "Emulator match",
    venueName: "Test",
    sport: "Tennis",
    date: testDate,
    startTime: "12:00",
    endTime: "13:00",
    playersMax: 2,
    costPerPerson: 0,
  });
  const change = (uid) =>
    service(actor(uid), {
      action: "matchTransition",
      matchId: m.id,
      operation: "join",
    });
  const result = await Promise.allSettled([change("b"), change("c")]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  const s = (await db.doc("Matches/" + m.id).get()).data(),
    guest = s.joinedUsers.find((u) => u !== "a");
  await change(guest);
  assert.equal((await db.doc("Matches/" + m.id).get()).data().playersJoined, 2);
  await assert.rejects(
    service(actor("b"), {
      action: "matchTransition",
      matchId: m.id,
      operation: "cancel",
    }),
  );
});
test("Rules deny privilege, payment and other-owner reads; public availability has no customer data", async () => {
  const customer = env.authenticatedContext("a").firestore(),
    other = env.authenticatedContext("other-owner").firestore();
  await assertFails(setDoc(doc(customer, "Users/a"), { role: "merchant" }));
  await assertFails(
    setDoc(doc(customer, "Bookings/forged"), {
      userId: "a",
      status: "confirmed",
      depositPaid: 1,
    }),
  );
  const b = await hold("a", "rules", "14:00");
  await assertFails(getDoc(doc(other, "Bookings/" + b.id)));
  await assertSucceeds(getDoc(doc(customer, "Bookings/" + b.id)));
  await assertSucceeds(
    getDocs(
      query(collection(customer, "Bookings"), where("userId", "==", "a")),
    ),
  );
  await assertFails(getDocs(collection(other, "Bookings")));
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(anon, "Availability/" + b.lockIds[0])));
  await assertFails(getDoc(doc(anon, "SlotLocks/" + b.lockIds[0])));
  await assertFails(getDoc(doc(anon, "PaymentConfig/facility")));
});
test("Storage accepts private receipts only for the payer and limits type/size/overwrite", async () => {
  t = Date.now();
  const b = await hold("a", "receipt-storage-" + Date.now(), "15:00");
  const payer = env.authenticatedContext("a").storage(),
    stranger = env.authenticatedContext("b").storage();
  const path = "receipts/a/" + b.id + "/proof";
  await assertSucceeds(
    uploadBytes(storageRef(payer, path), new Uint8Array([1, 2]), {
      contentType: "image/png",
    }),
  );
  await assertSucceeds(getBytes(storageRef(payer, path)));
  await assertFails(
    uploadBytes(storageRef(payer, path), new Uint8Array([3]), {
      contentType: "image/png",
    }),
  );
  await assertFails(getBytes(storageRef(stranger, path)));
  await assertFails(
    uploadBytes(
      storageRef(payer, "receipts/a/" + b.id + "/bad"),
      new Uint8Array([1]),
      { contentType: "text/plain" },
    ),
  );
  const ownerStorage = env.authenticatedContext("owner").storage();
  await assertSucceeds(getBytes(storageRef(ownerStorage, path)));
});

test("court CRUD is scoped, repeat create is stable and maintenance prevents overlap", async () => {
  const data = {
    action: "saveCourt",
    facilityId: "facility",
    key: "court-create",
    name: "Court 2",
    type: "Hard",
    basePrice: 150000,
    status: "active",
  };
  const c = await service(actor("owner"), data);
  assert.equal((await service(actor("owner"), data)).id, c.id);
  await assert.rejects(
    service(actor("other-owner"), { ...data, courtId: c.id }),
  );
  await service(actor("owner"), {
    action: "blockSlot",
    facilityId: "facility",
    courtId: c.id,
    date: testDate,
    time: "10:30",
  });
  const request = {
    action: "holdBooking",
    facilityId: "facility",
    courtId: c.id,
    date: testDate,
    times: ["10:00"],
    duration: 60,
    key: "maintenance-block",
    customerName: "Test",
    phone: "0900000000",
  };
  await assert.rejects(service(actor("a"), request));
  await service(actor("owner"), {
    action: "blockSlot",
    facilityId: "facility",
    courtId: c.id,
    date: testDate,
    time: "10:30",
  });
  const b = await service(actor("a"), request);
  await assert.rejects(
    service(actor("owner"), {
      action: "archiveCourt",
      facilityId: "facility",
      courtId: c.id,
    }),
  );
  await service(actor("a"), {
    action: "bookingTransition",
    bookingId: b.id,
    operation: "cancel",
  });
  await service(actor("owner"), {
    action: "archiveCourt",
    facilityId: "facility",
    courtId: c.id,
  });
  assert.equal(
    (await db.doc("Courts/" + c.id).get()).data().status,
    "archived",
  );
});

test("expired transfer enters refund reconciliation without taking a replacement slot", async () => {
  const old = await hold("a", "late-old", "11:00");
  t += 11 * 60000;
  const replacement = await hold("b", "late-replacement", "11:00");
  await maintainBookings(db, t);
  const recorded = await service(actor("owner"), {
    action: "bookingTransition",
    bookingId: old.id,
    operation: "recordLatePayment",
    reference: "LATE-PAYMENT",
    amount: old.totalAmount,
  });
  assert.equal(recorded.status, "expired");
  assert.equal(recorded.refundStatus, "requested");
  assert.equal(
    (await db.doc("SlotLocks/" + replacement.lockIds[0]).get()).data()
      .bookingId,
    replacement.id,
  );
  await assert.rejects(
    service(actor("owner"), {
      action: "bookingTransition",
      bookingId: old.id,
      operation: "refund",
      reference: "LATE-PAYMENT",
      amount: old.totalAmount,
    }),
  );
  await service(actor("owner"), {
    action: "bookingTransition",
    bookingId: old.id,
    operation: "refund",
    reference: "LATE-REFUND",
    amount: old.totalAmount,
  });
  const ledger = await db
    .collection("Ledger")
    .where("bookingId", "==", old.id)
    .get();
  assert.equal(
    ledger.docs.reduce((n, s) => n + s.data().delta, 0),
    0,
  );
});

test("verified attendance, reviews and scheduled reminders apply only once", async () => {
  await db
    .doc("Users/a")
    .set({ role: "user", name: "Player", credibilityScore: 96 });
  const b = await hold("a", "attendance", "20:00");
  await service(actor("a"), {
    action: "submitReceipt",
    bookingId: b.id,
    path: `receipts/a/${b.id}/file`,
  });
  await service(actor("owner"), {
    action: "bookingTransition",
    bookingId: b.id,
    operation: "approve",
    reference: "ATTEND-PAY",
    amount: b.totalAmount,
  });
  t = b.startAt - 30 * 60000;
  await maintainBookings(db, t);
  await maintainBookings(db, t);
  const notices = await db
    .collection("Notifications")
    .where("userId", "==", "a")
    .where("type", "==", "reminder")
    .get();
  assert.equal(notices.size, 1);
  t = b.startAt + 60000;
  await service(actor("a"), { action: "confirmAttendance", bookingId: b.id });
  t = b.endAt + 60000;
  await service(actor("owner"), {
    action: "bookingTransition",
    bookingId: b.id,
    operation: "complete",
  });
  await service(actor("owner"), {
    action: "bookingTransition",
    bookingId: b.id,
    operation: "complete",
  });
  assert.equal((await db.doc("Users/a").get()).data().credibilityScore, 98);
  const review = {
    action: "saveReview",
    bookingId: b.id,
    rating: 5,
    comment: "Verified test review",
  };
  await assert.rejects(service(actor("b"), review));
  await service(actor("a"), review);
  await service(actor("a"), { ...review, rating: 4 });
  assert.equal(
    (await db.collection("Reviews").where("bookingId", "==", b.id).get()).size,
    1,
  );
  await service(actor("owner"), {
    action: "replyReview",
    reviewId: b.id,
    response: "Thank you",
  });
  const stats = await service(actor("owner"), {
    action: "merchantStats",
    facilityId: "facility",
  });
  assert.ok(stats.occupancy > 0);
  assert.ok(Number.isInteger(stats.revenueWeek));
});

test("account deletion retries safely, blocks mutations and removes personal data", async () => {
  const uid = "deleting";
  await db.doc("Users/" + uid).set({ name: "Private person", role: "user" });
  await db.doc("Bookings/deletion-history").set({
    userId: uid,
    status: "completed",
    customerName: "Private person",
    phone: "0900000000",
    note: "Private",
    schemaVersion: 2,
  });
  let deletes = 0;
  const resources = {
    bucket: { deleteFiles: async () => {} },
    auth: {
      deleteUser: async () => {
        if (++deletes === 1) throw new Error("temporary-auth-failure");
      },
    },
  };
  const deleting = createService(db, { ...resources, now: () => t });
  const who = { ...actor(uid), authTime: Math.floor(t / 1000) };
  await assert.rejects(deleting(who, { action: "deleteAccount" }));
  assert.equal(
    (await db.doc("AccountDeletions/" + uid).get()).data().status,
    "pending",
  );
  await assert.rejects(
    deleting(who, { action: "saveProfile", name: "Recreate" }),
  );
  await finishAccountDeletion(db, resources, uid, t);
  await finishAccountDeletion(db, resources, uid, t);
  assert.equal(deletes, 2);
  assert.equal((await db.doc("Users/" + uid).get()).exists, false);
  assert.equal(
    (await db.doc("Bookings/deletion-history").get()).data().phone,
    "",
  );
  assert.equal(
    (await db.doc("AccountDeletions/" + uid).get()).data().status,
    "done",
  );
});

test("admin approval cannot be self-granted; history cursors remain scoped", async () => {
  await db.doc("Users/applicant").set({ role: "user", name: "Applicant" });
  await db
    .doc("MerchantApplications/applicant")
    .set({ userId: "applicant", status: "pending" });
  await db.doc("Facilities/unassigned").set({ name: "Unassigned" });
  const approval = {
    action: "approveMerchant",
    userId: "applicant",
    facilityId: "unassigned",
  };
  await assert.rejects(service(actor("applicant"), approval));
  await service({ ...actor("admin"), admin: true }, approval);
  assert.equal(
    (await db.doc("Facilities/unassigned").get()).data().ownerId,
    "applicant",
  );
  await assert.rejects(
    service(actor("b"), { action: "listBookings", scope: "merchant" }),
  );
  const history = await service(actor("a"), { action: "listBookings" });
  assert.ok(history.items.every((b) => b.userId === "a"));
  await assert.rejects(
    service(actor("b"), {
      action: "listBookings",
      cursor: history.items[0].id,
    }),
  );
});

test("legacy active orders block new holds and deletion until reviewed", async () => {
  const priorTime = t;
  t = dateTime(testDate, 0) - 86400000;
  const legacy = db.doc("Bookings/legacy-approved");
  await db
    .doc("Users/legacy-user")
    .set({ role: "user", name: "Legacy player" });
  await legacy.set({
    userId: "legacy-user",
    venueId: "facility",
    date: testDate,
    status: "approved",
  });
  try {
    await assert.rejects(
      hold("b", "legacy-block", "07:00"),
      (e) => e.message === "legacy-schedule-needs-review",
    );
    await assert.rejects(
      service(
        { ...actor("legacy-user"), authTime: Math.floor(t / 1000) },
        { action: "deleteAccount" },
      ),
      (e) => e.message === "active-transactions-prevent-deletion",
    );
    assert.equal(
      (await db.doc("AccountDeletions/legacy-user").get()).exists,
      false,
    );
  } finally {
    await legacy.delete();
    t = priorTime;
  }
});
