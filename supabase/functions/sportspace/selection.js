// Shared client/server validation. Times are ordered as service-date intervals,
// rather than clock strings, so overnight opening hours work as well.
export function normalizeSelections(data) {
  const input = data.selections === undefined
    ? [{ courtId: data.courtId, times: data.times }]
    : data.selections;
  if (!Array.isArray(input) || !input.length || input.length > 16) throw new Error("select-time");
  const grouped = new Map();
  let count = 0;
  for (const item of input) {
    if (!item || typeof item.courtId !== "string" || !item.courtId.trim() || item.courtId.includes("/") ||
        !Array.isArray(item.times) || !item.times.length) throw new Error("select-time");
    const times = grouped.get(item.courtId) || new Set();
    for (const time of item.times) {
      if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) throw new Error("invalid-time");
      if (++count > 16) throw new Error("too-many-booking-slots");
      times.add(time);
    }
    grouped.set(item.courtId, times);
  }
  return [...grouped].sort(([a], [b]) => a.localeCompare(b))
    .map(([courtId, times]) => ({ courtId, times: [...times].sort() }));
}

export function selectionRanges(selection, date, duration, hours, interval) {
  const ranges = selection.times.map((time) => ({ ...interval(date, time, duration, hours), time }))
    .sort((a, b) => a.startAt - b.startAt);
  for (let i = 1; i < ranges.length; i++) {
    const gap = ranges[i].startAt - ranges[i - 1].endAt;
    if (gap < 0) throw new Error("invalid-interval");
    if (gap === duration * 60000) throw new Error("single-slot-gap");
  }
  return ranges;
}

export function bookingCourtIds(booking) {
  const items = booking.raw_data?.bookingItems;
  return [...new Set(Array.isArray(items) && items.length ? items.map((item) => item.courtId) : [booking.courtId])].sort();
}
