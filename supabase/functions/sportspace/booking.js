import { bookingCourtIds } from "./selection.js";

// Imported records keep legacy fields in raw_data. Explicit columns win,
// including an explicit inactive status; availability is only a legacy signal.
export function bookingRecord(row) {
  if (!row) return null;
  const result = { ...(row.raw_data || {}) };
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && value !== undefined) result[key] = value;
  }
  return result;
}

export function activeCourt(row) {
  const court = bookingRecord(row);
  if (!court || court.is_available === false) return false;
  return court.status ? ["active", "Đang hoạt động"].includes(court.status) : court.is_available === true;
}

export function availabilityRange(row, now) {
  const item = bookingRecord(row);
  const status = String(item.status || "").toLowerCase();
  if (["available", "expired", "cancelled", "rejected"].includes(status) || (item.expiresAt != null && Number(item.expiresAt) <= now)) return null;
  const startAt = Number(item.startAt) || Date.parse(`${item.date}T${item.start_time}:00+07:00`);
  let endAt = Number(item.endAt) || Date.parse(`${item.date}T${item.end_time}:00+07:00`);
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) throw new Error("legacy-schedule-needs-review");
  if (endAt <= startAt) endAt += 86400000;
  return { startAt, endAt };
}

export function bookingSetup(facilityRow, courtRow, paymentRow) {
  const facility = bookingRecord(facilityRow);
  const court = bookingRecord(courtRow);
  const payment = bookingRecord(paymentRow);
  if (!facility || !activeCourt(court) || ["archived", "inactive", "maintenance"].includes(facility.status))
    throw new Error("court-not-bookable");
  if (![facility.id, facility.facility_id].filter(Boolean).includes(court.facilityId || court.facility_id))
    throw new Error("court-not-bookable");
  if (!facility.ownerId) throw new Error("facility-owner-not-configured");
  for (const key of ["basePrice", "price_day", "price_night", "price_weekend"]) {
    if (court[key] != null) {
      const amount = Number(court[key]);
      if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("missing-price");
      court[key] = amount;
    }
  }
  if (!payment?.verifiedAt || !/^\d{6}$/.test(payment.bin || "") ||
      !/^\d{5,30}$/.test(payment.account || "") || !String(payment.name || "").trim())
    throw new Error("payment-not-configured");
  return { facility, court, payment: { bin: payment.bin, account: payment.account, name: payment.name } };
}

export function receiptPatch(booking, uid, path, now) {
  if (!booking || booking.userId !== uid) throw new Error("not-your-booking");
  if (typeof path !== "string" || !path.startsWith(`receipts/${uid}/${booking.id}/`) ||
      path.includes("..") || !path.split("/").at(-1)) throw new Error("invalid-receipt-path");
  if (booking.status === "pending_approval" && booking.receiptPath === path) return null;
  if (booking.status !== "held" || booking.holdExpiresAt <= now) throw new Error("hold-expired");
  return { receiptPath: path, receiptBucket: "sportspace-receipts", status: "pending_approval", paymentStatus: "pending_verification", updatedAt: now };
}

export function transitionPatch(b, uid, data, now) {
  if (!b || b.schemaVersion !== 2) throw new Error("legacy-booking-needs-review");
  const op = data.operation;
  if ((op === "cancel" ? b.userId : b.ownerId) !== uid) throw new Error("not-your-booking");
  const reference = String(data.reference || "").trim().slice(0, 100);
  if (op === "approve") {
    if (b.status === "confirmed") return null;
    if (b.status !== "pending_approval" || !b.receiptPath || !reference || data.amount !== Number(b.totalAmount))
      throw new Error("payment-verification-required");
    if (b.holdExpiresAt <= now) throw new Error("hold-expired");
    return { status: "confirmed", paymentStatus: "paid", depositPaid: Number(b.totalAmount), paymentReference: reference, verifiedBy: uid, updatedAt: now };
  }
  if (op === "cancel" || op === "reject") {
    if (["cancelled", "rejected"].includes(b.status)) return null;
    if (!["held", "pending_approval", "confirmed"].includes(b.status)) throw new Error("booking-not-active");
    const due = b.paymentStatus === "paid" && (op === "reject" || b.startAt - now >= 12 * 3600000) ? Number(b.depositPaid) : 0;
    return { status: op === "cancel" ? "cancelled" : "rejected", refundAmount: due, refundStatus: due > 0 ? "requested" : "none", cancelledAt: now, updatedAt: now };
  }
  if (op === "refund") {
    if (b.refundStatus === "refunded") return null;
    if (b.refundStatus !== "requested" || !reference || data.amount !== Number(b.refundAmount)) throw new Error("refund-verification-required");
    return { refundStatus: "refunded", refundedAmount: Number(b.refundAmount), refundReference: reference, refundedAt: now, updatedAt: now };
  }
  if (op === "recordLatePayment") {
    const expired = ["held", "pending_approval"].includes(b.status) && b.holdExpiresAt <= now;
    if ((!expired && !["expired", "cancelled", "rejected"].includes(b.status)) || b.paymentStatus === "paid" || !reference || data.amount !== Number(b.totalAmount))
      throw new Error("late-payment-verification-required");
    return { ...(expired ? { status: "expired" } : {}), paymentStatus: "paid", depositPaid: Number(b.totalAmount), paymentReference: reference, refundAmount: Number(b.totalAmount), refundStatus: "requested", verifiedBy: uid, updatedAt: now };
  }
  throw new Error("invalid-operation");
}

