import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Copy, Download } from "lucide-react";
import { supabase } from "../supabase";
import { api, watch, uploadImage } from "../services/api";
import {
  localDate,
  opening,
  interval,
  overlaps,
  quote,
  bookingLabel,
} from "../../functions/domain";
import { useToast } from "./ToastContext";
import AsyncStatus from "./AsyncStatus";
import GoogleRating from "./GoogleRating";
import { activeCourt, bookingRecord } from "../../supabase/functions/sportspace/booking.js";
import { normalizeSelections, selectionRanges } from "../../supabase/functions/sportspace/selection.js";

export default function BookingModal({
  venue,
  preselectedCourtId,
  onClose,
  lang = "vi",
  userProfile,
  onRequireAuth,
}) {
  const tr = (vi, en) => (lang === "vi" ? vi : en);
  const { showError, showInfo } = useToast();
  const [courts, setCourts] = useState([]),
    [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(null),
    [retry, setRetry] = useState(0);
  const [date, setDate] = useState(localDate()),
    [duration, setDuration] = useState(60);
  const [selectedTimes, setSelectedTimes] = useState({});
  const [name, setName] = useState(userProfile?.name || ""),
    [phone, setPhone] = useState(userProfile?.phone || ""),
    [note, setNote] = useState("");
  const [booking, setBooking] = useState(null),
    [step, setStep] = useState("timetable"),
    [busy, setBusy] = useState(false),
    [trackedId, setTrackedId] = useState(null);
  const [clock, setClock] = useState(Date.now()),
    [file, setFile] = useState(null),
    [showPriceList, setShowPriceList] = useState(false);
  const key = useRef(crypto.randomUUID()),
    submitting = useRef(false);
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    setName(userProfile?.name || "");
    setPhone(userProfile?.phone || "");
  }, [userProfile?.uid]);
  useEffect(() => {
    setLoading(true);
    setError(null);
    setAvailability([]);
    setSelectedTimes({});
    let a = false,
      b = false;
    const loaded = () => {
        if (a && b) setLoading(false);
      },
      fail = (e) => {
        setError(e);
        setLoading(false);
      };
    let s2 = () => {};
    const s1 = watch(
      "Courts",
      [["facility_id", "==", venue.facility_id || venue.id]],
      (v) => {
        const activeCourts = v
          .map(bookingRecord)
          .filter(activeCourt);
        setCourts(activeCourts);
        a = true;
        s2();
        if (!activeCourts.length) {
          setAvailability([]);
          b = true;
          loaded();
          return;
        }
        s2 = watch(
          "Availability",
          [
            ["court_id", "in", activeCourts.map((court) => court.id)],
            ["date", "==", date],
          ],
          (rows) => {
            setAvailability(rows.map((value) => {
              const item = { ...(value.raw_data || {}), ...value };
              const startAt = Number(item.startAt) || Date.parse(`${item.date}T${item.start_time || "00:00"}:00+07:00`);
              const endAt = Number(item.endAt) || Date.parse(`${item.date}T${item.end_time || item.start_time || "00:00"}:00+07:00`);
              return {
                ...item,
                courtId: item.courtId || item.court_id,
                startAt,
                endAt,
                expiresAt: Number(item.expiresAt) || null,
              };
            }));
            b = true;
            loaded();
          },
          fail,
          {
            limit: 500,
            timeoutMs: 8000,
            select: "id,court_id,courtId,date,start_time,end_time,startAt,endAt,expiresAt,status,raw_data",
          },
        );
      },
      fail,
      { limit: 500, timeoutMs: 8000 },
    );
    return () => {
      s1();
      s2();
    };
  }, [venue.id, date, retry]);
  const storageKey =
    "sportspace_booking:" + (userProfile?.uid || "guest") + ":" + venue.id;
  useEffect(() => {
    if (!userProfile?.uid) return;
    setTrackedId(sessionStorage.getItem(storageKey));
  }, [storageKey]);
  useEffect(() => {
    if (!trackedId) return;
    let channel;
    let active = true;
    const fetchBooking = async () => {
      try {
        const { data, error } = await supabase.from("Bookings").select("*").eq("id", trackedId).maybeSingle();
        if (!active) return;
        if (error) {
          showError(error.message);
          return;
        }
        if (data && data.userId === userProfile?.uid) {
          setBooking(data);
          setStep("payment");
        } else {
          sessionStorage.removeItem(storageKey);
          setTrackedId(null);
        }
      } catch (error) {
        if (active) showError(error.message);
      }
    };
    fetchBooking();
    
    channel = supabase.channel(`public:Bookings:id=eq.${trackedId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Bookings', filter: `id=eq.${trackedId}` }, fetchBooking)
      .subscribe();
      
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [trackedId, storageKey, userProfile?.uid, showError]);
  const slots = useMemo(() => {
    try {
      const { start, end } = opening(venue.operating_hours),
        v = [];
      for (let m = start; m + duration <= end; m += duration) {
        if (m % 30 === 0)
          v.push(
            String(Math.floor((m % 1440) / 60)).padStart(2, "0") +
              ":" +
              String(m % 60).padStart(2, "0"),
          );
      }
      return v;
    } catch {
      return [];
    }
  }, [venue.operating_hours, duration]);
  const slotIntervals = useMemo(() => {
    const map = {};
    for (const t of slots) {
      try {
        map[t] = interval(date, t, duration, venue.operating_hours);
      } catch {
        map[t] = null;
      }
    }
    return map;
  }, [slots, date, duration, venue.operating_hours]);

  function cell(c, time) {
    const r = slotIntervals[time];
    if (!r) return "locked";
    if (availability.some((a) => {
      if (Number.isFinite(a.endAt) && a.endAt <= clock) return false;
      const active = a.expiresAt
        ? a.expiresAt > clock
        : !["available", "expired", "cancelled"].includes(String(a.status || "").toLowerCase());
      return a.courtId === c.id && active && Number.isFinite(a.startAt) && Number.isFinite(a.endAt) && overlaps(a, r);
    }))
      return "booked";
    if (r.startAt <= clock) return "locked";
    return "available";
  }
  const selections = useMemo(() => Object.entries(selectedTimes)
    .filter(([, times]) => times.length)
    .map(([courtId, times]) => ({ courtId, times })), [selectedTimes]);
  const selectionSummary = selections.map(({ courtId, times }) =>
    `${courts.find((court) => court.id === courtId)?.name || courtId}: ${times.join(", ")}`).join(" · ");
  const { total, selectionError } = useMemo(() => {
    if (!selections.length) return { total: 0, selectionError: null };
    try {
      let total = 0;
      for (const selection of normalizeSelections({ selections })) {
        const court = courts.find((c) => c.id === selection.courtId);
        if (!court) throw new Error("court-not-bookable");
        const ranges = selectionRanges(selection, date, duration, venue.operating_hours, interval);
        total += quote(court, venue, ranges);
      }
      return { total, selectionError: null };
    } catch (error) {
      return { total: 0, selectionError: error.message };
    }
  }, [selections, courts, venue, date, duration]);
  function toggle(c, time) {
    const selected = selectedTimes[c.id] || [];
    if (!selected.includes(time) && cell(c, time) !== "available") return;
    setSelectedTimes((previous) => ({ ...previous, [c.id]: selected.includes(time)
      ? selected.filter((t) => t !== time) : [...selected, time].sort() }));
    key.current = crypto.randomUUID();
  }
  async function hold(e) {
    e.preventDefault();
    if (!userProfile) {
      onRequireAuth();
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      normalizeSelections({ selections });
      if (selectionError) throw new Error(selectionError);
      const b = await api("holdBooking", {
        key: key.current,
        facilityId: venue.facility_id || venue.id,
        selections,
        date,
        duration,
        customerName: name,
        phone,
        note,
      });
      sessionStorage.setItem(storageKey, b.id);
      setTrackedId(b.id);
      setBooking(b);
      setStep("payment");
    } catch (e) {
      showError(e.message);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  async function receipt() {
    if (!file || busy) return;
    setBusy(true);
    try {
      const image = await uploadImage(
        file,
        "receipts/" + userProfile.uid + "/" + booking.id,
      );
      const updated = await api("submitReceipt", { bookingId: booking.id, path: image.path });
      setBooking(updated);
      showInfo(
        tr(
          "Biên lai đã gửi, chờ chủ sân kiểm tra khoản chuyển.",
          "Receipt submitted, awaiting transfer verification.",
        ),
      );
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    try {
      await api("bookingTransition", {
        bookingId: booking.id,
        operation: "cancel",
      });
      sessionStorage.removeItem(storageKey);
      setTrackedId(null);
      setBooking(null);
      setStep("timetable");
      key.current = crypto.randomUUID();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const remaining = booking
      ? Math.max(0, Math.floor((booking.holdExpiresAt - clock) / 1000))
      : 0,
    bank = booking?.payment;
  const qr = bank
    ? "https://img.vietqr.io/image/" +
      encodeURIComponent(bank.bin) +
      "-" +
      encodeURIComponent(bank.account) +
      "-compact2.png?amount=" +
      booking.totalAmount +
      "&addInfo=" +
      encodeURIComponent(booking.ticketId) +
      "&accountName=" +
      encodeURIComponent(bank.name)
    : null;
  async function download() {
    try {
      const r = await fetch(qr);
      if (!r.ok) throw new Error("QR download failed");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = booking.ticketId + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      showError(e.message);
    }
  }
  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <div
        className="modal-content booking-flow"
        style={{ maxWidth: 960 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="form-row">
          <h2>
            {tr("Đặt sân", "Book a court")} · {venue.name}
          </h2>
          <button
            className="btn btn-outline"
            disabled={busy}
            onClick={onClose}
            aria-label={tr("Đóng", "Close")}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ marginBottom: 12 }}>
          <GoogleRating venue={venue} lang={lang} />
        </div>
        {step === "timetable" && (
          <>
            <div className="form-row">
              <label>
                {tr("Ngày mở cửa", "Service date")}
                <input
                  type="date"
                  min={localDate()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label>
                {tr("Thời lượng", "Duration")}
                <select
                  value={duration}
                  onChange={(e) => {
                    setDuration(Number(e.target.value));
                    setSelectedTimes({});
                    key.current = crypto.randomUUID();
                  }}
                >
                  {[30, 60, 120].map((n) => (
                    <option key={n} value={n}>
                      {n} {tr("phút", "minutes")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <AsyncStatus
              loading={loading}
              error={error}
              retry={() => setRetry((v) => v + 1)}
              empty={!loading && !courts.length}
              lang={lang}
            />
            {!slots.length && !loading && (
              <p>
                {tr(
                  "Chưa có giờ hoạt động hợp lệ. Liên hệ chủ sân.",
                  "Operating hours are unavailable. Contact the owner.",
                )}
              </p>
            )}
            {!loading && !error && courts.length > 0 && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: '0.85rem' }}>
                     <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
                       <div style={{width: 16, height: 16, background: 'transparent', border: '1px solid var(--surface-card-border)', borderRadius: 2}}></div> 
                       {tr("Trống", "Free")}
                     </span>
                     <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
                       <div style={{width: 16, height: 16, background: 'var(--btn-primary)', borderRadius: 2}}></div> 
                       {tr("Đang chọn", "Selected")}
                     </span>
                     <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
                       <div style={{width: 16, height: 16, background: '#ef4444', borderRadius: 2}}></div> 
                       {tr("Đã đặt", "Booked")}
                     </span>
                     <span style={{display: 'flex', alignItems: 'center', gap: 4}}>
                       <div style={{width: 16, height: 16, background: '#cbd5e1', borderRadius: 2}}></div> 
                       {tr("Khóa", "Locked")}
                     </span>
                  </div>
                  <button 
                    className="btn btn-link" 
                    style={{ padding: 0, textDecoration: 'underline', color: 'var(--btn-primary)', background: 'transparent', border: 'none', cursor: 'pointer' }} 
                    onClick={() => setShowPriceList(true)}
                  >
                    {tr("Xem bảng giá", "View price list")}
                  </button>
                </div>
                <div style={{ overflowX: "auto", margin: "16px 0", maxWidth: "100%" }}>
                  <table className="court-timetable" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: 8, minWidth: 80, position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 10, borderRight: '1px solid var(--surface-card-border)' }}>{tr("Sân", "Court")}</th>
                        {slots.map((t) => (
                          <th key={t} style={{ padding: 8, minWidth: 48, fontSize: '0.9rem' }}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {courts.map((c) => (
                        <tr key={c.id}>
                          <th style={{ padding: 8, whiteSpace: 'nowrap', fontSize: '0.9rem', position: 'sticky', left: 0, background: 'var(--bg-primary)', zIndex: 10, borderRight: '1px solid var(--surface-card-border)' }}>
                            {c.name || c.court_name || "Sân"}
                          </th>
                          {slots.map((t) => {
                            const state = cell(c, t),
                              selected = (selectedTimes[c.id] || []).includes(t);
                            return (
                              <td key={t} style={{ padding: 4 }}>
                                <button
                                  disabled={!selected && state !== "available"}
                                  aria-pressed={selected}
                                  aria-label={`${c.name || c.id} ${t}`}
                                  onClick={() => toggle(c, t)}
                                  title={state}
                                  style={{ 
                                    width: "100%", 
                                    height: "32px", 
                                    minWidth: "48px", 
                                    borderRadius: "4px",
                                    border: "1px solid",
                                    borderColor: selected ? "var(--btn-primary)" : state === "available" ? "var(--surface-card-border)" : "transparent",
                                    cursor: state === "available" ? "pointer" : "not-allowed",
                                    backgroundColor: selected 
                                      ? "var(--btn-primary)" 
                                      : state === "available" 
                                        ? "transparent" 
                                        : state === "booked"
                                      ? "#ef4444"
                                      : "#cbd5e1",
                                    opacity: 1,
                                    padding: 0,
                                    transition: "all 0.2s"
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {showPriceList && (
                  <div style={{ zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', position: 'fixed', inset: 0 }} onClick={() => setShowPriceList(false)}>
                    <div className="modal-content" style={{ padding: 24, maxWidth: 450, background: 'var(--bg-primary)', borderRadius: 'var(--radius-lg)' }} onClick={e => e.stopPropagation()}>
                      <h3 style={{ marginTop: 0, marginBottom: 16 }}>{tr("Bảng giá chi tiết", "Price list details")}</h3>
                      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                        {courts.map(c => (
                          <div key={c.id} style={{ marginBottom: 12, padding: 12, border: '1px solid var(--surface-card-border)', borderRadius: 8 }}>
                            <strong style={{ display: 'block', marginBottom: 8, color: 'var(--text-primary)' }}>{c.name || c.court_name || "Sân"}</strong>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                              {c.price_day && c.price_night ? (
                                <>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span>{tr("Ngày thường (ngoài cao điểm)", "Weekdays (off-peak)")}:</span>
                                    <span style={{ fontWeight: 'bold' }}>{Number(c.price_day).toLocaleString()} đ/h</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                    <span>{tr("Cao điểm", "Peak hours")} ({venue.pricing?.peakStart || "17:00"}–{venue.pricing?.peakEnd || "21:00"}):</span>
                                    <span style={{ fontWeight: 'bold' }}>{Number(c.price_night).toLocaleString()} đ/h</span>
                                  </div>
                                  {c.price_weekend && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span>{tr("Cuối tuần", "Weekend")}:</span> 
                                      <span style={{ fontWeight: 'bold' }}>{Number(c.price_weekend).toLocaleString()} đ/h</span>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>{tr("Giá cố định", "Fixed price")}:</span> 
                                  <span style={{ fontWeight: 'bold' }}>{Number(c.basePrice || c.price_day || 0).toLocaleString()} đ/h</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <button className="btn btn-primary" style={{ marginTop: 16, width: '100%' }} onClick={() => setShowPriceList(false)}>
                        {tr("Đóng", "Close")}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
            <p>{tr("Có thể chọn nhiều sân. Trên mỗi sân, không để trống đúng 1 ô giữa các ô đã chọn (tối đa 16 ô/đơn).", "Select multiple courts. On each court, do not leave exactly one empty slot between selected slots (up to 16 slots/order).")}</p>
            {selectionSummary && <p>{selectionSummary}</p>}
            {selectionError && <p role="alert">{selectionError === "single-slot-gap"
              ? tr("Không được bỏ trống đúng 1 ô giữa hai ô đã chọn trên cùng sân. Hãy chọn thêm ô trống hoặc đổi lựa chọn.", "Do not leave exactly one empty slot between selections on the same court. Fill the gap or change your selection.")
              : selectionError === "too-many-booking-slots"
                ? tr("Mỗi đơn được chọn tối đa 16 ô.", "Select up to 16 slots per order.")
                : tr("Lựa chọn chưa có lịch hoặc giá hợp lệ. Vui lòng kiểm tra lại.", "Selected slots have invalid schedule or pricing. Please review.")}</p>}
            <p>
              {tr("Tổng thanh toán", "Total payment")}:{" "}
              <strong>{total.toLocaleString()} VND</strong>
            </p>
            <button
              className="btn btn-primary"
              disabled={!total || loading || !!error || !!selectionError}
              onClick={() =>
                userProfile ? setStep("checkout") : onRequireAuth()
              }
            >
              {tr("Tiếp tục", "Continue")}
            </button>
          </>
        )}
        {step === "checkout" && (
          <form onSubmit={hold}>
            <div className="form-row">
              <label>
                {tr("Họ tên", "Full name")}
                <input
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                {tr("Số điện thoại", "Phone")}
                <input
                  required
                  type="tel"
                  pattern="[+0-9 -]{8,20}"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
            </div>
            <label>
              {tr("Ghi chú", "Note")}
              <textarea
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <p>
              {selectionSummary} · {date} · {duration}{" "}
              {tr("phút/ô", "minutes/slot")}
            </p>
            <p>
              {tr(
                "Chuyển khoản toàn bộ giá thuê. Giữ sân tối đa 10 phút để chủ sân kiểm tra. Giá cuối được kiểm tra khi giữ sân.",
                "Pay the full rental amount. Hold up to 10 minutes for verification. The final price is checked when reserving.",
              )}
            </p>
            <div className="form-row">
              <button
                type="button"
                className="btn btn-outline"
                disabled={busy}
                onClick={() => setStep("timetable")}
              >
                {tr("Quay lại", "Back")}
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy
                  ? tr("Đang giữ sân…", "Reserving…")
                  : tr("Giữ sân và chuyển khoản", "Reserve and transfer")}
              </button>
            </div>
          </form>
        )}
        {step === "payment" && booking && (
          <>
            <h3>{booking.ticketId}</h3>
            <p role="status">{bookingLabel(booking, lang)}</p>
            <p>
              {booking.courtName} · {booking.date} · {booking.time} ·{" "}
              {booking.totalAmount.toLocaleString()} VND
            </p>
            {["held", "pending_approval"].includes(booking.status) &&
              remaining > 0 && (
                <p>
                  {tr("Thời gian giữ sân còn", "Hold expires in")}:{" "}
                  {Math.floor(remaining / 60)}:
                  {String(remaining % 60).padStart(2, "0")}
                </p>
              )}
            {booking.status === "held" && remaining > 0 && bank && (
              <>
                <div className="form-row">
                  <img
                    src={qr}
                    alt={tr("QR chuyển khoản", "Bank transfer QR")}
                    style={{ maxWidth: 240, width: "100%" }}
                  />
                  <div>
                    <p>{bank.name}</p>
                    <p>
                      {bank.account}{" "}
                      <button
                        className="btn btn-outline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(bank.account);
                            showInfo(tr("Đã sao chép.", "Copied."));
                          } catch (e) {
                            showError(e.message);
                          }
                        }}
                      >
                        <Copy size={16} />
                      </button>
                    </p>
                    <p>
                      {tr("Nội dung", "Reference")}: {booking.ticketId}
                    </p>
                    <button className="btn btn-outline" onClick={download}>
                      <Download size={16} /> QR
                    </button>
                  </div>
                </div>
                <label>
                  {tr(
                    "Biên lai JPG/PNG/WebP, tối đa 5 MB",
                    "Receipt JPG/PNG/WebP, up to 5 MB",
                  )}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(e) => setFile(e.target.files[0])}
                  />
                </label>
                <button
                  className="btn btn-primary"
                  disabled={busy || !file}
                  onClick={receipt}
                >
                  {tr("Gửi để chủ sân xác minh", "Submit for verification")}
                </button>
              </>
            )}
            {booking.status === "pending_approval" && remaining > 0 && (
              <p>
                {tr(
                  "Chờ chủ sân kiểm tra; chưa xác nhận thanh toán.",
                  "Awaiting verification; payment is not yet confirmed.",
                )}
              </p>
            )}
            {["held", "pending_approval", "expired"].includes(booking.status) &&
              remaining === 0 && (
                <p role="alert">
                  {tr(
                    "Hết hạn giữ sân. Nếu đã chuyển tiền, liên hệ chủ sân với mã đơn để đối soát; không chuyển lại.",
                    "Hold expired. If you paid, contact the owner with your order ID; do not pay twice.",
                  )}
                </p>
              )}
            {["held", "pending_approval"].includes(booking.status) && (
              <button
                className="btn btn-outline"
                disabled={busy}
                onClick={cancel}
              >
                {tr("Hủy giữ sân", "Cancel hold")}
              </button>
            )}
            {["cancelled", "expired", "rejected"].includes(booking.status) && (
              <button
                className="btn btn-outline"
                onClick={() => {
                  sessionStorage.removeItem(storageKey);
                  setTrackedId(null);
                  setBooking(null);
                  setStep("timetable");
                  key.current = crypto.randomUUID();
                }}
              >
                {tr("Chọn lịch khác", "Choose another time")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
