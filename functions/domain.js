export const ZONE = "Asia/Ho_Chi_Minh";
export const HOLD_MS = 10 * 60 * 1000;
export const ACTIVE = ["held", "pending_approval", "confirmed"];
export function localDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function minutes(value) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) throw new Error("invalid-time");
  const [h, m] = value.split(":").map(Number);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) throw new Error("invalid-time");
  return h * 60 + m;
}
export function opening(hours) {
  const parts = (hours || "").split(/\s*[-–]\s*/);
  if (parts.length !== 2) throw new Error("missing-operating-hours");
  const start = minutes(parts[0]);
  let end = minutes(parts[1]);
  if (end <= start) end += 1440;
  return { start, end };
}
export function dateTime(date, minute) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("invalid-date");
  const base = Date.parse(`${date}T00:00:00+07:00`);
  if (!Number.isFinite(base) || localDate(new Date(base)) !== date)
    throw new Error("invalid-date");
  return base + minute * 60000;
}
export function interval(date, time, duration, hours) {
  if (![30, 60, 120].includes(duration)) throw new Error("invalid-duration");
  const bounds = opening(hours);
  let start = minutes(time);
  if (start < bounds.start) start += 1440;
  if (start < bounds.start || start + duration > bounds.end || start % 30 !== 0)
    throw new Error("outside-opening-hours");
  return {
    startAt: dateTime(date, start),
    endAt: dateTime(date, start + duration),
  };
}
export const overlaps = (a, b) => a.startAt < b.endAt && b.startAt < a.endAt;
export function lockIds(courtId, ranges) {
  return [
    ...new Set(
      ranges.flatMap((r) => {
        const ids = [];
        for (let t = r.startAt; t < r.endAt; t += 30 * 60000)
          ids.push(`${courtId}_${t}`);
        return ids;
      }),
    ),
  ].sort();
}
export function quote(court, facility, ranges) {
  const price = court.basePrice || court.price_day || court.price_night || 0;
  if (!Number.isSafeInteger(price) || price <= 0)
    throw new Error("missing-price");
  const pricing = facility.pricing || {};
  let total = 0;
  for (const r of ranges) {
    for (let t = r.startAt; t < r.endAt; t += 30 * 60000) {
      const d = new Date(t + 7 * 3600000);
      const weekend = [0, 6].includes(d.getUTCDay());
      const min = d.getUTCHours() * 60 + d.getUTCMinutes();
      const peakStart = minutes(pricing.peakStart || "17:00");
      const peakEnd = minutes(pricing.peakEnd || "21:00");
      const peak =
        peakStart <= peakEnd
          ? min >= peakStart && min < peakEnd
          : min >= peakStart || min < peakEnd;
      const increase = pricing.enabled
        ? (weekend ? Number(pricing.weekendPercent || 0) : 0) +
        (peak ? Number(pricing.peakPercent || 0) : 0)
        : 0;
      total += Math.round((price * (1 + increase / 100)) / 2);
    }
  }
  if (!Number.isSafeInteger(total) || total <= 0)
    throw new Error("invalid-price");
  return total;
}
export function refundDue(booking, now) {
  return booking.paymentStatus === "paid" &&
    booking.startAt - now >= 12 * 3600000
    ? Math.max(0, booking.depositPaid || 0)
    : 0;
}
export function normalize(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}
export function joinMatch(match, uid, now) {
  if (
    match.status !== "open" ||
    !Number.isFinite(match.startAt) ||
    match.startAt <= now
  )
    throw new Error("match-closed");
  const users = [...new Set(match.joinedUsers || [])];
  if (users.includes(uid)) return users;
  if (users.length >= match.playersMax) throw new Error("match-full");
  return [...users, uid];
}
export function bookingLabel(booking, lang = "vi") {
  const labels = {
    held: ["Chờ chuyển khoản", "Awaiting transfer"],
    pending_approval: [
      "Chờ xác minh biên lai",
      "Receipt awaiting verification",
    ],
    confirmed: ["Đã xác nhận", "Confirmed"],
    approved: ["Đã duyệt (đơn cũ)", "Approved (legacy)"],
    pending: ["Đang chờ (đơn cũ)", "Pending (legacy)"],
    cancelled: ["Đã hủy", "Cancelled"],
    rejected: ["Đã từ chối", "Rejected"],
    completed: ["Đã hoàn tất", "Completed"],
    expired: ["Hết hạn giữ chỗ", "Hold expired"],
  };
  const base = (labels[booking.status] || [
    booking.status || "Không rõ",
    booking.status || "Unknown",
  ])[lang === "vi" ? 0 : 1];
  const refund =
    booking.refundStatus === "requested"
      ? lang === "vi"
        ? " · Chờ hoàn tiền"
        : " · Refund requested"
      : booking.refundStatus === "refunded"
        ? lang === "vi"
          ? " · Đã xác nhận hoàn tiền"
          : " · Refund verified"
        : "";
  return base + refund;
}
