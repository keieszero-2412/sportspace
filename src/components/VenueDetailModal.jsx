import React, { useState } from "react";
import {
  X,
  MapPin,
  Phone,
  Star,
  Layers,
  CalendarCheck,
  Clock,
  Shield,
  CheckCircle,
  ExternalLink,
  Trophy,
  ShieldCheck,
  MessageSquare,
  Send,
  ThumbsUp,
} from "lucide-react";
import { api, watch } from "../services/api";
import { useToast } from "./ToastContext";
import AsyncStatus from "./AsyncStatus";
import GoogleRating from "./GoogleRating";
import VenuePhone from "./VenuePhone";

export default function VenueDetailModal({
  venue,
  theme,
  onClose,
  onBookNow,
  lang = "vi",
}) {
  const { showError, showSuccess } = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [eligible, setEligible] = useState([]);
  const [reviewBookingId, setReviewBookingId] = useState("");
  const [activeTab, setActiveTab] = useState("courts"); // 'courts' | 'info' | 'reviews'
  const [selectedCourtId, setSelectedCourtId] = useState(null);
  const [courtsList, setCourtsList] = useState([]);
  const [loadingCourts, setLoadingCourts] = useState(true);

  const [reviewsList, setReviewsList] = useState([]);
  React.useEffect(() => {
    setLoadingCourts(true);
    setError(null);
    const fail = (e) => {
      setError(e);
      setLoadingCourts(false);
    };
    const stop = [
      watch(
        "Courts",
        [["facility_id", "==", venue.facility_id || venue.id]],
        (v) => {
          setCourtsList(v.map((c) => ({
            ...(c.raw_data || {}), ...c,
            name: c.name || c.raw_data?.court_name || c.raw_data?.name,
            status: c.status || c.raw_data?.status,
          })).filter((c) => c.status === "active" || c.status === "Đang hoạt động" || c.is_available === true));
          setLoadingCourts(false);
        },
        fail,
      ),
      watch("Reviews", [["facilityId", "==", venue.id]], setReviewsList, fail),
    ];
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const unsubscribe = watch(
          "Bookings",
          [["userId", "==", user.id]],
          (v) =>
            setEligible(
              v.filter(
                (b) => b.status === "completed" && b.facilityId === venue.id,
              ),
            ),
          fail,
        );
        return unsubscribe;
      }
    };
    let unsubs = [];
    checkAuth().then(u => { if (u) unsubs.push(u) });
    return () => {
      stop.forEach((s) => s());
      unsubs.forEach((s) => s());
    };
  }, [venue.id, retry]);
  const [userRating, setUserRating] = useState(5);
  const [userComment, setUserComment] = useState("");
  const [imageFailed, setImageFailed] = useState(false);

  if (!venue) return null;

  const vName = lang === "en" ? venue.name_en || venue.name : venue.name;
  const vProvince =
    lang === "en" ? venue.province_en || venue.province : venue.province;
  const vAddress =
    lang === "en" ? venue.address_en || venue.address : venue.address;

  const handleAddReview = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await api("saveReview", {
        bookingId: reviewBookingId,
        rating: userRating,
        comment: userComment,
      });
      setUserComment("");
      showSuccess(lang === "vi" ? "Đã lưu đánh giá." : "Review saved.");
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "880px", padding: 0 }}
      >
        {/* Modal Top Banner with Image */}
        <div style={{ position: "relative", width: "100%", height: "220px" }}>
          <img
            src={
              venue.image ||
              "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=800&auto=format&fit=crop"
            }
            alt={vName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              setImageFailed(true);
              e.target.onerror = null;
              e.target.src =
                "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=800&auto=format&fit=crop";
            }}
          />
          {(!venue.image || imageFailed) && (
            <span
              className="badge"
              style={{ position: "absolute", top: 10, left: 10, zIndex: 1 }}
            >
              {lang === "vi" ? "Ảnh minh họa" : "Illustrative image"}
            </span>
          )}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 40%, rgba(12, 45, 69, 0.95) 100%)",
            }}
          />

          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
              border: "none",
              borderRadius: "50%",
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              backdropFilter: "blur(6px)",
            }}
          >
            <X size={20} />
          </button>

          {/* Venue Title & Badges on Banner */}
          <div
            style={{
              position: "absolute",
              bottom: 16,
              left: 20,
              right: 20,
              color: "#fff",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
              <span className="badge badge-sport">{venue.sport}</span>
              <span className="badge badge-highlight">📍 {vProvince}</span>
              <GoogleRating venue={venue} lang={lang} />
            </div>
            <h2
              style={{
                fontSize: "1.6rem",
                fontWeight: 900,
                lineHeight: 1.2,
                color: "#FFF8D2",
              }}
            >
              {vName}
            </h2>
          </div>
        </div>

        {/* Modal Navigation Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--surface-card-border)",
            background: "var(--bg-secondary)",
            padding: "0 20px",
            overflowX: "auto",
          }}
        >
          <button
            onClick={() => setActiveTab("courts")}
            style={{
              padding: "12px 18px",
              border: "none",
              background: "transparent",
              fontSize: "0.9rem",
              fontWeight: 700,
              color:
                activeTab === "courts"
                  ? "var(--btn-primary-hover)"
                  : "var(--text-muted)",
              borderBottom:
                activeTab === "courts"
                  ? "3px solid var(--btn-primary)"
                  : "3px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            <Trophy size={17} />
            <span>
              {lang === "vi"
                ? `Danh sách ${venue.scale_courts} sân con`
                : `List of ${venue.scale_courts} sub-courts`}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("info")}
            style={{
              padding: "12px 18px",
              border: "none",
              background: "transparent",
              fontSize: "0.9rem",
              fontWeight: 700,
              color:
                activeTab === "info"
                  ? "var(--btn-primary-hover)"
                  : "var(--text-muted)",
              borderBottom:
                activeTab === "info"
                  ? "3px solid var(--btn-primary)"
                  : "3px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            <Clock size={17} />
            <span>
              {lang === "vi" ? "Bảng giá & Chính sách" : "Pricing & Policies"}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("reviews")}
            style={{
              padding: "12px 18px",
              border: "none",
              background: "transparent",
              fontSize: "0.9rem",
              fontWeight: 700,
              color:
                activeTab === "reviews"
                  ? "var(--btn-primary-hover)"
                  : "var(--text-muted)",
              borderBottom:
                activeTab === "reviews"
                  ? "3px solid var(--btn-primary)"
                  : "3px solid transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
              whiteSpace: "nowrap",
            }}
          >
            <Star size={17} />
            <span>
              {lang === "vi"
                ? `Đánh giá (${reviewsList.length})`
                : `Reviews (${reviewsList.length})`}
            </span>
          </button>
        </div>

        {/* Tab Contents */}
        <div style={{ padding: "20px" }}>
          {/* TAB 2: COURTS LIST */}
          {activeTab === "courts" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              <AsyncStatus
                loading={loadingCourts}
                error={error}
                retry={() => setRetry((v) => v + 1)}
                empty={!loadingCourts && !courtsList.length}
                lang={lang}
              />
              {courtsList.map((court) => (
                <div
                  key={court.id}
                  style={{
                    background: "var(--surface-card)",
                    borderRadius: "var(--radius-md)",
                    padding: "14px",
                    border:
                      selectedCourtId === court.id
                        ? "2px solid var(--btn-primary)"
                        : "1px solid var(--surface-card-border)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: "1rem",
                        color: "var(--text-primary)",
                      }}
                    >
                      {court.name}
                    </div>
                    <span
                      className="badge badge-available"
                      style={{ fontSize: "0.7rem" }}
                    >
                      {lang === "vi"
                        ? "Xem lịch để kiểm tra"
                        : "Check schedule"}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--text-muted)",
                      marginBottom: 10,
                    }}
                  >
                    {lang === "vi" ? "Mặt sân:" : "Surface:"}{" "}
                    {court.surface_type || court.surface}
                  </div>
                  {court.imageUrl && (
                    <img
                      src={court.imageUrl}
                      alt={court.name}
                      loading="lazy"
                      style={{
                        width: "100%",
                        maxHeight: 180,
                        objectFit: "cover",
                        borderRadius: 8,
                        marginBottom: 10,
                      }}
                    />
                  )}
                  <p>
                    {lang === "vi" ? "Giá cơ bản" : "Base rate"}:{" "}
                    {court.basePrice
                      ? Number(court.basePrice).toLocaleString() + " VND/h"
                      : lang === "vi"
                        ? "Chưa cập nhật"
                        : "Unavailable"}
                  </p>
                  <button
                    onClick={() => {
                      setSelectedCourtId(court.id);
                      onBookNow(venue, court.id);
                    }}
                    className="btn btn-primary"
                    style={{
                      width: "100%",
                      padding: "6px",
                      fontSize: "0.82rem",
                    }}
                  >
                    {lang === "vi"
                      ? "Đặt riêng sân này"
                      : "Book This Sub-court"}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: INFO & PRICING & POLICIES */}
          {activeTab === "info" && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 300px), 1fr))",
                gap: 18,
              }}
            >
              <div>
                <h4
                  style={{ fontSize: "1rem", fontWeight: 800, marginBottom: 8 }}
                >
                  {lang === "vi" ? "Thông tin cụm sân" : "Venue Information"}
                </h4>
                <p
                  style={{
                    fontSize: "0.88rem",
                    color: "var(--text-primary)",
                    marginBottom: 6,
                  }}
                >
                  📍 <strong>{lang === "vi" ? "Địa chỉ:" : "Address:"}</strong>{" "}
                  {venue.address}
                </p>
                <VenuePhone venue={venue} lang={lang} detail />
                <p
                  style={{
                    fontSize: "0.88rem",
                    color: "var(--text-primary)",
                    marginBottom: 12,
                  }}
                >
                  🕒{" "}
                  <strong>
                    {lang === "vi" ? "Giờ mở cửa:" : "Operating hours:"}
                  </strong>{" "}
                  {venue.operating_hours}
                </p>

                <h4
                  style={{
                    fontSize: "1rem",
                    fontWeight: 800,
                    marginBottom: 8,
                    marginTop: 14,
                  }}
                >
                  {lang === "vi" ? "Tiện ích cơ sở" : "Amenities & Facilities"}
                </h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {(Array.isArray(venue.amenities) 
                      ? venue.amenities 
                      : typeof venue.amenities === 'string' 
                          ? venue.amenities.split(',').map(s => s.trim()).filter(Boolean)
                          : []
                  ).map((amenity, i) => (
                    <span
                      key={i}
                      style={{
                        background: "var(--surface-card)",
                        color: "var(--text-primary)",
                        padding: "4px 10px",
                        borderRadius: "8px",
                        fontSize: "0.8rem",
                        border: "1px solid var(--surface-card-border)",
                      }}
                    >
                      ✓ {amenity}
                    </span>
                  ))}
                </div>
              </div>

              {/* Pricing & Refund Policy Box (README 4.1) */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <div
                  style={{
                    background: "var(--surface-card)",
                    padding: "16px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--surface-card-border)",
                  }}
                >
                  <h4
                    style={{
                      fontSize: "1rem",
                      fontWeight: 800,
                      marginBottom: 10,
                    }}
                  >
                    {lang === "vi" ? "Bảng giá niêm yết" : "Official Rate Card"}
                  </h4>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      fontSize: "0.85rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        paddingBottom: 6,
                        borderBottom: "1px solid var(--surface-card-border)",
                      }}
                    >
                      <span>
                        {lang === "vi"
                          ? "Giờ thường (06:00 - 17:00):"
                          : "Standard hours (06:00 - 17:00):"}
                      </span>
                      <strong>120.000đ - 180.000đ/h</strong>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        paddingBottom: 6,
                        borderBottom: "1px solid var(--surface-card-border)",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--accent-orange)",
                          fontWeight: 700,
                        }}
                      >
                        {lang === "vi"
                          ? "Giờ vàng (17:00 - 21:00):"
                          : "Peak hours (17:00 - 21:00):"}
                      </span>
                      <strong style={{ color: "var(--accent-orange)" }}>
                        {lang === "vi"
                          ? "+25% Định giá động"
                          : "+25% Dynamic pricing"}
                      </strong>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        paddingTop: 2,
                      }}
                    >
                      <span>
                        {lang === "vi"
                          ? "Phụ thu cuối tuần:"
                          : "Weekend surcharge:"}
                      </span>
                      <span>+20%</span>
                    </div>
                  </div>
                </div>

                {/* Refund & Cancellation Policy Box (README 4.1) */}
                <div
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(132, 209, 117, 0.18) 100%)",
                    padding: "14px 16px",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(34, 197, 94, 0.35)",
                    fontSize: "0.82rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      color: "#16A34A",
                      fontWeight: 800,
                      marginBottom: 4,
                    }}
                  >
                    <ShieldCheck size={16} />
                    <span>
                      {lang === "vi"
                        ? "CHÍNH SÁCH HỦY VÀ YÊU CẦU HOÀN TIỀN"
                        : "CANCELLATION AND REFUND REQUESTS"}
                    </span>
                  </div>
                  <p style={{ color: "var(--text-primary)", lineHeight: 1.5 }}>
                    {lang === "vi"
                      ? "Hủy trước ít nhất 12 giờ để yêu cầu hoàn khoản thanh toán đã được xác minh. Chủ sân chuyển lại tiền về tài khoản đã thanh toán và xác nhận giao dịch hoàn. Xem trạng thái đối soát trong lịch sử đơn."
                      : "Cancel at least 12 hours ahead to request a refund of verified payments. The owner transfers funds back to the paying account and verifies the refund. Track reconciliation in your booking history."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REVIEWS & RATINGS (README 4.1) */}
          {activeTab === "reviews" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {/* Form gửi đánh giá mới */}
              <h3>
                SportSpace:{" "}
                {reviewsList.length
                  ? (
                      reviewsList.reduce((n, r) => n + r.rating, 0) /
                      reviewsList.length
                    ).toFixed(1)
                  : "—"}{" "}
                / 5 ({reviewsList.length})
              </h3>
              <label>
                {lang === "vi"
                  ? "Đơn đã hoàn tất để đánh giá"
                  : "Completed booking to review"}
                <select
                  required
                  value={reviewBookingId}
                  onChange={(e) => setReviewBookingId(e.target.value)}
                >
                  <option value="">
                    {lang === "vi" ? "Chọn đơn" : "Select booking"}
                  </option>
                  {eligible.map((b) => (
                    <option value={b.id} key={b.id}>
                      {b.ticketId}
                    </option>
                  ))}
                </select>
              </label>
              <form
                onSubmit={handleAddReview}
                style={{
                  background: "var(--surface-card)",
                  padding: "16px 20px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--surface-card-border)",
                }}
              >
                <h4
                  style={{
                    fontSize: "1rem",
                    fontWeight: 800,
                    marginBottom: 10,
                    color: "var(--text-primary)",
                  }}
                >
                  {lang === "vi"
                    ? "Gửi Đánh Giá Sau Khi Thi Đấu"
                    : "Submit Match Review"}
                </h4>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                    {lang === "vi" ? "Chấm điểm:" : "Rating:"}
                  </span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        type="button"
                        key={star}
                        onClick={() => setUserRating(star)}
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          padding: 2,
                        }}
                      >
                        <Star
                          size={22}
                          fill={star <= userRating ? "#FBBF24" : "none"}
                          color={
                            star <= userRating ? "#FBBF24" : "var(--text-muted)"
                          }
                        />
                      </button>
                    ))}
                  </div>
                  <span
                    style={{
                      fontSize: "0.82rem",
                      fontWeight: 700,
                      color: "var(--text-primary)",
                    }}
                  >
                    ({userRating} {lang === "vi" ? "sao" : "stars"})
                  </span>
                </div>

                <div className="form-row">
                  <input
                    type="text"
                    required
                    placeholder={
                      lang === "vi"
                        ? "Nhận xét chất lượng mặt sân, đèn, tiện ích..."
                        : "Review court surface, lighting, amenities..."
                    }
                    value={userComment}
                    onChange={(e) => setUserComment(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--surface-card-border)",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      fontSize: "0.82rem",
                    }}
                  />
                  <button
                    type="submit"
                    disabled={busy || !reviewBookingId}
                    className="btn btn-primary"
                    style={{
                      padding: "8px 16px",
                      fontSize: "0.82rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Send size={14} />{" "}
                    {lang === "vi" ? "Gửi đánh giá" : "Submit Review"}
                  </button>
                </div>
              </form>

              {/* Danh sách các đánh giá */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                {reviewsList.map((rev) => (
                  <div
                    key={rev.id}
                    style={{
                      background: "var(--bg-primary)",
                      borderRadius: "var(--radius-md)",
                      padding: "14px 18px",
                      border: "1px solid var(--surface-card-border)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <strong
                          style={{
                            fontSize: "0.92rem",
                            color: "var(--text-primary)",
                          }}
                        >
                          {rev.user}
                        </strong>
                        <div style={{ display: "flex", gap: 2 }}>
                          {Array.from({
                            length: Math.min(
                              5,
                              Math.max(0, Math.round(Number(rev.rating) || 0)),
                            ),
                          }).map((_, i) => (
                            <Star
                              key={i}
                              size={13}
                              fill="#FBBF24"
                              color="#FBBF24"
                            />
                          ))}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {rev.date}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text-primary)",
                        lineHeight: 1.5,
                      }}
                    >
                      <p>{rev.comment}</p>
                      {rev.response && (
                        <p>
                          <strong>
                            {lang === "vi" ? "Chủ sân: " : "Owner: "}
                          </strong>
                          {rev.response}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "16px 20px",
            borderTop: "1px solid var(--surface-card-border)",
            background: "var(--bg-secondary)",
          }}
        >
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {lang === "vi" ? "Giá tham khảo:" : "Price range:"}
            </div>
            <div
              style={{
                fontSize: "1.2rem",
                fontWeight: 900,
                color: "var(--text-primary)",
              }}
            >
              {venue.price_summary}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => onBookNow(venue, selectedCourtId)}
              className="btn btn-primary"
              style={{ padding: "12px 24px", fontSize: "0.95rem" }}
            >
              <CalendarCheck size={18} />
              <span>
                {lang === "vi"
                  ? "Tiến hành Đặt sân ngay"
                  : "Proceed to Booking"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
