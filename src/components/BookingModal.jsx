import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Copy, Download } from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
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
  const [courtId, setCourtId] = useState(preselectedCourtId || ""),
    [times, setTimes] = useState([]);
  const [name, setName] = useState(userProfile?.name || ""),
    [phone, setPhone] = useState(userProfile?.phone || ""),
    [note, setNote] = useState("");
  const [booking, setBooking] = useState(null),
    [step, setStep] = useState("timetable"),
    [busy, setBusy] = useState(false),
    [trackedId, setTrackedId] = useState(null);
  const [clock, setClock] = useState(Date.now()),
    [file, setFile] = useState(null);
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
    setTimes([]);
    let a = false,
      b = false;
    const loaded = () => {
        if (a && b) setLoading(false);
      },
      fail = (e) => {
        setError(e);
        setLoading(false);
      };
    const s1 = watch(
      "Courts",
      [["facility_id", "==", venue.facility_id || venue.id]],
      (v) => {
        setCourts(v.filter((c) => c.status === "active" || c.is_available === true));
        a = true;
        loaded();
      },
      fail,
    );
    const s2 = watch(
      "Availability",
      [
        ["facilityId", "==", venue.id],
        ["date", "==", date],
      ],
      (v) => {
        setAvailability(v);
        b = true;
        loaded();
      },
      fail,
      { limit: 500 },
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
    return onSnapshot(
      doc(db, "Bookings", trackedId),
      (s) => {
        if (s.exists() && s.data().userId === userProfile?.uid) {
          setBooking({ ...s.data(), id: s.id });
          setStep("payment");
        } else {
          sessionStorage.removeItem(storageKey);
          setTrackedId(null);
        }
      },
      (e) => showError(e.message),
    );
  }, [trackedId, storageKey]);
  const chosen = courts.find((c) => c.id === courtId);
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
  function cell(c, time) {
    try {
      const r = interval(date, time, duration, venue.operating_hours);
      if (r.startAt <= clock) return "locked";
      if (
        availability.some(
          (a) => a.courtId === c.id && a.expiresAt > clock && overlaps(a, r),
        )
      )
        return "booked";
      return "available";
    } catch {
      return "locked";
    }
  }
  const total = useMemo(() => {
    try {
      return chosen && times.length
        ? quote(
            chosen,
            venue,
            times.map((t) =>
              interval(date, t, duration, venue.operating_hours),
            ),
          )
        : 0;
    } catch {
      return 0;
    }
  }, [chosen, venue, date, times, duration]);
  function toggle(c, time) {
    if (cell(c, time) !== "available") return;
    const selected = courtId === c.id ? times : [];
    setCourtId(c.id);
    setTimes(
      selected.includes(time)
        ? selected.filter((t) => t !== time)
        : [...selected, time].sort(),
    );
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
      const b = await api("holdBooking", {
        key: key.current,
        facilityId: venue.id,
        courtId,
        date,
        times,
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
      await api("submitReceipt", { bookingId: booking.id, path: image.path });
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
                {tr("Thời lượng mỗi ô", "Duration per slot")}
                <select
                  value={duration}
                  onChange={(e) => {
                    setDuration(Number(e.target.value));
                    setTimes([]);
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
              <div style={{ overflowX: "auto", margin: "16px 0", maxWidth: "100%" }}>
                <table className="court-timetable">
                  <thead>
                    <tr>
                      <th>{tr("Sân con", "Court")}</th>
                      {slots.map((t) => (
                        <th key={t}>{t}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {courts.map((c) => (
                      <tr key={c.id}>
                        <th>
                          {c.name}
                          <small style={{ display: "block" }}>
                            {Number(c.basePrice || 0).toLocaleString()} VND/h
                          </small>
                        </th>
                        {slots.map((t) => {
                          const state = cell(c, t),
                            selected = courtId === c.id && times.includes(t);
                          return (
                            <td key={t}>
                              <button
                                className={
                                  "btn " +
                                  (selected ? "btn-primary" : "btn-outline")
                                }
                                disabled={state !== "available" || !c.basePrice}
                                onClick={() => toggle(c, t)}
                                style={{ minWidth: 85 }}
                              >
                                {selected
                                  ? tr("Đã chọn", "Selected")
                                  : state === "available"
                                    ? tr("Trống", "Free")
                                    : state === "booked"
                                      ? tr("Đã giữ", "Held")
                                      : tr("Khóa", "Locked")}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p>
              {tr("Tổng thanh toán", "Total payment")}:{" "}
              <strong>{total.toLocaleString()} VND</strong>
            </p>
            <button
              className="btn btn-primary"
              disabled={!total || loading || !!error}
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
              {chosen?.name} · {date} · {times.join(", ")} · {duration}{" "}
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
