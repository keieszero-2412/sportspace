import test from "node:test";
import assert from "node:assert/strict";
import {
  localDate,
  interval,
  overlaps,
  lockIds,
  quote,
  refundDue,
  joinMatch,
} from "../domain.js";
test("Vietnam midnight and overnight opening remain on correct dates", () => {
  assert.equal(localDate(new Date("2026-10-03T00:30:00+07:00")), "2026-10-03");
  const r = interval("2026-10-03", "01:00", 60, "18:00-02:00");
  assert.equal(new Date(r.startAt).toISOString(), "2026-10-03T18:00:00.000Z");
  assert.throws(() => interval("2026-10-03", "01:30", 60, "18:00-02:00"));
  assert.throws(() => interval("2026-02-31", "12:00", 30, "06:00-22:00"));
});
test("all durations use overlapping 30 minute locks; adjacent bookings are valid", () => {
  const a = interval("2026-10-03", "09:30", 60, "06:00-22:00");
  const b = interval("2026-10-03", "10:00", 120, "06:00-22:00");
  const c = interval("2026-10-03", "10:30", 30, "06:00-22:00");
  assert.equal(overlaps(a, b), true);
  assert.equal(overlaps(a, c), false);
  assert.ok(
    lockIds("court", [a]).some((k) => lockIds("court", [b]).includes(k)),
  );
  assert.throws(() => interval("2026-10-03", "21:30", 120, "06:00-22:00"));
});
test("quote splits time across weekday/weekend/peak boundaries", () => {
  const f = {
    pricing: {
      enabled: true,
      peakStart: "17:00",
      peakEnd: "21:00",
      peakPercent: 20,
      weekendPercent: 10,
    },
  };
  const r = interval("2026-10-02", "16:30", 60, "06:00-22:00");
  assert.equal(quote({ basePrice: 100000 }, f, [r]), 110000);
  const weekend = interval("2026-10-03", "18:00", 60, "06:00-22:00");
  assert.equal(quote({ basePrice: 100000 }, f, [weekend]), 130000);
  assert.throws(() => quote({}, f, [r]));
});
test("refund policy includes exactly twelve hours and only verified money", () => {
  const t = Date.parse("2026-10-03T00:00:00+07:00");
  const b = {
    startAt: t + 12 * 3600000,
    paymentStatus: "paid",
    depositPaid: 100000,
  };
  assert.equal(refundDue(b, t), 100000);
  assert.equal(refundDue(b, t + 1), 0);
  assert.equal(
    refundDue({ ...b, paymentStatus: "pending_verification" }, t),
    0,
  );
});
test("joining is idempotent for the same user, respects capacity and expiry", () => {
  const m = {
    status: "open",
    startAt: 200,
    playersMax: 2,
    joinedUsers: ["host"],
  };
  const users = joinMatch(m, "guest", 100);
  assert.deepEqual(users, ["host", "guest"]);
  assert.deepEqual(
    joinMatch({ ...m, joinedUsers: users }, "guest", 100),
    users,
  );
  assert.throws(() => joinMatch({ ...m, joinedUsers: users }, "another", 100));
  assert.throws(() => joinMatch(m, "guest", 200));
});
