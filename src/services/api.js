import { httpsCallable } from "firebase/functions";
import { functions, db, storage } from "../firebase";
import {
  collection,
  query,
  where,
  limit,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, getBlob } from "firebase/storage";
import { listPublicVenues, publicCatalogue } from "./publicVenues";
const errors = {
  "payment-verification-required":
    "Cần biên lai còn hạn, số tiền đúng và mã giao dịch đã kiểm tra. / Verify an unexpired receipt, the exact amount and the bank transaction reference.",
  "refund-verification-required":
    "Cần yêu cầu hoàn hợp lệ, số tiền đúng và mã giao dịch hoàn đã kiểm tra. / Verify a valid refund request, the exact amount and refund reference.",
  "payment-reference-already-used":
    "Mã giao dịch này đã được dùng; kiểm tra lại sao kê. / This transaction reference is already used; check the statement.",
  "court-has-active-bookings":
    "Sân còn lịch đang giữ hoặc đã xác nhận; cần xử lý lịch trước. / Resolve active reservations before closing this court.",
  "transfer-facilities-before-deletion":
    "Cần chuyển quyền quản lý cơ sở trước khi xóa tài khoản chủ sân. / Transfer your facilities before deleting a merchant account.",
  "account-deleting":
    "Tài khoản đang được xóa; các thay đổi mới đã bị khóa. / Account deletion is in progress; new changes are blocked.",
  "match-full": "Kèo đã đủ người. / The match is full.",
  "match-closed":
    "Kèo đã đóng hoặc quá giờ tham gia. / The match is closed or already started.",
  "payment-not-configured":
    "Chủ sân chưa có tài khoản nhận tiền được xác minh. / The payment account is not verified.",
  "slot-taken":
    "Giờ này vừa được giữ bởi người khác. / This time was just reserved.",
  "legacy-schedule-needs-review":
    "Lịch cũ cần chủ sân đối soát trước khi nhận đơn mới. / The legacy schedule needs review.",
  "legacy-booking-needs-review":
    "Đơn cũ cần được đối soát trước khi xử lý. / This legacy order needs review.",
  "hold-expired": "Đã hết hạn giữ sân. / The hold expired.",
  "court-not-bookable":
    "Sân chưa đủ dữ liệu hoặc đang ngừng hoạt động. / Court data is incomplete or inactive.",
  "owner-required":
    "Bạn không có quyền quản lý cơ sở này. / You do not own this facility.",
  "active-transactions-prevent-deletion":
    "Cần xử lý đơn hoặc kèo đang hoạt động trước khi xóa tài khoản. / Resolve active orders or matches first.",
};
const publicCache = new Map();
const inFlight = new Map();
const cacheStorageKey = `sportspace:public-catalogue:v3:${db.app.options.projectId}`;
try {
  const entries = JSON.parse(localStorage.getItem(cacheStorageKey) || "[]");
  if (Array.isArray(entries))
    for (const [key, item] of entries.slice(-30))
      if (item?.until > Date.now()) publicCache.set(key, item);
} catch {
  // Storage may be disabled or contain an obsolete cache; live reads still work.
}
function persistPublicCache() {
  try {
    localStorage.setItem(cacheStorageKey, JSON.stringify([...publicCache]));
  } catch {
    // A full or unavailable browser store must never prevent loading venues.
  }
}
export function cachedApi(action, data = {}) {
  const item = publicCache.get(JSON.stringify([action, data]));
  return item && item.until > Date.now() ? item.value : undefined;
}
export async function api(action, data = {}) {
  const publicRead =
      action === "catalogue" ||
      (action === "listVenues" && !(data.availableDate && data.availableTime)),
    cacheable = publicRead,
    key = JSON.stringify([action, data]);
  if (cacheable) {
    const value = cachedApi(action, data);
    if (value !== undefined) return value;
  }
  try {
    if (cacheable && inFlight.has(key)) return await inFlight.get(key);
    const task = publicRead
      ? action === "catalogue"
        ? publicCatalogue()
        : listPublicVenues(data)
      : httpsCallable(
          functions,
          "sportspace",
        )({ ...data, action }).then((result) => result.data);
    if (cacheable) inFlight.set(key, task);
    const result = await task;
    if (cacheable) {
      if (publicCache.size >= 30)
        publicCache.delete(publicCache.keys().next().value);
      publicCache.set(key, {
        value: result,
        until: Date.now() + (action === "catalogue" ? 15 : 5) * 60000,
      });
      persistPublicCache();
    } else if (["saveCourt", "archiveCourt", "saveFacility"].includes(action)) {
      publicCache.clear();
      persistPublicCache();
    }
    return result;
  } catch (e) {
    const error = new Error(
      errors[e.message] ||
        (e.code === "functions/not-found"
          ? "Backend chưa được triển khai. / Backend has not been deployed."
          : e.message),
    );
    error.code = e.code;
    throw error;
  } finally {
    if (cacheable) inFlight.delete(key);
  }
}
export const rows = (snapshot) =>
  snapshot.docs.map((s) => ({ ...s.data(), id: s.id }));
export function watch(col, filters, callback, error, options = {}) {
  const constraints = filters.map(([field, op, value]) =>
    where(field, op, value),
  );
  if (options.order)
    constraints.push(orderBy(options.order, options.direction || "desc"));
  constraints.push(limit(options.limit || 100));
  return onSnapshot(
    query(collection(db, col), ...constraints),
    (s) => callback(rows(s)),
    error,
  );
}
export function watchProfile(uid, callback, error) {
  return onSnapshot(
    doc(db, "Users", uid),
    (s) => callback(s.exists() ? { ...s.data(), uid } : null),
    error,
  );
}
export async function uploadImage(file, path) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file?.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error(
      "Chỉ nhận ảnh JPG, PNG, WebP tối đa 5 MB. / Images up to 5 MB only.",
    );
  const target = ref(storage, `${path}/${crypto.randomUUID()}`);
  await uploadBytes(target, file, { contentType: file.type });
  return {
    path: target.fullPath,
    url: path.startsWith("court_photos/") ? await getDownloadURL(target) : null,
  };
}
export async function openPrivateImage(path) {
  const blob = await getBlob(ref(storage, path));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "receipt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export const markRead = (id) =>
  updateDoc(doc(db, "Notifications", id), { read: true });
export async function markAllRead(notifications) {
  const batch = writeBatch(db);
  notifications
    .filter((n) => !n.read)
    .forEach((n) =>
      batch.update(doc(db, "Notifications", n.id), { read: true }),
    );
  await batch.commit();
}
export async function getVenue(id) {
  const s = await getDoc(doc(db, "Facilities", id));
  return s.exists() ? { ...s.data(), id: s.id } : null;
}