export async function mutateBooking(sql, uid, data, action, now, validateReceipt) {
  return sql.begin(async (tx) => {
    const [b] = await tx`SELECT * FROM "Bookings" WHERE id = ${data.bookingId} FOR UPDATE`;
    const patch = action === "submitReceipt" ? receiptPatch(b, uid, data.path, now) : transitionPatch(b, uid, data, now);
    if (!patch) return b;
    // Serializes overlapping holds and transitions, including expiry/rebooking.
    for (const courtId of bookingCourtIds(b)) {
      await tx`SELECT id FROM "Courts" WHERE id = ${courtId} FOR UPDATE`;
    }
    if (action === "submitReceipt" || data.operation === "approve") {
      const locks = await tx`SELECT * FROM "SlotLocks" WHERE "bookingId" = ${b.id}`;
      if (!Array.isArray(b.lockIds) || !b.lockIds.length ||
          b.lockIds.some((key) => !locks.some((s) => s.id === key && s.expiresAt > now))) throw new Error("hold-expired");
    }
    if (action === "submitReceipt") await validateReceipt(data.path);
    const op = data.operation;
    if (action === "bookingTransition" && ["approve", "refund", "recordLatePayment"].includes(op)) {
      const reference = patch.paymentReference || patch.refundReference;
      const kind = op === "refund" ? "refund" : "payment";
      const amount = op === "refund" ? Number(b.refundAmount) : Number(b.totalAmount);
      const inserted = await tx`
        INSERT INTO "PaymentReferences" ("ownerId", reference, "bookingId", kind, amount)
        VALUES (${b.ownerId}, ${reference}, ${b.id}, ${kind}, ${amount})
        ON CONFLICT ("ownerId", reference) DO NOTHING RETURNING "bookingId"`;
      if (!inserted.length) throw new Error("payment-reference-already-used");
      await tx`INSERT INTO "Ledger" (id, "bookingId", "ownerId", "facilityId", delta, reference, at)
        VALUES (${`${b.id}:${op}`}, ${b.id}, ${b.ownerId}, ${b.facilityId}, ${kind === "refund" ? -amount : amount}, ${reference}, ${now})`;
    }
    if (action === "bookingTransition" && op === "approve") {
      await tx`UPDATE "SlotLocks" SET "expiresAt" = ${b.endAt} WHERE "bookingId" = ${b.id}`;
      await tx`UPDATE "Availability" SET "expiresAt" = ${b.endAt}, status = 'confirmed' WHERE "bookingId" = ${b.id}`;
    } else if (["cancelled", "rejected", "expired"].includes(patch.status)) {
      // Scope by bookingId so a replacement reservation can never be released.
      await tx`DELETE FROM "SlotLocks" WHERE "bookingId" = ${b.id}`;
      await tx`DELETE FROM "Availability" WHERE "bookingId" = ${b.id}`;
    }
    await tx`UPDATE "Bookings" SET ${tx(patch)} WHERE id = ${b.id}`;
    const recipient = action === "submitReceipt" || op === "cancel" ? b.ownerId : b.userId;
    await tx`INSERT INTO "Notifications" (id, "userId", message, "messageEn")
      VALUES (${`${b.id}:${action === "submitReceipt" ? "receipt" : op}`}, ${recipient},
      ${`Đơn ${b.ticketId}: ${patch.status || patch.refundStatus}`}, ${`Order ${b.ticketId}: ${patch.status || patch.refundStatus}`})
      ON CONFLICT (id) DO NOTHING`;
    return { ...b, ...patch };
  });
}
