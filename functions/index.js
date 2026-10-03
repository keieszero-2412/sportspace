import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { createService, DomainError } from "./service.js";
import {
  maintainBookings,
  finishAccountDeletion,
  cleanOrphanCourtPhotos,
} from "./maintenance.js";
initializeApp();
const db = getFirestore();
const service = createService(db, {
  bucket: getStorage().bucket(),
  auth: getAuth(),
});
export const sportspace = onCall(
  { region: "asia-southeast1", timeoutSeconds: 120, maxInstances: 10 },
  async (request) => {
    try {
      const actor = request.auth
        ? {
            uid: request.auth.uid,
            email: request.auth.token.email,
            admin: request.auth.token.admin === true,
            authTime: request.auth.token.auth_time,
          }
        : null;
      return await service(actor, request.data);
    } catch (e) {
      if (e instanceof DomainError) throw new HttpsError(e.code, e.message);
      if (/^(invalid|missing|outside|match)-/.test(e.message))
        throw new HttpsError("failed-precondition", e.message);
      console.error("sportspace action failed", {
        action: request.data?.action,
        code: e.code || "internal",
      });
      throw new HttpsError(
        "internal",
        "Không thể hoàn tất thao tác. Vui lòng thử lại.",
      );
    }
  },
);
export const cleanCourtPhotos = onSchedule(
  {
    region: "asia-southeast1",
    schedule: "every day 03:00",
    timeZone: "Asia/Ho_Chi_Minh",
  },
  () => cleanOrphanCourtPhotos(db, getStorage().bucket()),
);
export const expireHolds = onSchedule(
  { region: "asia-southeast1", schedule: "every 5 minutes" },
  async () => {
    await maintainBookings(db);
    const pending = await db
      .collection("AccountDeletions")
      .where("status", "==", "pending")
      .limit(20)
      .get();
    for (const s of pending.docs) {
      try {
        await finishAccountDeletion(
          db,
          { bucket: getStorage().bucket(), auth: getAuth() },
          s.id,
        );
      } catch {
        console.error("Account deletion cleanup needs retry");
      }
    }
  },
);
