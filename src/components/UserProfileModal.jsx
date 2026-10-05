import React, { useState } from "react";
import {
  X,
  User,
  ShieldCheck,
  Trophy,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Award,
  CheckCircle2,
  Heart,
  Trash2,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
  Clock,
  DollarSign,
  Edit3,
  Save,
  ShieldAlert,
  Sparkles,
  Building2,
  LogOut,
} from "lucide-react";
import { useToast } from "./ToastContext";
import ConfirmModal from "./ConfirmModal";
import { supabase } from "../supabase";
import { api } from "../services/api";
import { fetchProfileRecords, watchProfileRecords } from "../services/profileData";
import { bookingLabel } from "../../functions/domain";
import MerchantApplicationForm from "./MerchantApplicationForm";
import AsyncStatus from "./AsyncStatus";

const profileFormData = (profile, lang) => ({
  name: String(profile?.name || "Khách truy cập"),
  email: profile?.email || "",
  phone: profile?.phone || "",
  province: profile?.province || "Hà Nội",
  skillLevel: profile?.skillLevel || "Mới bắt đầu (Beginner)",
  favoriteSports: profile?.favoriteSports || [],
  preferredLanguage: profile?.preferredLanguage || lang,
});

export default function UserProfileModal({
  userProfile,
  setUserProfile = () => {},
  onClose,
  lang = "vi",
  savedVenues = [],
  onRemoveSavedVenue = () => {},
  onSelectVenue = () => {},
  onBookNow = () => {},
  onSwitchToMerchant = () => {},
  onLogout = () => {},
}) {
  const { showSuccess, showInfo, showError } = useToast();
  const [applying, setApplying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sectionState, setSectionState] = useState({});
  const [password, setPassword] = useState("");
  const [retry, setRetry] = useState(0);
  const [events, setEvents] = useState([]);
  const [tab, setTab] = useState("bookings"); // 'bookings' | 'saved' | 'matches' | 'credibility' | 'info'
  const [pendingCancelId, setPendingCancelId] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Profile edit form
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(() => profileFormData(userProfile, lang));

  React.useEffect(() => {
    if (!isEditing) setFormData(profileFormData(userProfile, lang));
  }, [userProfile, lang, isEditing]);

  const [recentBookings, setRecentBookings] = useState([]);
  const [olderBookings, setOlderBookings] = useState([]),
    [hasOlder, setHasOlder] = useState(true);
  const userBookings = [
    ...recentBookings,
    ...olderBookings.filter((b) => !recentBookings.some((r) => r.id === b.id)),
  ];
  async function loadOlder() {
    if (busy || !userBookings.length) return;
    setBusy(true);
    try {
      const rows = await fetchProfileRecords(supabase, "bookings", userProfile.uid, {
        before: userBookings.at(-1), limit: 100,
      });
      setOlderBookings((prev) => [...prev, ...rows]);
      setHasOlder(rows.length === 100);
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const [joinedMatches, setJoinedMatches] = useState([]);
  React.useEffect(() => {
    setRecentBookings([]);
    setOlderBookings([]);
    setJoinedMatches([]);
    setEvents([]);
    setHasOlder(true);
    setSectionState({});
  }, [userProfile?.uid]);

  React.useEffect(() => {
    if (!userProfile?.uid || !["bookings", "matches", "credibility"].includes(tab)) return;
    setSectionState(previous => ({ ...previous, [tab]: { loading: true, error: null } }));
    return watchProfileRecords(supabase, tab, userProfile.uid, rows => {
      if (tab === "bookings") {
        setRecentBookings(rows);
        setHasOlder(rows.length === 100);
      } else if (tab === "matches") setJoinedMatches(rows);
      else setEvents(rows);
      setSectionState(previous => ({ ...previous, [tab]: { loading: false, error: null } }));
    }, error => {
      setSectionState(previous => ({ ...previous, [tab]: { loading: false, error } }));
    }, { limit: 100 });
  }, [userProfile?.uid, tab, retry]);
  // Cancel booking handler with custom ConfirmModal & Toast (Rule 1.2)
  const handleRequestCancel = (bookingId) => {
    setPendingCancelId(bookingId);
  };

  const handleConfirmCancel = async () => {
    if (!pendingCancelId || busy) return;
    setBusy(true);
    try {
      await api("bookingTransition", {
        bookingId: pendingCancelId,
        operation: "cancel",
      });
      showInfo(
        lang === "vi"
          ? "Đã hủy. Xem trạng thái yêu cầu hoàn tiền trong đơn."
          : "Cancelled. Check the refund request status in your order.",
      );
      setPendingCancelId(null);
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const savedProfile = await api("saveProfile", formData);
      setUserProfile((previous) => ({ ...previous, ...savedProfile }));
      setFormData(profileFormData(savedProfile, lang));
      setIsEditing(false);
      showSuccess(lang === "vi" ? "Đã lưu hồ sơ." : "Profile saved.");
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };
  async function deleteAccount() {
    if (busy) return;
    setBusy(true);
    try {
      if (password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: userProfile.email || "",
          password
        });
        if (error) throw error;
      }
      
      await api("deleteAccount", { password });
      await supabase.auth.signOut();
      onClose();
      showSuccess(lang === "vi" ? "Đã xóa tài khoản." : "Account deleted.");
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content profile-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Avatar & User Info */}
        <div className="profile-header">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, var(--btn-primary), var(--highlight))",
                color: "var(--btn-primary-text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1.6rem",
                fontWeight: 800,
                boxShadow: "var(--shadow-glow)",
              }}
            >
              {formData.name.charAt(0)}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: 800,
                    color: "var(--text-primary)",
                  }}
                >
                  {formData.name}
                </h3>
                <span
                  className="badge badge-highlight"
                  style={{ fontSize: "0.72rem" }}
                >
                  {lang === "vi"
                    ? "Tài khoản SportSpace"
                    : "SportSpace account"}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: "0.8rem",
                  color: "var(--text-muted)",
                  marginTop: 2,
                }}
              >
                <span>📍 {formData.province}</span>
                <span>•</span>
                <span>
                  {lang === "vi" ? "Trình độ:" : "Skill:"}{" "}
                  <strong>{formData.skillLevel}</strong>
                </span>
              </div>
            </div>
          </div>

          <div className="profile-actions">
            <button
              type="button"
              onClick={() => setTab("credibility")}
              className={`profile-score ${tab === "credibility" ? "is-active" : ""}`}
              title={lang === "vi" ? "Xem điểm uy tín" : "View credibility score"}
            >
              <ShieldCheck size={16} />
              <span className="profile-score-label">
                {lang === "vi" ? "Uy tín" : "Score"}
              </span>
              <strong>{userProfile?.credibilityScore ?? 0}</strong>
              <small>/100</small>
            </button>
            {userProfile?.role === "merchant" ? (
              <button
                onClick={() => {
                  onClose();
                  onSwitchToMerchant();
                }}
                className="btn btn-secondary"
                title={
                  lang === "vi"
                    ? "Chuyển sang Quản trị viên Chủ sân"
                    : "Switch to Merchant Portal"
                }
              >
                <Building2 size={14} />
                <span>
                  {lang === "vi" ? "Cổng Chủ Sân" : "Merchant Portal"}
                </span>
              </button>
            ) : (
              <button
                onClick={() => {
                  setApplying(true);
                }}
                className="btn"
                style={{
                  background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                  color: "#FFF",
                  border: "none",
                }}
                title={
                  lang === "vi"
                    ? "Đăng ký đối tác Chủ sân"
                    : "Apply for Merchant Partner"
                }
              >
                <Award size={14} />
                <span>
                  {lang === "vi"
                    ? "Đăng ký làm Chủ sân"
                    : "Apply as Venue Owner"}
                </span>
              </button>
            )}

            <button
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  await onLogout();
                  showSuccess(lang === "vi" ? "Đã đăng xuất." : "Logged out.");
                } catch (e) {
                  showError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
              className="btn"
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                color: "#EF4444",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                whiteSpace: "nowrap"
              }}
              title={lang === "vi" ? "Đăng xuất" : "Log Out"}
            >
              <LogOut size={14} />
              <span>{lang === "vi" ? "Đăng xuất" : "Log Out"}</span>
            </button>

            <button
              aria-label={lang === "vi" ? "Đóng hồ sơ" : "Close profile"}
              onClick={onClose}
              className="btn btn-outline profile-close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs Navigation */}
        <div
          className="profile-tabs"
          style={{
            display: "flex",
            gap: 8,
            borderBottom: "1px solid var(--surface-card-border)",
            paddingBottom: 8,
            marginBottom: 18,
            overflowX: "auto",
          }}
        >
          <button
            onClick={() => setTab("bookings")}
            className={`btn ${tab === "bookings" ? "btn-primary" : "btn-outline"}`}
            style={{
              padding: "6px 14px",
              fontSize: "0.82rem",
              whiteSpace: "nowrap",
            }}
          >
            <Calendar size={14} />
            <span>
              {lang === "vi"
                ? `Lịch sử đặt sân (${userBookings.length})`
                : `Booking History (${userBookings.length})`}
            </span>
          </button>

          <button
            onClick={() => setTab("saved")}
            className={`btn ${tab === "saved" ? "btn-primary" : "btn-outline"}`}
            style={{
              padding: "6px 14px",
              fontSize: "0.82rem",
              whiteSpace: "nowrap",
            }}
          >
            <Heart size={14} />
            <span>
              {lang === "vi"
                ? `Sân đã lưu (${savedVenues.length})`
                : `Saved Venues (${savedVenues.length})`}
            </span>
          </button>

          <button
            onClick={() => setTab("matches")}
            className={`btn ${tab === "matches" ? "btn-primary" : "btn-outline"}`}
            style={{
              padding: "6px 14px",
              fontSize: "0.82rem",
              whiteSpace: "nowrap",
            }}
          >
            <Trophy size={14} />
            <span>
              {lang === "vi"
                ? `Kèo giao lưu (${joinedMatches.length})`
                : `Matches (${joinedMatches.length})`}
            </span>
          </button>

          <button
            onClick={() => setTab("credibility")}
            className={`btn ${tab === "credibility" ? "btn-primary" : "btn-outline"}`}
            style={{
              padding: "6px 14px",
              fontSize: "0.82rem",
              whiteSpace: "nowrap",
            }}
          >
            <Award size={14} />
            <span>{lang === "vi" ? "Điểm uy tín" : "Credibility"}</span>
          </button>

          <button
            onClick={() => setTab("info")}
            className={`btn ${tab === "info" ? "btn-primary" : "btn-outline"}`}
            style={{
              padding: "6px 14px",
              fontSize: "0.82rem",
              whiteSpace: "nowrap",
            }}
          >
            <User size={14} />
            <span>{lang === "vi" ? "Thông tin cá nhân" : "Personal Info"}</span>
          </button>
        </div>

        <div
          style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}
          className="custom-scrollbar"
        >
          {/* =========================================================================
            TAB 1: LỊCH SỬ ĐẶT SÂN & CHÍNH SÁCH HỦY HOÀN CỌC (README 4.1)
            ========================================================================= */}
          {tab === "bookings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {userBookings.map((b) => (
                <div
                  key={b.id}
                  style={{
                    background: "var(--surface-card)",
                    borderRadius: "14px",
                    padding: "16px",
                    border: "1px solid var(--surface-card-border)",
                    fontSize: "0.85rem",
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
                    <strong
                      style={{
                        fontSize: "0.95rem",
                        color: "var(--text-primary)",
                      }}
                    >
                      {b.venueName}
                    </strong>
                    <span
                      className="badge badge-highlight"
                      style={{ fontSize: "0.7rem", overflowWrap: "anywhere" }}
                    >
                      {b.ticketId || b.id}
                    </span>
                  </div>

                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "0.82rem",
                      marginBottom: 8,
                    }}
                  >
                    🏟️ <strong>{b.courtName}</strong> • 🕒 {b.time} (
                    {b.date === "Hôm nay"
                      ? lang === "vi"
                        ? "Hôm nay"
                        : "Today"
                      : b.date}
                    ) • {lang === "vi" ? "Thanh toán:" : "Payment:"}{" "}
                    <strong>{b.paymentMethod}</strong>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: 10,
                      borderTop: "1px solid var(--surface-card-border)",
                    }}
                  >
                    <div>
                      <span
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "0.78rem",
                        }}
                      >
                        {lang === "vi"
                          ? "Đã xác minh nhận: "
                          : "Verified received: "}
                      </span>
                      <strong style={{ color: "var(--accent-orange)" }}>
                        {Number(b.depositPaid || 0).toLocaleString()}đ
                      </strong>
                    </div>

                    <div>
                      <span>{bookingLabel(b, lang)}</span>
                      {b.schemaVersion === 2 &&
                        ["held", "pending_approval", "confirmed"].includes(
                          b.status,
                        ) && (
                          <button
                            className="btn btn-outline"
                            disabled={busy}
                            onClick={() => handleRequestCancel(b.id)}
                          >
                            {lang === "vi" ? "Hủy đặt sân" : "Cancel booking"}
                          </button>
                        )}
                      {b.status === "confirmed" &&
                        b.startAt <= Date.now() &&
                        !b.attendanceConfirmedAt && (
                          <button
                            className="btn btn-outline"
                            disabled={busy}
                            onClick={() =>
                              api("confirmAttendance", { bookingId: b.id })
                                .then(() =>
                                  showInfo(
                                    lang === "vi"
                                      ? "Đã xác nhận tham dự."
                                      : "Attendance confirmed.",
                                  ),
                                )
                                .catch((e) => showError(e.message))
                            }
                          >
                            {lang === "vi"
                              ? "Xác nhận tham dự"
                              : "Confirm attendance"}
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* =========================================================================
            TAB 2: SÂN ĐÃ LƯU (SAVED VENUES / WISHLIST - README 4.1)
            ========================================================================= */}
          {tab === "saved" && (
            <div>
              {savedVenues.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "36px 10px",
                    color: "var(--text-muted)",
                  }}
                >
                  <Heart
                    size={36}
                    color="var(--text-muted)"
                    style={{ margin: "0 auto 10px" }}
                  />
                  <h4 style={{ fontWeight: 700 }}>
                    {lang === "vi"
                      ? "Chưa có sân nào được lưu"
                      : "No saved venues yet"}
                  </h4>
                  <p style={{ fontSize: "0.82rem", marginTop: 4 }}>
                    {lang === "vi"
                      ? "Hãy bấm biểu tượng trái tim trên các thẻ sân để lưu và đặt lịch nhanh bất cứ lúc nào."
                      : "Click the heart icon on any venue card to save and book quickly at any time."}
                  </p>
                </div>
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  {savedVenues.map((venue) => (
                    <div
                      key={venue.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "var(--surface-card)",
                        borderRadius: "12px",
                        padding: "12px 16px",
                        border: "1px solid var(--surface-card-border)",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span
                            className="badge badge-sport"
                            style={{ fontSize: "0.68rem" }}
                          >
                            {venue.sport}
                          </span>
                          <strong
                            style={{
                              fontSize: "0.92rem",
                              color: "var(--text-primary)",
                            }}
                          >
                            {venue.name}
                          </strong>
                        </div>
                        <div
                          style={{
                            fontSize: "0.78rem",
                            color: "var(--text-muted)",
                            marginTop: 2,
                          }}
                        >
                          📍 {venue.address || venue.province} • 🏟️{" "}
                          {venue.scale_courts}{" "}
                          {lang === "vi" ? "sân con" : "courts"}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <button
                          onClick={() => {
                            onClose();
                            onBookNow(venue);
                          }}
                          className="btn btn-primary"
                          style={{ padding: "6px 12px", fontSize: "0.78rem" }}
                        >
                          {lang === "vi" ? "Đặt sân" : "Book"}
                        </button>
                        <button
                          onClick={() => {
                            onRemoveSavedVenue(venue.id);
                          }}
                          className="btn btn-outline"
                          style={{ padding: "6px 10px", color: "#DC2626" }}
                          title={lang === "vi" ? "Bỏ lưu" : "Remove"}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
            TAB 3: LỊCH SỬ GHÉP TRẬN (MATCHMAKING HISTORY - README 4.1)
            ========================================================================= */}
          {tab === "matches" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {joinedMatches.map((m) => (
                <div
                  key={m.id}
                  style={{
                    background: "var(--surface-card)",
                    borderRadius: "12px",
                    padding: "14px",
                    border: "1px solid var(--surface-card-border)",
                    fontSize: "0.85rem",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>
                    {m.title}
                  </div>
                  <div
                    style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}
                  >
                    📍 {m.venueName} • 🕒 {m.time}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 6,
                      fontSize: "0.78rem",
                    }}
                  >
                    <span
                      style={{
                        color: "var(--btn-primary-hover)",
                        fontWeight: 700,
                      }}
                    >
                      {m.role}
                    </span>
                    <span style={{ color: "#16A34A", fontWeight: 700 }}>
                      ● {m.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* =========================================================================
            TAB 4: ĐIỂM UY TÍN & BẢNG QUY TẮC CHỐNG BÙNG HẸN (README 4.1)
            ========================================================================= */}
          {tab === "credibility" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div
                style={{
                  background: "var(--bg-primary)",
                  padding: "16px",
                  borderRadius: "12px",
                  border: "1px solid var(--surface-card-border)",
                }}
              >
                <h4
                  style={{
                    fontSize: "0.95rem",
                    fontWeight: 800,
                    marginBottom: 8,
                    color: "var(--text-primary)",
                  }}
                >
                  {lang === "vi"
                    ? "Quy Tắc Tính Điểm Uy Tín SportSpace:"
                    : "SportSpace Credibility Scoring Rules:"}
                </h4>
                <p>
                  {lang === "vi"
                    ? "Điểm chỉ thay đổi theo sự kiện tham dự đã xác minh. Không tự trừ điểm vì đã qua giờ."
                    : "Scores change only for verified attendance events; time passing alone does not deduct points."}
                </p>
                {events.map((e) => (
                  <p key={e.id}>
                    {e.delta > 0 ? "+" : ""}
                    {e.delta} · {e.reason}
                  </p>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    padding: "14px",
                    background: "var(--surface-card)",
                    borderRadius: "10px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "1.4rem",
                      fontWeight: 900,
                      color: "#16A34A",
                    }}
                  >
                    {events.length}
                  </div>
                  <div
                    style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                  >
                    {lang === "vi"
                      ? "Sự kiện tham dự đã xác minh"
                      : "Verified attendance events"}
                  </div>
                </div>
                <div
                  style={{
                    padding: "14px",
                    background: "var(--surface-card)",
                    borderRadius: "10px",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "1.4rem",
                      fontWeight: 900,
                      color: "var(--btn-primary-hover)",
                    }}
                  >
                    {lang === "vi" ? "Chưa xác minh" : "Unverified"}
                  </div>
                  <div
                    style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}
                  >
                    {lang === "vi"
                      ? "Vi phạm bùng lịch hẹn"
                      : "No-show Violations"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================================
            TAB 5: THÔNG TIN HỒ SƠ & CHỈNH SỬA (README 4.1)
            ========================================================================= */}
          {tab === "info" && (
            <form
              className="booking-flow"
              onSubmit={handleSaveProfile}
              onChange={() => setIsEditing(true)}
              style={{ display: "flex", flexDirection: "column", gap: 12 }}
            >
              <label>
                {lang === "vi" ? "Ngôn ngữ mặc định" : "Preferred language"}
                <select
                  value={formData.preferredLanguage}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      preferredLanguage: e.target.value,
                    })
                  }
                >
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                {lang === "vi" ? "Môn thể thao yêu thích" : "Favorite sports"}
                <div className="form-row">
                  {[
                    "Pickleball",
                    "Bóng đá",
                    "Cầu lông",
                    "Tennis",
                    "Bóng rổ",
                    "Bóng bàn",
                    "Bóng chuyền",
                  ].map((s) => (
                    <label key={s}>
                      <input
                        type="checkbox"
                        checked={formData.favoriteSports.includes(s)}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            favoriteSports: e.target.checked
                              ? [...formData.favoriteSports, s]
                              : formData.favoriteSports.filter((v) => v !== s),
                          })
                        }
                      />{" "}
                      {s}
                    </label>
                  ))}
                </div>
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    {lang === "vi" ? "Họ và tên:" : "Full Name:"}
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--surface-card-border)",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    {lang === "vi" ? "Số điện thoại:" : "Phone Number:"}
                  </label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--surface-card-border)",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    marginBottom: 4,
                  }}
                >
                  {lang === "vi"
                    ? "Email đăng nhập (đổi qua xác minh riêng):"
                    : "Login email (separate verification required):"}
                </label>
                <input
                  type="email"
                  disabled
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--surface-card-border)",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    fontSize: "0.85rem",
                  }}
                />
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    {lang === "vi" ? "Khu vực sinh sống:" : "City / Province:"}
                  </label>
                  <input
                    type="text"
                    value={formData.province}
                    onChange={(e) =>
                      setFormData({ ...formData, province: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--surface-card-border)",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      marginBottom: 4,
                    }}
                  >
                    {lang === "vi"
                      ? "Trình độ thể thao:"
                      : "Sport Skill Level:"}
                  </label>
                  <select
                    value={formData.skillLevel}
                    onChange={(e) =>
                      setFormData({ ...formData, skillLevel: e.target.value })
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--surface-card-border)",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="Mới bắt đầu (Beginner)">
                      {lang === "vi" ? "Mới bắt đầu (Beginner)" : "Beginner"}
                    </option>
                    <option value="Phong trào (3.0)">
                      {lang === "vi"
                        ? "Phong trào (3.0)"
                        : "Intermediate (3.0)"}
                    </option>
                    <option value="Khá / Thi đấu cọ xát (3.5+)">
                      {lang === "vi"
                        ? "Khá / Thi đấu cọ xát (3.5+)"
                        : "Advanced (3.5+)"}
                    </option>
                    <option value="Bán chuyên / Chuyên nghiệp">
                      {lang === "vi"
                        ? "Bán chuyên / Chuyên nghiệp"
                        : "Semi-pro / Professional"}
                    </option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn btn-primary"
                style={{ marginTop: 8, padding: "10px", fontSize: "0.88rem" }}
              >
                <Save size={16} />{" "}
                {lang === "vi" ? "Lưu thay đổi hồ sơ" : "Save Profile Changes"}
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="btn btn-outline"
                style={{
                  marginTop: 8,
                  padding: "10px",
                  fontSize: "0.88rem",
                  color: "#DC2626",
                  borderColor: "#DC2626",
                }}
              >
                <Trash2 size={16} />{" "}
                {lang === "vi" ? "Xóa tài khoản" : "Delete Account"}
              </button>
            </form>
          )}
        </div>

        {tab === "bookings" && hasOlder && recentBookings.length >= 100 && (
          <button
            className="btn btn-outline"
            disabled={busy}
            onClick={loadOlder}
          >
            {lang === "vi" ? "Tải đơn cũ hơn" : "Load older orders"}
          </button>
        )}
        <AsyncStatus
          loading={sectionState[tab]?.loading}
          error={sectionState[tab]?.error}
          empty={!sectionState[tab]?.loading && !sectionState[tab]?.error && (
            (tab === "bookings" && userBookings.length === 0) ||
            (tab === "matches" && joinedMatches.length === 0) ||
            (tab === "credibility" && events.length === 0)
          )}
          retry={() => setRetry((v) => v + 1)}
          lang={lang}
        />
        {applying && (
          <MerchantApplicationForm
            uid={userProfile.uid}
            lang={lang}
            onClose={() => setApplying(false)}
          />
        )}
        {/* Custom Confirm Modal replacing native window.confirm (Rule 1.2) */}
        <ConfirmModal
          isOpen={!!pendingCancelId}
          title={
            lang === "vi" ? "Xác nhận hủy đặt sân" : "Confirm Cancellation"
          }
          message={
            lang === "vi"
              ? "Hủy trước ít nhất 12 giờ đủ điều kiện yêu cầu hoàn tiền đã xác minh. Chủ sân thực hiện và xác nhận hoàn khoản chuyển. Bạn có chắc muốn hủy đặt sân này?"
              : "Cancel at least 12 hours in advance to request a refund of verified payments. The owner transfers and verifies the refund. Are you sure you want to cancel this booking?"
          }
          confirmText={
            lang === "vi"
              ? "Hủy sân và yêu cầu hoàn"
              : "Cancel & Request Refund"
          }
          cancelText={lang === "vi" ? "Quay lại" : "Keep Booking"}
          type="danger"
          onConfirm={handleConfirmCancel}
          onClose={() => setPendingCancelId(null)}
        />

        <ConfirmModal
          isOpen={showDeleteConfirm}
          title={
            lang === "vi"
              ? "Xác nhận xóa tài khoản"
              : "Confirm Account Deletion"
          }
          message={
            lang === "vi"
              ? "Cảnh báo: Hành động này không thể hoàn tác. Hồ sơ sẽ bị xóa; lịch sử giao dịch được giữ để đối soát. Tài khoản có đơn hoạt động chưa thể xóa. Bạn có chắc chắn muốn tiếp tục?"
              : "Warning: This action cannot be undone. Your profile is deleted; transaction history is retained for reconciliation. Active orders prevent deletion. Are you sure?"
          }
          confirmText={lang === "vi" ? "Xóa vĩnh viễn" : "Delete Permanently"}
          cancelText={lang === "vi" ? "Hủy" : "Cancel"}
          type="danger"
          onConfirm={deleteAccount}
          onClose={() => {
            setShowDeleteConfirm(false);
            setPassword("");
          }}
        >
          {true && (
            <label className="booking-flow">
              {lang === "vi"
                ? "Mật khẩu để xác thực xóa tài khoản"
                : "Password to verify account deletion"}
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={busy}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          )}
        </ConfirmModal>
      </div>
    </div>
  );
}
