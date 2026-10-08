import { supabase } from "../supabase";
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
  "credibility-too-low":
    "Cần trên 80 điểm uy tín để tạo kèo. / A credibility score above 80 is required to create a match.",
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
  WORKER_RESOURCE_LIMIT:
    "Dịch vụ đặt sân đang quá tải hoặc chưa cấu hình kết nối máy chủ. Vui lòng thử lại sau ít phút. / Booking service is overloaded or missing its server connection. Please try again in a few minutes.",
  "database-not-configured":
    "Chức năng đặt sân chưa được cấu hình kết nối cơ sở dữ liệu. Vui lòng báo quản trị viên. / Booking database connection is not configured. Please contact an administrator.",
};
const publicCache = new Map();
const inFlight = new Map();
const cacheStorageKey = `sportspace:public-catalogue:v5:supabase-bundled-fallback`;
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
      : (async () => {
          const { data: res, error } = await supabase.functions.invoke("sportspace", {
            body: { action, data },
            timeout: 15000,
          });
          if (error) {
            // Try to extract real error body from FunctionsHttpError
            if (error.context) {
              try {
                const body = await error.context.json();
                console.error("Backend Error:", body);
                let msg = body.error || error.message;
                if (body.detail) msg += " | " + body.detail;
                if (body.hint) msg += " | hint: " + body.hint;
                if (body.code) msg += " | code: " + body.code;
                throw new Error(msg);
              } catch (e2) {
                if (e2 !== error) throw e2;
              }
            }
            throw error;
          }
          if (res?.error) {
            let msg = res.error;
            if (res.detail) msg += " | " + res.detail;
            if (res.hint) msg += " | hint: " + res.hint;
            if (res.code) msg += " | code: " + res.code;
            console.error("Backend Error:", res);
            throw new Error(msg);
          }
          return res?.data;
        })();
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
export function watch(col, filters, callback, error, options = {}) {
  const fetchQuery = () => {
    let q = supabase.from(col).select('*');
    filters.forEach(([field, op, value]) => {
      if (op === '==') q = q.eq(field, value);
      else if (op === '>') q = q.gt(field, value);
      else if (op === '<') q = q.lt(field, value);
      else if (op === '>=') q = q.gte(field, value);
      else if (op === '<=') q = q.lte(field, value);
      else if (op === 'in') q = q.in(field, value);
    });
    if (options.order) q = q.order(options.order, { ascending: options.direction === 'asc' });
    q = q.limit(options.limit || 100);
    return q;
  };

  let channel;
  let stopped = false;
  fetchQuery().then(({ data, error: err }) => {
    if (stopped) return;
    if (err) {
      console.error(`watch error on ${col}:`, err);
      if (!(options.optional && err.code === "PGRST205") && error) error(err);
      return;
    }
    callback(data || []);
    channel = supabase
      .channel(`${col}:${JSON.stringify(filters)}:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: col }, () => {
        fetchQuery().then(({ data: nextData, error: nextError }) => {
          if (!nextError) callback(nextData || []);
        });
      })
      .subscribe();
  });

  return () => {
    stopped = true;
    if (channel) supabase.removeChannel(channel);
  };
}

export function watchProfile(uid, callback, errorCb) {
  let stopped = false;
  const formatUser = (data) =>
    data ? { ...(data.raw_data || {}), ...data, uid: data.uid || data.id || uid } : null;

  const refresh = async () => {
    try {
      const { data, error: err } = await supabase.from('Users').select('*').eq('id', uid).maybeSingle();
      if (stopped) return;
      if (err) errorCb?.(err);
      else callback(formatUser(data));
    } catch (err) {
      if (!stopped) errorCb?.(err);
    }
  };
  void refresh();

  const channel = supabase.channel(`Users:${uid}:${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'Users', filter: `id=eq.${uid}` }, refresh).subscribe();
    
  return () => { stopped = true; supabase.removeChannel(channel); };
}

export async function uploadImage(file, path) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file?.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Chỉ nhận ảnh JPG, PNG, WebP tối đa 5 MB. / Images up to 5 MB only.");
    
  const fileName = `${path}/${crypto.randomUUID()}`;
  const { data, error } = await supabase.storage.from('sportspace').upload(fileName, file, { contentType: file.type });
  if (error) throw error;
  
  const { data: urlData } = supabase.storage.from('sportspace').getPublicUrl(fileName);
  return {
    path: fileName,
    url: path.startsWith("court_photos/") ? urlData.publicUrl : null,
  };
}

export async function openPrivateImage(path) {
  const { data, error } = await supabase.storage.from('sportspace').download(path);
  if (error) throw error;
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "receipt";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export const markRead = async (id) => {
  await supabase.from('Notifications').update({ read: true }).eq('id', id);
};

export async function markAllRead(notifications) {
  const ids = notifications.filter((n) => !n.read).map(n => n.id);
  if (ids.length > 0) {
    await supabase.from('Notifications').update({ read: true }).in('id', ids);
  }
}

export async function getVenue(id) {
  const { data, error } = await supabase.from('Facilities').select('*').eq('id', id).single();
  return data || null;
}
