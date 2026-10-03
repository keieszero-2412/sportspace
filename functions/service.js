import { createHash } from "node:crypto";
import {
  HOLD_MS,
  ACTIVE,
  interval,
  overlaps,
  lockIds,
  quote,
  refundDue,
  joinMatch,
  normalize,
  localDate,
  dateTime,
  minutes,
  opening,
} from "./domain.js";
import { finishAccountDeletion } from "./maintenance.js";
const legacyActive = (status) =>
  [
    ...ACTIVE,
    "approved",
    "pending",
    "pending_payment",
    "pending_refund",
  ].includes(status);

export class DomainError extends Error {
  constructor(message, code = "failed-precondition") {
    super(message);
    this.code = code;
  }
}
const fail = (message, code) => {
  throw new DomainError(message, code);
};
const text = (v, max = 500) =>
  String(v || "")
    .trim()
    .slice(0, max);
const id = (v) => {
  const s = text(v, 150);
  if (!s || s.includes("/")) fail("invalid-id", "invalid-argument");
  return s;
};
const money = (v) => {
  if (!Number.isSafeInteger(v) || v < 0)
    fail("invalid-money", "invalid-argument");
  return v;
};
const hash = (value) => createHash("sha256").update(value).digest("hex");
const asData = (snap) => (snap.exists ? { ...snap.data(), id: snap.id } : null);

