import React, { useEffect, useMemo, useState } from "react";
import { api, watch, uploadImage, openPrivateImage } from "../services/api";
import {
  localDate,
  opening,
  dateTime,
  overlaps,
  bookingLabel,
} from "../../functions/domain";
import { useToast } from "./ToastContext";
import AsyncStatus from "./AsyncStatus";
import ConfirmModal from "./ConfirmModal";
export default function MerchantDashboard({ lang = "vi", userProfile }) {
  const tr = (vi, en) => (lang === "vi" ? vi : en),
    { showError, showSuccess, showInfo } = useToast();
  const [tab, setTab] = useState("overview"),
    [facilities, setFacilities] = useState([]),
    [facilityId, setFacilityId] = useState("");
  const [courts, setCourts] = useState([]),
    [bookings, setBookings] = useState([]),
    [reviews, setReviews] = useState([]),
    [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(null),
    [retry, setRetry] = useState(0),
    [date, setDate] = useState(localDate());
  const [busy, setBusy] = useState(false),
    [courtForm, setCourtForm] = useState(null),
    [file, setFile] = useState(null),
    [action, setAction] = useState(null);
  const [reference, setReference] = useState(""),
    [amount, setAmount] = useState(""),
    [reply, setReply] = useState({});
  const [financialStats, setFinancialStats] = useState({
      revenueToday: null,
      revenueWeek: null,
      occupancy: null,
    }),
    [moreBookings, setMoreBookings] = useState([]),
    [hasOlder, setHasOlder] = useState(true);
  const [pricing, setPricing] = useState({
      enabled: false,
      peakStart: "17:00",
      peakEnd: "21:00",
      peakPercent: 0,
      weekendPercent: 0,
    }),
    [hours, setHours] = useState("");
  const facility = facilities.find((f) => f.id === facilityId);
  useEffect(() => {
    setLoading(true);
    setError(null);
    return watch(
      "Facilities",
      [["ownerId", "==", userProfile.uid]],
      (v) => {
        setFacilities(v);
        setFacilityId((prev) =>
          v.some((f) => f.id === prev) ? prev : v[0]?.id || "",
        );
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      },
    );
  }, [userProfile.uid, retry]);
  useEffect(() => {
    if (!facility) return;
    setPricing(
      facility.pricing || {
        enabled: false,
        peakStart: "17:00",
        peakEnd: "21:00",
        peakPercent: 0,
        weekendPercent: 0,
      },
    );
    setHours(facility.operating_hours || "");
    setCourts([]);
    setBookings([]);
    setReviews([]);
    setAvailability([]);
    const fail = (e) => setError(e);
    const stop = [
      watch(
        "Courts",
        [["facility_id", "==", facility.facility_id || facilityId]],
        (v) => setCourts(v.filter((c) => c.status !== "archived")),
        fail,
      ),
      watch(
        "Bookings",
        [["ownerId", "==", userProfile.uid]],
        setBookings,
        fail,
        { order: "createdAt", limit: 100 },
      ),
      watch("Reviews", [["facilityId", "==", facilityId]], setReviews, fail),
      watch(
        "Availability",
        [
          ["facilityId", "==", facilityId],
          ["date", "==", date],
        ],
        setAvailability,
        fail,
        { limit: 500 },
      ),
    ];
    return () => stop.forEach((s) => s());
  }, [facilityId, facility?.updatedAt, date, retry]);
  const ownBookings = [
    ...bookings,
    ...moreBookings.filter((b) => !bookings.some((p) => p.id === b.id)),
  ].filter((b) => b.facilityId === facilityId);
  useEffect(() => {
    if (facilityId)
      api("merchantStats", { facilityId })
        .then(setFinancialStats)
        .catch((e) => setError(e));
  }, [
    facilityId,
    JSON.stringify(bookings.map((b) => [b.id, b.status, b.refundStatus])),
  ]);
  async function older() {
    const last = [...bookings, ...moreBookings].at(-1);
    if (!last) return;
    const page = await run("listBookings", {
      scope: "merchant",
      cursor: last.id,
    });
    if (page) {
      setMoreBookings((prev) => [...prev, ...page.items]);
      setHasOlder(page.hasMore);
    }
  }
  const metrics = useMemo(() => {
    const avg = reviews.length
      ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length
      : 0;
    return {
      ...financialStats,
      avg,
      pending: ownBookings.filter(
        (b) =>
          b.status === "pending_approval" || b.refundStatus === "requested",
      ).length,
    };
  }, [ownBookings, reviews, financialStats]);
  const schedule = useMemo(() => {
    try {
      const { start, end } = opening(hours),
        out = [];
      for (let m = start; m + 30 <= end; m += 30)
        out.push(
          String(Math.floor((m % 1440) / 60)).padStart(2, "0") +
            ":" +
            String(m % 60).padStart(2, "0"),
        );
      return out;
    } catch {
      return [];
    }
  }, [hours]);
  async function run(actionName, data) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api(actionName, data);
      showSuccess(tr("Đã lưu.", "Saved."));
      return result;
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveCourt(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    let image;
    try {
      if (file)
        image = await uploadImage(file, "court_photos/" + userProfile.uid);
      await api("saveCourt", {
        ...courtForm,
        facilityId,
        basePrice: Number(courtForm.basePrice),
        imageUrl: image?.url || courtForm.imageUrl || "",
      });
      setCourtForm(null);
      setFile(null);
      showSuccess(tr("Đã lưu sân.", "Court saved."));
    } catch (e) {
      // The save may have committed before a network error. Server cleanup removes only orphan files.
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function propose(b, operation) {
    setReference("");
    setAmount(String(operation === "refund" ? b.refundAmount : b.totalAmount));
    setAction({ b, operation });
  }
  async function transition(e) {
    e.preventDefault();
    const result = await run("bookingTransition", {
      bookingId: action.b.id,
      operation: action.operation,
      reference,
      amount: Number(amount),
    });
    if (result) setAction(null);
  }
  return (
    <section
      id="merchant-section"
      className="container booking-flow"
      style={{ padding: "32px 20px" }}
    >
      <h2>{tr("Quản lý sân", "Merchant portal")}</h2>
      <AsyncStatus
        loading={loading}
        error={error}
        retry={() => setRetry((v) => v + 1)}
        empty={!loading && !facilities.length}
        lang={lang}
      />
      <label>
        {tr("Cơ sở thuộc quyền quản lý", "Your facility")}
        <select
          value={facilityId}
          onChange={(e) => setFacilityId(e.target.value)}
        >
          {facilities.map((f) => (
            <option value={f.id} key={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-row">
        {Object.entries({
          overview: tr("Tổng quan", "Overview"),
          schedule: tr("Lịch sân", "Schedule"),
          bookings: tr("Đơn và hoàn tiền", "Orders & refunds"),
          facilities: tr("Sân và giá", "Courts & pricing"),
          reviews: tr("Đánh giá", "Reviews"),
        }).map(([key, label]) => (
          <button
            key={key}
            className={"btn " + (tab === key ? "btn-primary" : "btn-outline")}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {facility && tab === "overview" && (
        <div className="feature-grid">
          {[
            [
              tr("Tiền nhận ròng hôm nay", "Net received today"),
              metrics.revenueToday == null
                ? "—"
                : metrics.revenueToday.toLocaleString() + " VND",
            ],
            [
              tr("Tiền nhận ròng tuần này", "Net received this week"),
              metrics.revenueWeek == null
                ? "—"
                : metrics.revenueWeek.toLocaleString() + " VND",
            ],
            [
              tr(
                "Tỷ lệ giờ sân đã xác nhận hôm nay",
                "Confirmed court hours today",
              ),
              metrics.occupancy == null
                ? "—"
                : metrics.occupancy.toFixed(1) + "%",
            ],
            [
              tr(
                "Chờ xử lý trong lịch sử đã tải",
                "Awaiting action in loaded history",
              ),
              metrics.pending,
            ],
            [
              tr("Đánh giá SportSpace đã tải", "Loaded SportSpace ratings"),
              metrics.avg.toFixed(1) + " / 5 (" + reviews.length + ")",
            ],
          ].map(([label, v]) => (
            <div className="glass-panel feature-card" key={label}>
              <h3>{label}</h3>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
      )}
      {facility && tab === "schedule" && (
        <>
          <label>
            {tr("Ngày mở cửa", "Service date")}
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <p>
            {tr(
              "Bấm ô trống để khóa bảo trì hoặc mở lại ô bảo trì; không sửa đơn đã giữ.",
              "Click a free slot to block maintenance or reopen a maintenance slot; reserved orders cannot be overwritten.",
            )}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="court-timetable">
              <thead>
                <tr>
                  <th>{tr("Sân", "Court")}</th>
                  {schedule.map((t) => (
                    <th key={t}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {courts.map((c) => (
                  <tr key={c.id}>
                    <th>{c.name}</th>
                    {schedule.map((time) => {
                      let startAt;
                      try {
                        const m =
                            Number(time.slice(0, 2)) * 60 +
                            Number(time.slice(3)),
                          bounds = opening(hours);
                        startAt = dateTime(
                          date,
                          m < bounds.start ? m + 1440 : m,
                        );
                      } catch {
                        return null;
                      }
                      const record = availability.find(
                        (a) =>
                          a.courtId === c.id &&
                          a.expiresAt > Date.now() &&
                          overlaps(a, { startAt, endAt: startAt + 1800000 }),
                      );
                      return (
                        <td key={time}>
                          <button
                            disabled={
                              busy ||
                              startAt <= Date.now() ||
                              c.status === "maintenance"
                            }
                            className="btn btn-outline"
                            style={{ minWidth: 90 }}
                            onClick={() =>
                              record && record.status !== "maintenance"
                                ? showInfo(
                                    tr(
                                      "Ô đã giữ; hãy xử lý tại Đơn.",
                                      "Reserved slot; manage the order instead.",
                                    ),
                                  )
                                : run("blockSlot", {
                                    facilityId,
                                    courtId: c.id,
                                    date,
                                    time,
                                  })
                            }
                          >
                            {record
                              ? record.status === "maintenance"
                                ? tr("Bảo trì", "Maint.")
                                : tr("Đã giữ", "Reserved")
                              : tr("Trống", "Free")}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {facility && tab === "bookings" && (
        <>
          <p>
            {tr(
              "100 đơn gần nhất. Chỉ xác nhận sau khi kiểm tra giao dịch thực tế.",
              "Latest 100 orders. Verify the actual transfer before approving.",
            )}
          </p>
          <div className="feature-grid">
            {ownBookings.map((b) => (
              <article className="glass-panel feature-card" key={b.id}>
                <h3>{b.ticketId || b.id}</h3>
                <p>
                  {b.customerName} · {b.phone}
                </p>
                <p>
                  {b.courtName} · {b.date} · {b.time}
                </p>
                <p>{bookingLabel(b, lang)}</p>
                <p>
                  {tr("Đã nhận", "Received")}:{" "}
                  {Number(b.depositPaid || 0).toLocaleString()} VND
                </p>
                <div className="form-row">
                  {b.receiptPath && (
                    <button
                      className="btn btn-outline"
                      onClick={() =>
                        openPrivateImage(b.receiptPath).catch((e) =>
                          showError(e.message),
                        )
                      }
                    >
                      {tr("Xem biên lai", "View receipt")}
                    </button>
                  )}
                  {b.status === "pending_approval" && (
                    <>
                      <button
                        disabled={busy}
                        className="btn btn-primary"
                        onClick={() => propose(b, "approve")}
                      >
                        {tr("Xác minh và duyệt", "Verify & approve")}
                      </button>
                      <button
                        disabled={busy}
                        className="btn btn-outline"
                        onClick={() => propose(b, "reject")}
                      >
                        {tr("Từ chối", "Reject")}
                      </button>
                    </>
                  )}
                  {b.refundStatus === "requested" && (
                    <button
                      disabled={busy}
                      className="btn btn-outline"
                      onClick={() => propose(b, "refund")}
                    >
                      {tr(
                        "Xác nhận đã hoàn khoản chuyển",
                        "Verify refund transfer",
                      )}
                    </button>
                  )}
                  {b.schemaVersion === 2 &&
                    (["expired", "cancelled", "rejected"].includes(b.status) ||
                      (["held", "pending_approval"].includes(b.status) &&
                        b.holdExpiresAt <= Date.now())) &&
                    b.paymentStatus !== "paid" && (
                      <button
                        disabled={busy}
                        className="btn btn-outline"
                        onClick={() => propose(b, "recordLatePayment")}
                      >
                        {tr(
                          "Đối soát tiền đến muộn",
                          "Reconcile late transfer",
                        )}
                      </button>
                    )}
                  {b.status === "confirmed" && b.endAt <= Date.now() && (
                    <button
                      disabled={busy}
                      className="btn btn-primary"
                      onClick={() => propose(b, "complete")}
                    >
                      {tr("Hoàn tất", "Complete")}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {hasOlder && bookings.length >= 100 && (
            <button className="btn btn-outline" disabled={busy} onClick={older}>
              {tr("Tải đơn cũ hơn", "Load older orders")}
            </button>
          )}
        </>
      )}
      {facility && tab === "facilities" && (
        <>
          <button
            className="btn btn-primary"
            onClick={() => {
              setFile(null);
              setCourtForm({
                key: crypto.randomUUID(),
                name: "",
                type: "",
                basePrice: 0,
                status: "active",
              });
            }}
          >
            {tr("Thêm sân con", "Add court")}
          </button>
          <div className="feature-grid">
            {courts.map((c) => (
              <article className="glass-panel feature-card" key={c.id}>
                <h3>{c.name}</h3>
                {c.imageUrl && (
                  <img
                    src={c.imageUrl}
                    alt={c.name}
                    style={{ maxWidth: "100%" }}
                  />
                )}
                <p>
                  {c.surface_type} · {Number(c.basePrice || 0).toLocaleString()}{" "}
                  VND/h · {c.status}
                </p>
                <div className="form-row">
                  <button
                    className="btn btn-outline"
                    onClick={() => {
                      setFile(null);
                      setCourtForm({
                        courtId: c.id,
                        name: c.name,
                        type: c.surface_type || "",
                        basePrice: c.basePrice || 0,
                        status: c.status || "active",
                        imageUrl: c.imageUrl || "",
                      });
                    }}
                  >
                    {tr("Sửa", "Edit")}
                  </button>
                  <button
                    disabled={busy}
                    className="btn btn-outline"
                    onClick={() => propose({ id: c.id }, "archive")}
                  >
                    {tr("Ngừng hoạt động", "Archive")}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await run("saveFacility", {
                facilityId,
                pricing,
                operating_hours: hours,
              });
            }}
          >
            <h3>{tr("Giờ hoạt động và giá", "Hours & pricing")}</h3>
            <label>
              {tr(
                "Giờ mở-đóng (VD 05:30-21:30)",
                "Opening hours (e.g. 05:30-21:30)",
              )}
              <input
                required
                pattern="[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={!!pricing.enabled}
                onChange={(e) =>
                  setPricing({ ...pricing, enabled: e.target.checked })
                }
              />{" "}
              {tr("Bật phụ thu", "Enable surcharges")}
            </label>
            <div className="form-row">
              {["peakStart", "peakEnd", "peakPercent", "weekendPercent"].map(
                (k) => (
                  <label key={k}>
                    {
                      {
                        peakStart: tr("Bắt đầu cao điểm", "Peak start"),
                        peakEnd: tr("Kết thúc cao điểm", "Peak end"),
                        peakPercent: tr(
                          "Phụ thu cao điểm (%)",
                          "Peak surcharge (%)",
                        ),
                        weekendPercent: tr(
                          "Phụ thu cuối tuần (%)",
                          "Weekend surcharge (%)",
                        ),
                      }[k]
                    }
                    <input
                      required
                      type={k.endsWith("Percent") ? "number" : "time"}
                      min={0}
                      max={100}
                      value={pricing[k]}
                      onChange={(e) =>
                        setPricing({
                          ...pricing,
                          [k]: k.endsWith("Percent")
                            ? Number(e.target.value)
                            : e.target.value,
                        })
                      }
                    />
                  </label>
                ),
              )}
            </div>
            <button className="btn btn-primary" disabled={busy}>
              {tr("Lưu cấu hình", "Save settings")}
            </button>
          </form>
        </>
      )}
      {facility && tab === "reviews" && (
        <>
          <AsyncStatus empty={!reviews.length} lang={lang} />
          {reviews.map((r) => (
            <article className="glass-panel feature-card" key={r.id}>
              <h3>
                {r.user} · {r.rating}/5
              </h3>
              <p>{r.comment}</p>
              <p>{r.response}</p>
              <textarea
                maxLength={2000}
                value={reply[r.id] ?? r.response ?? ""}
                onChange={(e) => setReply({ ...reply, [r.id]: e.target.value })}
              />
              <button
                disabled={busy}
                className="btn btn-primary"
                onClick={() =>
                  run("replyReview", {
                    reviewId: r.id,
                    response: reply[r.id] ?? r.response,
                  })
                }
              >
                {tr("Gửi phản hồi", "Reply")}
              </button>
            </article>
          ))}
        </>
      )}
      {courtForm && (
        <div className="modal-overlay">
          <form className="modal-content booking-flow" onSubmit={saveCourt}>
            <h3>{tr("Thông tin sân", "Court details")}</h3>
            {Object.entries({
              name: tr("Tên sân", "Name"),
              type: tr("Mặt sân", "Surface"),
              basePrice: tr("Giá/giờ (VND)", "Price/hour (VND)"),
            }).map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  required
                  type={k === "basePrice" ? "number" : "text"}
                  min={1}
                  value={courtForm[k]}
                  onChange={(e) =>
                    setCourtForm({ ...courtForm, [k]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              {tr("Trạng thái", "Status")}
              <select
                value={courtForm.status}
                onChange={(e) =>
                  setCourtForm({ ...courtForm, status: e.target.value })
                }
              >
                <option value="active">{tr("Hoạt động", "Active")}</option>
                <option value="maintenance">
                  {tr("Bảo trì", "Maintenance")}
                </option>
              </select>
            </label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files[0])}
            />
            <div className="form-row">
              <button
                type="button"
                disabled={busy}
                className="btn btn-outline"
                onClick={() => setCourtForm(null)}
              >
                {tr("Đóng", "Close")}
              </button>
              <button disabled={busy} className="btn btn-primary">
                {tr("Lưu", "Save")}
              </button>
            </div>
          </form>
        </div>
      )}
      {action && action.operation !== "archive" && (
        <div className="modal-overlay">
          <form className="modal-content booking-flow" onSubmit={transition}>
            <h3>
              {tr("Xác nhận thao tác", "Confirm action")}: {action.operation}
            </h3>
            <p>{action.b.ticketId}</p>
            {["approve", "refund", "recordLatePayment"].includes(
              action.operation,
            ) && (
              <>
                <label>
                  {tr(
                    "Mã giao dịch ngân hàng đã kiểm tra",
                    "Verified bank transaction reference",
                  )}
                  <input
                    required
                    maxLength={100}
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                  />
                </label>
                <label>
                  {tr(
                    "Số tiền thực chuyển (VND)",
                    "Actual transferred amount (VND)",
                  )}
                  <input
                    type="number"
                    required
                    min={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <p>
                  {tr(
                    "Chỉ xác nhận sau khi đã kiểm tra tiền nhận hoặc giao dịch hoàn tiền thật. Thao tác này không tự chuyển tiền.",
                    "Confirm only after verifying receipt of funds or an actual refund transfer. This action does not transfer money.",
                  )}
                </p>
              </>
            )}
            <div className="form-row">
              <button
                type="button"
                className="btn btn-outline"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                {tr("Đóng", "Close")}
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {tr("Xác nhận", "Confirm")}
              </button>
            </div>
          </form>
        </div>
      )}
      <ConfirmModal
        isOpen={action?.operation === "archive"}
        title={tr("Ngừng hoạt động sân", "Archive court")}
        message={tr(
          "Lịch sử được giữ; sân có đơn hoạt động sẽ không thể ngừng.",
          "History is retained; active bookings prevent archiving.",
        )}
        onClose={() => !busy && setAction(null)}
        onConfirm={async () => {
          if (await run("archiveCourt", { facilityId, courtId: action.b.id }))
            setAction(null);
        }}
      />
    </section>
  );
}
