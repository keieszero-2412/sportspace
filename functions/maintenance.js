import { createHash } from "node:crypto";

const notificationId = (key) => createHash("sha256").update(key).digest("hex");
export async function maintainBookings(db, now = Date.now()) {
  const expired = await db
    .collection("Bookings")
    .where("status", "in", ["held", "pending_approval"])
    .where("holdExpiresAt", "<=", now)
    .limit(200)
    .get();
  for (const s of expired.docs)
    await db.runTransaction(async (tx) => {
      const b = (await tx.get(s.ref)).data();
      if (
        !["held", "pending_approval"].includes(b.status) ||
        b.holdExpiresAt > now
      )
        return;
      const locks = await Promise.all(
        (b.lockIds || []).map((k) => tx.get(db.doc(`SlotLocks/${k}`))),
      );
      tx.update(s.ref, { status: "expired", updatedAt: now });
      locks.forEach((l) => {
        if (l.data()?.bookingId === s.id) {
          tx.delete(l.ref);
          tx.delete(db.doc(`Availability/${l.id}`));
        }
      });
      for (const uid of new Set([b.userId, b.ownerId].filter(Boolean)))
        tx.set(
          db.doc(`Notifications/${notificationId(`${s.id}:expired:${uid}`)}`),
          {
            userId: uid,
            title: "SportSpace",
            type: "booking",
            read: false,
            createdAt: now,
            message: `Đơn ${b.ticketId} hết hạn giữ sân. Khoản chuyển đến muộn cần chủ sân đối soát để hoàn tiền.`,
            messageEn: `Hold ${b.ticketId} expired. Late transfers need owner reconciliation and a refund.`,
          },
        );
    });
  const upcoming = await db
    .collection("Bookings")
    .where("status", "==", "confirmed")
    .where("startAt", ">", now)
    .where("startAt", "<=", now + 3600000)
    .limit(200)
    .get();
  for (const s of upcoming.docs)
    await db.runTransaction(async (tx) => {
      const b = (await tx.get(s.ref)).data();
      const r = db.doc(
        `Notifications/${notificationId(`${s.id}:reminder:${b.userId}`)}`,
      );
      const sent = await tx.get(r);
      if (sent.exists || b.status !== "confirmed") return;
      tx.set(r, {
        userId: b.userId,
        title: "SportSpace",
        type: "reminder",
        read: false,
        createdAt: now,
        message: `Sắp đến lịch ${b.courtName} tại ${b.venueName}: ${b.date} ${b.time}.`,
        messageEn: `Upcoming ${b.courtName} at ${b.venueName}: ${b.date} ${b.time}.`,
      });
    });
}

export async function finishAccountDeletion(
  db,
  { bucket, auth },
  uid,
  now = Date.now(),
) {
  const job = db.doc(`AccountDeletions/${uid}`);
  if ((await job.get()).data()?.status === "done") return;
  if (bucket)
    await Promise.all(
      ["merchant_documents", "receipts"].map((prefix) =>
        bucket.deleteFiles({ prefix: `${prefix}/${uid}/` }),
      ),
    );
  // Retain financial identifiers while removing customer contact information.
  for (const [col, field, mode] of [
    ["Bookings", "userId", "booking"],
    ["Reviews", "userId", "review"],
    ["Matches", "hostId", "host"],
    ["Matches", "joinedUsers", "member"],
    ["Notifications", "userId", "delete"],
    ["CredibilityEvents", "userId", "delete"],
  ]) {
    const snap = await db
      .collection(col)
      .where(field, mode === "member" ? "array-contains" : "==", uid)
      .get();
    for (const s of snap.docs)
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(s.ref)).data();
        if (!current) return;
        if (mode === "delete") tx.delete(s.ref);
        else if (mode === "booking")
          tx.update(s.ref, {
            customerName: "Deleted user",
            phone: "",
            note: "",
            receiptPath: null,
            anonymizedAt: now,
          });
        else if (mode === "review")
          tx.update(s.ref, { user: "Deleted user", anonymizedAt: now });
        else if (mode === "host")
          tx.update(s.ref, {
            hostName: "Deleted user",
            hostCredibility: null,
            anonymizedAt: now,
          });
        else {
          const users = (current.joinedUsers || []).filter((u) => u !== uid),
            names = { ...current.memberNames };
          delete names[uid];
          tx.update(s.ref, {
            joinedUsers: users,
            playersJoined: users.length,
            memberNames: names,
          });
        }
      });
  }
  // Auth is removed last so the authenticated caller can retry a failed cleanup.
  await db.doc(`MerchantApplications/${uid}`).delete();
  try {
    await auth.deleteUser(uid);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
  }
  await db.doc(`Users/${uid}`).delete();
  await job.set({ status: "done", completedAt: now }, { merge: true });
}

export async function cleanOrphanCourtPhotos(db, bucket, now = Date.now()) {
  const courts = await db.collection("Courts").select("imageUrl").get(),
    used = new Set();
  for (const s of courts.docs) {
    try {
      const path = new URL(s.data().imageUrl).pathname.match(/\/o\/(.+)$/);
      if (path) used.add(decodeURIComponent(path[1]));
    } catch {}
  }
  // Restrict cleanup to generated court photos older than one day, leaving active uploads alone.
  for await (const file of bucket.getFilesStream({ prefix: "court_photos/" })) {
    if (used.has(file.name) || !/^court_photos\/[^/]+\/[^/]+$/.test(file.name))
      continue;
    const [meta] = await file.getMetadata();
    if (Date.parse(meta.timeCreated) < now - 86400000)
      await file.delete({
        ignoreNotFound: true,
        ifGenerationMatch: meta.generation,
      });
  }
}