export function createService(db, { bucket, auth, now = Date.now } = {}) {
  const ref = (col, value) => db.collection(col).doc(id(value));
  const read = async (col, value) => asData(await ref(col, value).get());
  const requireUser = (actor) => {
    if (!actor?.uid) fail("login-required", "unauthenticated");
    return actor.uid;
  };
  const notify = (tx, key, uid, message, messageEn) => {
    tx.set(ref("Notifications", hash(`${key}:${uid}`)), {
      userId: uid,
      title: "SportSpace",
      message,
      messageEn,
      createdAt: now(),
      read: false,
      type: "booking",
    });
  };
  async function owner(actor, facilityId) {
    const uid = requireUser(actor);
    const [user, facility] = await Promise.all([
      read("Users", uid),
      read("Facilities", facilityId),
    ]);
    if (user?.role !== "merchant" || facility?.ownerId !== uid)
      fail("owner-required", "permission-denied");
    return facility;
  }
  async function fileMetadata(path, prefix) {
    if (!path?.startsWith(prefix) || path.slice(prefix.length).includes("/"))
      fail("invalid-file", "invalid-argument");
    if (!bucket) fail("storage-unavailable");
    const [meta] = await bucket.file(path).getMetadata();
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(meta.contentType) ||
      Number(meta.size) > 5 * 1024 * 1024
    )
      fail("invalid-image");
  }
  async function bookingTransition(actor, data) {
    const uid = requireUser(actor);
    const bookingRef = ref("Bookings", data.bookingId);
    return db.runTransaction(async (tx) => {
      const b = asData(await tx.get(bookingRef));
      if (!b || b.schemaVersion !== 2) fail("legacy-booking-needs-review");
      const isOwner = b.ownerId === uid;
      const action = data.operation;
      if (
        (action === "cancel" && b.userId !== uid) ||
        (action !== "cancel" && !isOwner)
      )
        fail("not-your-booking", "permission-denied");
      // Read locks and immutable payment references before any writes.
      const locks = await Promise.all(
        (b.lockIds || []).map((key) => tx.get(ref("SlotLocks", key))),
      );
      const reference = text(data.reference, 100);
      const paymentRef = reference
        ? ref("PaymentReferences", hash(`${b.ownerId}:${reference}`))
        : null;
      const priorPayment = paymentRef ? asData(await tx.get(paymentRef)) : null;
      const scoreRef = ref("CredibilityEvents", `${b.id}_attendance`);
      const scoreEvent = asData(await tx.get(scoreRef));
      const player = asData(await tx.get(ref("Users", b.userId)));
      const patch = { updatedAt: now() };
      let release = false;
      if (action === "approve") {
        if (b.status === "confirmed") return b;
        if (
          b.status !== "pending_approval" ||
          !b.receiptPath ||
          !reference ||
          data.amount !== b.totalAmount
        )
          fail("payment-verification-required");
        if (
          b.holdExpiresAt <= now() ||
          locks.some(
            (s) => s.data()?.bookingId !== b.id || s.data()?.expiresAt <= now(),
          )
        )
          fail("hold-expired");
        if (priorPayment && priorPayment.bookingId !== b.id)
          fail("payment-reference-already-used");
        Object.assign(patch, {
          status: "confirmed",
          paymentStatus: "paid",
          depositPaid: b.totalAmount,
          paymentReference: reference,
          verifiedBy: uid,
        });
        tx.set(paymentRef, {
          bookingId: b.id,
          kind: "payment",
          amount: b.totalAmount,
          createdAt: now(),
        });
        for (const key of b.lockIds) {
          tx.update(ref("SlotLocks", key), { expiresAt: b.endAt });
          tx.update(ref("Availability", key), {
            expiresAt: b.endAt,
            status: "confirmed",
          });
        }
      } else if (action === "cancel" || action === "reject") {
        if (b.status === "cancelled" || b.status === "rejected") return b;
        if (!ACTIVE.includes(b.status)) fail("booking-not-active");
        const due =
          action === "reject"
            ? b.paymentStatus === "paid"
              ? b.depositPaid
              : 0
            : refundDue(b, now());
        Object.assign(patch, {
          status: action === "cancel" ? "cancelled" : "rejected",
          refundAmount: due,
          refundStatus: due > 0 ? "requested" : "none",
          cancelledAt: now(),
        });
        release = true;
      } else if (action === "refund") {
        if (b.refundStatus === "refunded") return b;
        if (
          b.refundStatus !== "requested" ||
          !reference ||
          data.amount !== b.refundAmount
        )
          fail("refund-verification-required");
        if (
          priorPayment &&
          (priorPayment.bookingId !== b.id || priorPayment.kind !== "refund")
        )
          fail("payment-reference-already-used");
        Object.assign(patch, {
          refundStatus: "refunded",
          refundedAmount: b.refundAmount,
          refundReference: reference,
          refundedAt: now(),
        });
        tx.set(paymentRef, {
          bookingId: b.id,
          kind: "refund",
          amount: b.refundAmount,
          createdAt: now(),
        });
      } else if (action === "recordLatePayment") {
        const awaitingExpiry =
          ["held", "pending_approval"].includes(b.status) &&
          b.holdExpiresAt <= now();
        if (
          (!awaitingExpiry &&
            !["expired", "cancelled", "rejected"].includes(b.status)) ||
          b.paymentStatus === "paid" ||
          !reference ||
          data.amount !== b.totalAmount
        )
          fail("late-payment-verification-required");
        if (priorPayment) fail("payment-reference-already-used");
        Object.assign(patch, {
          paymentStatus: "paid",
          depositPaid: b.totalAmount,
          paymentReference: reference,
          refundAmount: b.totalAmount,
          refundStatus: "requested",
          verifiedBy: uid,
        });
        if (awaitingExpiry) {
          patch.status = "expired";
          release = true;
        }
        tx.set(paymentRef, {
          bookingId: b.id,
          kind: "payment",
          amount: b.totalAmount,
          createdAt: now(),
        });
      } else if (action === "complete") {
        if (b.status === "completed") return b;
        if (b.status !== "confirmed" || b.endAt > now())
          fail("booking-not-finished");
        patch.status = "completed";
        release = true;
        if (b.attendanceConfirmedAt && !scoreEvent && player) {
          const delta = Math.min(2, 100 - (player.credibilityScore ?? 100));
          tx.set(scoreRef, {
            userId: b.userId,
            bookingId: b.id,
            delta,
            reason: "Verified attendance",
            createdAt: now(),
          });
          tx.update(ref("Users", b.userId), {
            credibilityScore: Math.min(
              100,
              (player.credibilityScore ?? 100) + delta,
            ),
          });
        }
      } else fail("invalid-operation", "invalid-argument");
      if (release)
        locks.forEach((s) => {
          if (s.data()?.bookingId === b.id) {
            tx.delete(s.ref);
            tx.delete(ref("Availability", s.id));
          }
        });
      if (["approve", "recordLatePayment", "refund"].includes(action)) {
        const delta = action === "refund" ? -b.refundAmount : b.totalAmount;
        tx.set(ref("Ledger", hash(`${b.id}:${action}`)), {
          bookingId: b.id,
          ownerId: b.ownerId,
          facilityId: b.facilityId,
          delta,
          reference,
          at: now(),
        });
      }
      tx.update(bookingRef, patch);
      tx.set(ref("AuditEvents", hash(`${b.id}:${action}`)), {
        bookingId: b.id,
        action,
        actorId: uid,
        at: now(),
        ...patch,
      });
      notify(
        tx,
        `${b.id}:${action}`,
        b.userId,
        `Đơn ${b.ticketId}: ${patch.status || patch.refundStatus}`,
        `Order ${b.ticketId}: ${patch.status || patch.refundStatus}`,
      );
      if (action === "cancel")
        notify(
          tx,
          `${b.id}:${action}`,
          b.ownerId,
          `Khách đã hủy đơn ${b.ticketId}.`,
          `Customer cancelled ${b.ticketId}.`,
        );
      return { ...b, ...patch };
    });
  }

  return async function service(actor, data) {
    const action = data?.action;
    if (action === "listVenues") {
      // Bounded memory scan preserves substring search across all pages, including legacy documents.
      // An external search index can replace this without changing the client contract.
      const found = [];
      let cursor = data.cursor ? id(data.cursor) : null;
      let more = true;
      while (found.length < 24 && more) {
        let q = db.collection("Facilities").orderBy("__name__").limit(60);
        if (cursor) q = q.startAfter(cursor);
        const snap = await q.get();
        more = snap.size === 60;
        for (const doc of snap.docs) {
          cursor = doc.id;
          const v = doc.data();
          if (
            v.status === "archived" ||
            (data.province &&
              data.province !== "ALL" &&
              v.province !== data.province) ||
            (data.sport && data.sport !== "ALL" && v.sport !== data.sport)
          )
            continue;
          if (
            data.amenity &&
            data.amenity !== "ALL" &&
            !(v.amenities || []).some((a) =>
              normalize(a).includes(normalize(data.amenity)),
            )
          )
            continue;
          if (
            data.search &&
            !normalize(
              `${v.name} ${v.address} ${v.province} ${v.name_en || ""}`,
            ).includes(normalize(text(data.search)))
          )
            continue;
          if (data.availableDate && data.availableTime) {
            let range;
            try {
              range = interval(
                data.availableDate,
                data.availableTime,
                Number(data.availableDuration || 60),
                v.operating_hours,
              );
            } catch {
              continue;
            }
            if (range.startAt <= now() || !v.ownerId) continue;
            const courts = await db
              .collection("Courts")
              .where("facility_id", "==", v.facility_id || doc.id)
              .where("status", "==", "active")
              .get();
            let free = false;
            for (const court of courts.docs) {
              if (!court.data().basePrice) continue;
              const locks = await db.getAll(
                ...lockIds(court.id, [range]).map((k) => ref("SlotLocks", k)),
              );
              if (
                locks.every((s) => !s.exists || s.data().expiresAt <= now())
              ) {
                free = true;
                break;
              }
            }
            if (!free) continue;
          }
          const { bank, bankAccount, bankOwner, bankName, ...publicVenue } = v;
          found.push({ ...publicVenue, id: doc.id });
          if (found.length === 24) {
            more = true;
            break;
          }
        }
      }
      return { items: found, cursor, hasMore: more };
    }
    if (action === "catalogue") {
      const [facilities, courts] = await Promise.all([
        db.collection("Facilities").get(),
        db.collection("Courts").count().get(),
      ]);
      return {
        provinces: [
          ...new Set(
            facilities.docs.map((s) => s.data().province).filter(Boolean),
          ),
        ].sort(),
        totalVenues: facilities.size,
        totalCourts: courts.data().count,
      };
    }
    const uid = requireUser(actor);
    if (action !== "deleteAccount" && (await read("AccountDeletions", uid)))
      fail("account-deleting");
    if (action === "merchantStats") {
      const f = await owner(actor, data.facilityId);
      const today = localDate(new Date(now())),
        start = dateTime(today, 0),
        weekday = new Date(start + 7 * 3600000).getUTCDay(),
        week = start - ((weekday + 6) % 7) * 86400000;
      const ledger = await db
        .collection("Ledger")
        .where("ownerId", "==", uid)
        .where("at", ">=", week)
        .where("at", "<", week + 7 * 86400000)
        .get();
      const entries = ledger.docs
        .map((s) => s.data())
        .filter((e) => e.facilityId === data.facilityId);
      const [courts, orders] = await Promise.all([
        db
          .collection("Courts")
          .where("facility_id", "==", f.facility_id || f.id)
          .get(),
        db
          .collection("Bookings")
          .where("ownerId", "==", uid)
          .where("date", "==", today)
          .get(),
      ]);
      const active = courts.docs
        .filter((s) => s.data().status === "active")
        .map((s) => s.id);
      let availableMinutes = 0;
      try {
        const bounds = opening(f.operating_hours);
        availableMinutes = active.length * (bounds.end - bounds.start);
      } catch {}
      const confirmedMinutes = orders.docs
        .filter(
          (s) =>
            s.data().facilityId === f.id &&
            active.includes(s.data().courtId) &&
            ["confirmed", "completed"].includes(s.data().status),
        )
        .reduce(
          (n, s) =>
            n +
            (s.data().ranges || []).reduce(
              (sum, r) => sum + (r.endAt - r.startAt) / 60000,
              0,
            ),
          0,
        );
      return {
        revenueToday: entries
          .filter((e) => e.at >= start && e.at < start + 86400000)
          .reduce((n, e) => n + e.delta, 0),
        revenueWeek: entries.reduce((n, e) => n + e.delta, 0),
        occupancy: availableMinutes
          ? Math.min(100, (100 * confirmedMinutes) / availableMinutes)
          : null,
      };
    }
    if (action === "listBookings") {
      const field = data.scope === "merchant" ? "ownerId" : "userId";
      if (
        field === "ownerId" &&
        (await read("Users", uid))?.role !== "merchant"
      )
        fail("owner-required", "permission-denied");
      let q = db
        .collection("Bookings")
        .where(field, "==", uid)
        .orderBy("createdAt", "desc")
        .orderBy("__name__", "desc")
        .limit(25);
      if (data.cursor) {
        const last = await ref("Bookings", data.cursor).get();
        if (!last.exists || last.data()[field] !== uid) fail("invalid-cursor");
        q = q.startAfter(last);
      }
      const snap = await q.get();
      return {
        items: snap.docs.map(asData),
        hasMore: snap.size === 25,
        cursor: snap.docs.at(-1)?.id || null,
      };
    }
    if (action === "saveProfile") {
      const allowed = [
        "name",
        "phone",
        "province",
        "skillLevel",
        "preferredLanguage",
      ];
      const patch = Object.fromEntries(
        allowed
          .filter((k) => data[k] != null)
          .map((k) => [k, text(data[k], 100)]),
      );
      if (Array.isArray(data.favoriteSports))
        patch.favoriteSports = data.favoriteSports
          .slice(0, 10)
          .map((v) => text(v, 50));
      return db.runTransaction(async (tx) => {
        const profileRef = ref("Users", uid);
        const prior = asData(await tx.get(profileRef));
        if (
          prior?.deletionRequested ||
          (await tx.get(ref("AccountDeletions", uid))).exists
        )
          fail("account-deleting");
        if (prior && data.initializeOnly) return { ...prior, uid };
        const base = prior || {
          role: "user",
          name: actor.email?.split("@")[0] || "",
          credibilityScore: 100,
          email: actor.email || "",
          favoriteSports: [],
          savedVenueIds: [],
          createdAt: now(),
        };
        tx.set(profileRef, { ...base, ...patch, updatedAt: now() });
        return { ...base, ...patch, uid };
      });
    }
    if (action === "toggleSavedVenue")
      return db.runTransaction(async (tx) => {
        const r = ref("Users", uid),
          s = asData(await tx.get(r));
        if (!s) fail("profile-required");
        const set = new Set(s.savedVenueIds || []),
          venueId = id(data.venueId);
        if (set.has(venueId)) set.delete(venueId);
        else set.add(venueId);
        if (set.size > 200) fail("too-many-saved-venues");
        tx.update(r, { savedVenueIds: [...set] });
        return [...set];
      });
    if (action === "savedVenues") {
      const p = await read("Users", uid);
      return (
        await Promise.all(
          (p?.savedVenueIds || []).map((v) => read("Facilities", v)),
        )
      ).filter(Boolean);
    }
    if (action === "applyMerchant") {
      if (!text(data.venueName) || !text(data.venueAddress))
        fail("venue-details-required");
      for (const p of data.documentPaths || [])
        await fileMetadata(p, `merchant_documents/${uid}/`);
      const application = {
        userId: uid,
        venueName: text(data.venueName),
        venueAddress: text(data.venueAddress),
        venueSport: text(data.venueSport),
        venueScale: Number(data.venueScale || 1),
        bankName: text(data.bankName),
        bankAccount: text(data.bankAccount),
        bankOwner: text(data.bankOwner),
        documentPaths: data.documentPaths || [],
      };
      return db.runTransaction(async (tx) => {
        const r = ref("MerchantApplications", uid),
          s = asData(await tx.get(r));
        if (s?.status === "approved") fail("already-approved");
        tx.set(r, { ...application, status: "pending", submittedAt: now() });
        return { status: "pending" };
      });
    }
    if (action === "approveMerchant" || action === "verifyBank") {
      if (!actor.admin) fail("admin-required", "permission-denied");
      const f = await read("Facilities", data.facilityId);
      if (!f) fail("facility-not-found");
      if (action === "verifyBank") {
        const bank = {
          bin: text(data.bin, 6),
          account: text(data.account, 30),
          name: text(data.name, 100),
        };
        if (
          !/^\d{6}$/.test(bank.bin) ||
          !/^\d{5,30}$/.test(bank.account) ||
          !bank.name
        )
          fail("invalid-bank");
        await ref("PaymentConfig", f.id).set({
          ...bank,
          verifiedBy: uid,
          verifiedAt: now(),
        });
        return { verified: true };
      }
      return db.runTransaction(async (tx) => {
        const application = asData(
          await tx.get(ref("MerchantApplications", data.userId)),
        );
        const profile = asData(await tx.get(ref("Users", data.userId)));
        const facility = asData(await tx.get(ref("Facilities", f.id)));
        if (
          !application ||
          !profile ||
          (facility.ownerId && facility.ownerId !== data.userId)
        )
          fail("invalid-application");
        tx.update(ref("Users", data.userId), { role: "merchant" });
        tx.update(ref("Facilities", f.id), { ownerId: data.userId });
        tx.update(ref("MerchantApplications", data.userId), {
          status: "approved",
          approvedBy: uid,
          approvedAt: now(),
          facilityId: f.id,
        });
        return { approved: true };
      });
    }
    if (action === "blockSlot") {
      const f = await owner(actor, data.facilityId);
      const court = await read("Courts", data.courtId);
      if (
        !court ||
        ![f.id, f.facility_id]
          .filter(Boolean)
          .includes(court.facilityId || court.facility_id)
      )
        fail("wrong-facility", "permission-denied");
      const range = interval(data.date, data.time, 30, f.operating_hours);
      if (range.startAt <= now()) fail("time-past");
      const key = lockIds(court.id, [range])[0];
      return db.runTransaction(async (tx) => {
        const r = ref("SlotLocks", key),
          old = asData(await tx.get(r));
        if (old?.expiresAt > now() && old.bookingId !== `maintenance:${uid}`)
          fail("slot-taken");
        if (old?.bookingId === `maintenance:${uid}`) {
          tx.delete(r);
          tx.delete(ref("Availability", key));
          return { blocked: false };
        }
        tx.set(r, {
          bookingId: `maintenance:${uid}`,
          courtId: court.id,
          expiresAt: range.endAt,
        });
        tx.set(ref("Availability", key), {
          facilityId: f.id,
          courtId: court.id,
          date: data.date,
          ...range,
          expiresAt: range.endAt,
          status: "maintenance",
        });
        return { blocked: true };
      });
    }
    if (
      action === "saveCourt" ||
      action === "saveFacility" ||
      action === "archiveCourt"
    ) {
      const ownedFacility = await owner(actor, data.facilityId);
      if (action === "saveFacility") {
        const pricing = data.pricing;
        if (pricing) {
          minutes(pricing.peakStart);
          minutes(pricing.peakEnd);
          for (const field of ["peakPercent", "weekendPercent"])
            if (
              !Number.isFinite(pricing[field]) ||
              pricing[field] < 0 ||
              pricing[field] > 100
            )
              fail("invalid-pricing");
        }
        const patch = { updatedAt: now() };
        if (pricing)
          patch.pricing = {
            enabled: !!pricing.enabled,
            peakStart: pricing.peakStart,
            peakEnd: pricing.peakEnd,
            peakPercent: pricing.peakPercent,
            weekendPercent: pricing.weekendPercent,
          };
        if (data.operating_hours) {
          interval(
            localDate(),
            data.operating_hours.split("-")[0].trim(),
            30,
            data.operating_hours,
          );
          patch.operating_hours = data.operating_hours;
        }
        patch.pricingVersion = now();
        await ref("Facilities", data.facilityId).update(patch);
        return patch;
      }
      const courtRef = data.courtId
        ? ref("Courts", data.courtId)
        : ref("Courts", hash(`${uid}:${id(data.key)}`));
      if (data.imageUrl) {
        let url;
        try {
          url = new URL(data.imageUrl);
        } catch {
          fail("invalid-image");
        }
        const local =
          process.env.FIREBASE_STORAGE_EMULATOR_HOST &&
          url.host === process.env.FIREBASE_STORAGE_EMULATOR_HOST;
        if (
          (url.protocol !== "https:" ||
            url.hostname !== "firebasestorage.googleapis.com") &&
          !local
        )
          fail("invalid-image");
        const parts = url.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
        if (
          !parts ||
          (bucket?.name && decodeURIComponent(parts[1]) !== bucket.name)
        )
          fail("invalid-image");
        await fileMetadata(
          decodeURIComponent(parts[2]),
          `court_photos/${uid}/`,
        );
      }
      return db.runTransaction(async (tx) => {
        const prior = asData(await tx.get(courtRef));
        if (
          prior &&
          ![data.facilityId, ownedFacility.facility_id]
            .filter(Boolean)
            .includes(prior.facilityId || prior.facility_id)
        )
          fail("wrong-facility", "permission-denied");
        if (prior && !data.courtId) return prior;
        const busy = await tx.get(
          db.collection("SlotLocks").where("courtId", "==", courtRef.id),
        );
        if (
          (action === "archiveCourt" || data.status === "maintenance") &&
          busy.docs.some((s) => s.data().expiresAt > now())
        )
          fail("court-has-active-bookings");
        const patch =
          action === "archiveCourt"
            ? { status: "archived" }
            : {
                name: text(data.name, 100),
                surface_type: text(data.type, 100),
                basePrice: money(Number(data.basePrice)),
                status:
                  data.status === "maintenance" ? "maintenance" : "active",
                imageUrl: text(data.imageUrl, 1000),
              };
        if (action !== "archiveCourt" && (!patch.name || !patch.basePrice))
          fail("invalid-court");
        tx.set(courtRef, {
          ...prior,
          ...patch,
          facilityId: data.facilityId,
          facility_id: ownedFacility.facility_id || data.facilityId,
          ownerId: uid,
          updatedAt: now(),
        });
        return { id: courtRef.id, ...patch };
      });
    }
    if (action === "holdBooking") {
      const facilityId = id(data.facilityId),
        courtId = id(data.courtId),
        key = id(data.key);
      const bookingRef = ref("Bookings", hash(`${uid}:${key}`));
      const fingerprint = hash(
        JSON.stringify([
          facilityId,
          courtId,
          data.date,
          data.times,
          data.duration,
        ]),
      );
      return db.runTransaction(async (tx) => {
        const old = asData(await tx.get(bookingRef));
        if (old) {
          if (old.fingerprint !== fingerprint) fail("idempotency-key-reused");
          if (old.holdExpiresAt <= now()) fail("hold-expired");
          return old;
        }
        const [fs, cs, ps, us] = await Promise.all([
          tx.get(ref("Facilities", facilityId)),
          tx.get(ref("Courts", courtId)),
          tx.get(ref("PaymentConfig", facilityId)),
          tx.get(ref("Users", uid)),
        ]);
        if (
          us.data()?.deletionRequested ||
          (await tx.get(ref("AccountDeletions", uid))).exists
        )
          fail("account-deleting");
        const f = asData(fs),
          c = asData(cs),
          payment = asData(ps);
        if (
          !f?.ownerId ||
          f.status === "archived" ||
          !c ||
          ![facilityId, f.facility_id]
            .filter(Boolean)
            .includes(c.facilityId || c.facility_id) ||
          c.status !== "active"
        )
          fail("court-not-bookable");
        if (!payment?.verifiedAt) fail("payment-not-configured");
        if (
          !Array.isArray(data.times) ||
          !data.times.length ||
          data.times.length > 16
        )
          fail("select-time");
        const ranges = [...new Set(data.times)]
          .map((t) => interval(data.date, t, data.duration, f.operating_hours))
          .sort((a, b) => a.startAt - b.startAt);
        if (
          ranges.some((r) => r.startAt <= now()) ||
          ranges.some((r, i) => i > 0 && overlaps(r, ranges[i - 1]))
        )
          fail("invalid-interval");
        const keys = lockIds(courtId, ranges);
        const locks = await Promise.all(
          keys.map((k) => tx.get(ref("SlotLocks", k))),
        );
        // Existing unconverted orders must be reviewed rather than silently ignored.
        const legacy = await tx.get(
          db
            .collection("Bookings")
            .where("venueId", "in", [
              ...new Set([facilityId, f.facility_id].filter(Boolean)),
            ])
            .where("date", "==", data.date),
        );
        if (
          legacy.docs.some(
            (s) =>
              s.data().schemaVersion !== 2 && legacyActive(s.data().status),
          )
        )
          fail("legacy-schedule-needs-review");
        if (locks.some((s) => s.exists && s.data().expiresAt > now()))
          fail("slot-taken", "already-exists");
        const totalAmount = quote(c, f, ranges);
        const expires = Math.min(now() + HOLD_MS, ranges[0].startAt);
        const b = {
          schemaVersion: 2,
          userId: uid,
          ownerId: f.ownerId,
          venueId: facilityId,
          facilityId,
          courtId,
          courtName: c.name,
          venueName: f.name,
          date: data.date,
          time: data.times.join(", "),
          duration: data.duration,
          ranges,
          startAt: ranges[0].startAt,
          endAt: ranges.at(-1).endAt,
          totalAmount,
          depositPaid: 0,
          paymentStatus: "unpaid",
          refundStatus: "none",
          status: "held",
          holdExpiresAt: expires,
          lockIds: keys,
          key,
          fingerprint,
          ticketId: `SS-${bookingRef.id.slice(0, 12).toUpperCase()}`,
          customerName: text(data.customerName, 100),
          phone: text(data.phone, 30),
          note: text(data.note),
          paymentMethod: "bank_transfer",
          paymentGateway: "Bank transfer",
          payment,
          createdAt: now(),
        };
        b.pricingSnapshot = {
          basePrice: c.basePrice,
          pricing: f.pricing || {},
          version: f.pricingVersion || c.updatedAt || null,
        };
        if (!b.customerName || !/^[+\d\s-]{8,20}$/.test(b.phone))
          fail("customer-details-required");
        keys.forEach((k) => {
          const startAt = Number(k.slice(k.lastIndexOf("_") + 1));
          tx.set(ref("SlotLocks", k), {
            bookingId: bookingRef.id,
            courtId,
            expiresAt: expires,
          });
          tx.set(ref("Availability", k), {
            facilityId,
            courtId,
            date: data.date,
            startAt,
            endAt: startAt + 1800000,
            expiresAt: expires,
            status: "held",
          });
        });
        tx.set(bookingRef, b);
        return { ...b, id: bookingRef.id };
      });
    }
    if (action === "submitReceipt") {
      const b = await read("Bookings", data.bookingId);
      if (b?.userId !== uid) fail("not-your-booking", "permission-denied");
      await fileMetadata(data.path, `receipts/${uid}/${b.id}/`);
      return db.runTransaction(async (tx) => {
        const r = ref("Bookings", b.id),
          current = asData(await tx.get(r));
        if (
          current.status === "pending_approval" &&
          current.receiptPath === data.path
        )
          return current;
        if (current.status !== "held" || current.holdExpiresAt <= now())
          fail("hold-expired");
        const locks = await Promise.all(
          current.lockIds.map((k) => tx.get(ref("SlotLocks", k))),
        );
        if (
          locks.some(
            (s) => s.data()?.bookingId !== b.id || s.data()?.expiresAt <= now(),
          )
        )
          fail("hold-expired");
        tx.update(r, {
          receiptPath: data.path,
          status: "pending_approval",
          paymentStatus: "pending_verification",
          updatedAt: now(),
        });
        notify(
          tx,
          `${b.id}:receipt`,
          b.ownerId,
          `Đơn ${b.ticketId} cần kiểm tra biên lai trước khi hết hạn giữ sân.`,
          `Verify receipt for ${b.ticketId} before the hold expires.`,
        );
        return { status: "pending_approval" };
      });
    }
    if (action === "bookingTransition") return bookingTransition(actor, data);
    if (action === "confirmAttendance")
      return db.runTransaction(async (tx) => {
        const r = ref("Bookings", data.bookingId),
          b = asData(await tx.get(r));
        if (b?.userId !== uid || b.status !== "confirmed" || b.startAt > now())
          fail("attendance-not-allowed");
        tx.update(r, { attendanceConfirmedAt: now() });
        return { confirmed: true };
      });
    if (action === "createMatch") {
      const startAt = dateTime(data.date, minutes(data.startTime)),
        endAt = dateTime(data.date, minutes(data.endTime));
      if (
        startAt <= now() ||
        endAt <= startAt ||
        !text(data.title) ||
        !text(data.venueName)
      )
        fail("invalid-match");
      const max = Number(data.playersMax);
      if (!Number.isInteger(max) || max < 2 || max > 22)
        fail("invalid-capacity");
      const p = await read("Users", uid);
      const r = ref("Matches", hash(`${uid}:${id(data.key)}`));
      return db.runTransaction(async (tx) => {
        const prior = asData(await tx.get(r));
        if (prior) return prior;
        const profile = asData(await tx.get(ref("Users", uid)));
        if (
          profile?.deletionRequested ||
          (await tx.get(ref("AccountDeletions", uid))).exists
        )
          fail("account-deleting");
        const m = {
          title: text(data.title, 150),
          sport: text(data.sport, 50),
          province: text(data.province, 100),
          venueName: text(data.venueName, 150),
          date: data.date,
          time: `${data.startTime} - ${data.endTime}`,
          startAt,
          endAt,
          levelRequired: text(data.levelRequired, 100),
          costPerPerson: money(Number(data.costPerPerson)),
          playersMax: max,
          playersJoined: 1,
          joinedUsers: [uid],
          hostId: uid,
          hostName: p?.name || actor.email || "",
          hostCredibility: p?.credibilityScore ?? 100,
          status: "open",
          createdAt: now(),
        };
        m.memberNames = { [uid]: m.hostName };
        tx.set(r, m);
        return { ...m, id: r.id };
      });
    }
    if (action === "matchTransition")
      return db.runTransaction(async (tx) => {
        const r = ref("Matches", data.matchId),
          m = asData(await tx.get(r));
        const player = asData(await tx.get(ref("Users", uid)));
        if (
          player?.deletionRequested ||
          (await tx.get(ref("AccountDeletions", uid))).exists
        )
          fail("account-deleting");
        if (!m) fail("match-not-found");
        const host = uid === m.hostId;
        let patch;
        if (data.operation === "join") {
          const users = joinMatch(m, uid, now());
          patch = {
            joinedUsers: users,
            playersJoined: users.length,
            memberNames: { ...m.memberNames, [uid]: player?.name || "Player" },
          };
        } else if (data.operation === "leave") {
          if (host) fail("host-must-cancel");
          if (m.startAt <= now()) fail("match-closed");
          const users = (m.joinedUsers || []).filter((u) => u !== uid),
            names = { ...m.memberNames };
          delete names[uid];
          patch = {
            joinedUsers: users,
            playersJoined: users.length,
            memberNames: names,
          };
        } else if (data.operation === "cancel" && host)
          patch = { status: "cancelled" };
        else fail("not-match-host", "permission-denied");
        tx.update(r, { ...patch, updatedAt: now() });
        if (data.operation === "cancel")
          (m.joinedUsers || []).forEach((u) =>
            notify(
              tx,
              `${m.id}:cancel`,
              u,
              `Kèo ${m.title} đã hủy.`,
              `Match ${m.title} cancelled.`,
            ),
          );
        else
          notify(
            tx,
            `${m.id}:${uid}:${data.operation}:${m.playersJoined}`,
            m.hostId,
            `Thành viên ${data.operation === "join" ? "tham gia" : "rời"} kèo ${m.title}.`,
            `A member ${data.operation === "join" ? "joined" : "left"} ${m.title}.`,
          );
        return patch;
      });
    if (action === "editMatch")
      return db.runTransaction(async (tx) => {
        const r = ref("Matches", data.matchId),
          m = asData(await tx.get(r));
        if (m?.hostId !== uid) fail("not-match-host", "permission-denied");
        if (m.status !== "open" || m.startAt <= now()) fail("match-closed");
        const startAt = dateTime(data.date, minutes(data.startTime)),
          endAt = dateTime(data.date, minutes(data.endTime)),
          playersMax = Number(data.playersMax);
        if (
          startAt <= now() ||
          endAt <= startAt ||
          !Number.isInteger(playersMax) ||
          playersMax < Math.max(2, m.joinedUsers?.length || 0) ||
          playersMax > 22 ||
          !text(data.title) ||
          !text(data.venueName)
        )
          fail("invalid-match");
        const patch = {
          title: text(data.title, 150),
          sport: text(data.sport, 50),
          province: text(data.province, 100),
          venueName: text(data.venueName, 150),
          date: data.date,
          time: `${data.startTime} - ${data.endTime}`,
          startAt,
          endAt,
          playersMax,
          costPerPerson: money(Number(data.costPerPerson)),
          levelRequired: text(data.levelRequired, 100),
          updatedAt: now(),
        };
        tx.update(r, patch);
        for (const member of m.joinedUsers || [])
          notify(
            tx,
            `${m.id}:edit:${now()}`,
            member,
            `Kèo ${patch.title} đã đổi thông tin. Kiểm tra lại thời gian và chi phí.`,
            `Match ${patch.title} changed. Check the updated time and cost.`,
          );
        return patch;
      });
    if (action === "saveReview")
      return db.runTransaction(async (tx) => {
        const b = asData(await tx.get(ref("Bookings", data.bookingId)));
        if (!b || b.userId !== uid || b.status !== "completed")
          fail("completed-booking-required", "permission-denied");
        const rating = Number(data.rating),
          comment = text(data.comment, 2000);
        if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !comment)
          fail("invalid-review");
        tx.set(
          ref("Reviews", b.id),
          {
            userId: uid,
            bookingId: b.id,
            facilityId: b.facilityId,
            ownerId: b.ownerId,
            user: b.customerName,
            rating,
            comment,
            date: localDate(),
            createdAt: now(),
          },
          { merge: true },
        );
        notify(
          tx,
          `${b.id}:review`,
          b.ownerId,
          `Có đánh giá mới cho ${b.venueName}.`,
          `New review for ${b.venueName}.`,
        );
        return { saved: true };
      });
    if (action === "replyReview") {
      const review = await read("Reviews", data.reviewId);
      if (review?.ownerId !== uid) fail("not-your-review", "permission-denied");
      const response = text(data.response, 2000);
      if (!response) fail("response-required");
      await ref("Reviews", review.id).update({ response, repliedAt: now() });
      return { saved: true };
    }
    if (action === "deleteAccount") {
      if (!actor.authTime || now() / 1000 - actor.authTime > 300)
        fail("reauthentication-required", "unauthenticated");
      await db.runTransaction(async (tx) => {
        const p = asData(await tx.get(ref("Users", uid)));
        if (p?.role === "merchant") fail("transfer-facilities-before-deletion");
        const bookings = await tx.get(
          db.collection("Bookings").where("userId", "==", uid),
        );
        const matches = await tx.get(
          db.collection("Matches").where("hostId", "==", uid),
        );
        if (
          bookings.docs.some(
            (s) =>
              (ACTIVE.includes(s.data().status) &&
                (s.data().endAt || Infinity) > now()) ||
              (s.data().schemaVersion !== 2 && legacyActive(s.data().status)) ||
              s.data().refundStatus === "requested",
          ) ||
          matches.docs.some(
            (s) => s.data().status === "open" && s.data().endAt > now(),
          )
        )
          fail("active-transactions-prevent-deletion");
        tx.set(
          ref("Users", uid),
          { deletionRequested: true, updatedAt: now() },
          { merge: true },
        );
        tx.set(
          ref("AccountDeletions", uid),
          { status: "pending", requestedAt: now() },
          { merge: true },
        );
      });
      await finishAccountDeletion(db, { bucket, auth }, uid, now());
      return { deleted: true };
    }
    fail("unknown-action", "invalid-argument");
  };
}
