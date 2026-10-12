import React, { useEffect, useRef, useState } from "react";
import {
  IconMapPin,
  IconCalendar,
  IconClock,
  IconUsers,
  IconTrophy,
  IconCircleCheck,
  IconX,
  IconChevronRight,
  IconUserCheck,
  IconPlus,
  IconRefresh,
  IconBallFootball,
  IconBallBasketball,
  IconBallTennis,
  IconBallVolleyball,
  IconPingPong,
  IconAward,
  IconFlame
} from "@tabler/icons-react";
import { IconBadminton, IconPickleball } from "./SportIcons";
import { api } from "../services/api";
import { performMatchAction } from "../services/matchUpdates";
import { publicMatchFeed } from "../services/publicMatches";
import { localDate, normalize } from "../../functions/domain";
import { useToast } from "./ToastContext";
import ConfirmModal from "./ConfirmModal";
import AsyncStatus from "./AsyncStatus";
import { getCurrentPosition, getDistance } from "../utils/geo";
export default function MatchmakingSection({
  lang = "vi",
  userProfile,
  onRequireAuth,
  requestedMatchId,
  onRequestedMatchHandled = () => {},
}) {
  const tr = (vi, en) => (lang === "vi" ? vi : en),
    { showError, showSuccess } = useToast();
  const localized = (match, field) =>
    match?.[`${field}${lang === "vi" ? "Vi" : "En"}`] || match?.[field] || "";
  const [matches, setMatches] = useState(() => publicMatchFeed.read() || []),
    [loading, setLoading] = useState(() => publicMatchFeed.read() === undefined),
    [error, setError] = useState(null),
    [retry, setRetry] = useState(0);
  const [displayLimit, setDisplayLimit] = useState(24);
  const [sport, setSport] = useState("ALL"),
    [dateFilter, setDateFilter] = useState("ALL"),
    [maxDistance, setMaxDistance] = useState("ALL"),
    [userLocation, setUserLocation] = useState(null),
    [showForm, setShowForm] = useState(false),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(null),
    [selectedMatch, setSelectedMatch] = useState(null);

  const getSportBadgeStyle = (s) => {
    const norm = (s || "").toLowerCase();
    switch (norm) {
      case "bóng đá":
      case "football":
      case "soccer":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25";
      case "pickleball":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25";
      case "cầu lông":
      case "badminton":
        return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25";
      case "tennis":
        return "bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/25";
      case "bóng rổ":
      case "basketball":
        return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25";
      case "bóng bàn":
      case "table tennis":
        return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25";
      case "bóng chuyền":
      case "volleyball":
        return "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25";
      default:
        return "bg-[var(--brand-sport)]/10 text-[var(--brand-sport)] border-[var(--brand-sport)]/25";
    }
  };

  const getSportIcon = (s, size = 15, className = "") => {
    const norm = (s || "").toLowerCase();
    switch (norm) {
      case "bóng đá":
      case "football":
      case "soccer":
        return <IconBallFootball size={size} stroke={1.75} className={className} />;
      case "bóng rổ":
      case "basketball":
        return <IconBallBasketball size={size} stroke={1.75} className={className} />;
      case "tennis":
        return <IconBallTennis size={size} stroke={1.75} className={className} />;
      case "bóng chuyền":
      case "volleyball":
        return <IconBallVolleyball size={size} stroke={1.75} className={className} />;
      case "bóng bàn":
      case "table tennis":
        return <IconPingPong size={size} stroke={1.75} className={className} />;
      case "cầu lông":
      case "badminton":
        return <IconBadminton size={size} stroke={1.75} className={className} />;
      case "pickleball":
        return <IconPickleball size={size} stroke={1.75} className={className} />;
      default:
        return <IconTrophy size={size} stroke={1.75} className={className} />;
    }
  };

  const getSportLabel = (s) => {
    if (!s) return "";
    const map = {
      pickleball: { vi: "Pickleball", en: "Pickleball" },
      "bóng đá": { vi: "Bóng đá", en: "Football" },
      football: { vi: "Bóng đá", en: "Football" },
      soccer: { vi: "Bóng đá", en: "Football" },
      "cầu lông": { vi: "Cầu lông", en: "Badminton" },
      badminton: { vi: "Cầu lông", en: "Badminton" },
      tennis: { vi: "Tennis", en: "Tennis" },
      "bóng rổ": { vi: "Bóng rổ", en: "Basketball" },
      basketball: { vi: "Bóng rổ", en: "Basketball" },
      "bóng bàn": { vi: "Bóng bàn", en: "Table Tennis" },
      "table tennis": { vi: "Bóng bàn", en: "Table Tennis" },
      "bóng chuyền": { vi: "Bóng chuyền", en: "Volleyball" },
      volleyball: { vi: "Bóng chuyền", en: "Volleyball" },
    };
    const entry = map[s.toLowerCase()];
    if (!entry) return s;
    return lang === "vi" ? entry.vi : entry.en;
  };

  const isSportMatching = (matchSport, selectedSport) => {
    if (selectedSport === "ALL") return true;
    if (!matchSport) return false;
    if (matchSport === selectedSport) return true;
    const sportEquivalents = [
      ["Bóng đá", "Football", "Soccer"],
      ["Cầu lông", "Badminton"],
      ["Bóng rổ", "Basketball"],
      ["Bóng bàn", "Table Tennis"],
      ["Bóng chuyền", "Volleyball"],
      ["Pickleball"],
      ["Tennis"],
    ];
    for (const group of sportEquivalents) {
      const lowerGroup = group.map((n) => n.toLowerCase());
      if (
        lowerGroup.includes(matchSport.toLowerCase()) &&
        lowerGroup.includes(selectedSport.toLowerCase())
      ) {
        return true;
      }
    }
    return false;
  };

  const blank = () => ({
    sport: "Pickleball",
    province: "",
    venueName: "",
    date: localDate(),
    startTime: "",
    endTime: "",
    playersMax: 4,
    costPerPerson: 0,
    levelRequired: "",
  });
  const [form, setForm] = useState(blank),
    [editingId, setEditingId] = useState(null);
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    setLoading(publicMatchFeed.read() === undefined);
    setError(null);
    return publicMatchFeed.subscribe(
      (v) => {
        setMatches(v);
        setError(null);
        setLoading(false);
      },
      (e) => {
        setError(e);
        setLoading(false);
      },
      { force: retry > 0 },
    );
  }, [retry]);
  useEffect(() => { setDisplayLimit(24); }, [sport, dateFilter, maxDistance, userLocation]);
  useEffect(() => {
    if (!requestedMatchId || !userProfile || loading) return;
    const match = matches.find((item) => item.id === requestedMatchId);
    if (match && !(match.joinedUsers || []).includes(userProfile.uid)) setSelectedMatch(match);
    onRequestedMatchHandled();
  }, [requestedMatchId, userProfile, loading, matches, onRequestedMatchHandled]);
  async function create(e) {
    e.preventDefault();
    if (busy) return;
    if (!userProfile) {
      onRequireAuth();
      return;
    }
    setBusy(true);
    try {
      await performMatchAction(api, publicMatchFeed, editingId ? "editMatch" : "createMatch", {
        ...form,
        title: form.sport,
        key: key.current,
        matchId: editingId,
      });
      setShowForm(false);
      setEditingId(null);
      setForm(blank());
      key.current = crypto.randomUUID();
      showSuccess(tr("Đã lưu kèo.", "Match saved."));
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function change(m, operation) {
    if (!userProfile) {
      onRequireAuth();
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await performMatchAction(api, publicMatchFeed, "matchTransition", { matchId: m.id, operation });
      if (operation === "cancel") setSelectedMatch(null);
      setConfirm(null);
      if (operation === "join") {
        showSuccess(tr("Đã tham gia trận đấu.", "You joined the match."));
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const visible = matches.filter((m) => {
    if (m.startAt <= Date.now()) return false;
    if (m.playersJoined >= m.playersMax && m.hostId !== userProfile?.uid
      && !(m.joinedUsers || []).includes(userProfile?.uid)) return false;
    if (sport !== "ALL" && !isSportMatching(m.sport, sport)) return false;
    
    if (dateFilter !== "ALL") {
      const msPerDay = 24 * 60 * 60 * 1000;
      const today = new Date().setHours(0,0,0,0);
      const matchDay = new Date(m.startAt).setHours(0,0,0,0);
      const diff = (matchDay - today) / msPerDay;

      if (dateFilter === "today" && diff !== 0) return false;
      if (dateFilter === "tomorrow" && diff !== 1) return false;
      if (dateFilter === "3days" && (diff < 0 || diff > 3)) return false;
      if (dateFilter === "1week" && (diff < 0 || diff > 7)) return false;
    }

    if (maxDistance !== "ALL" && userLocation) {
      const dist = getDistance(userLocation.lat, userLocation.lng, m.lat, m.lng);
      if (dist === null || dist > Number(maxDistance)) return false;
    }

    return true;
  });
  const sports = [
    "Pickleball",
    "Bóng đá",
    "Cầu lông",
    "Tennis",
    "Bóng rổ",
    "Bóng bàn",
    "Bóng chuyền",
  ];
  return (
    <section
      id="matchmaking-section"
      className="container booking-flow"
      style={{ padding: "32px 20px" }}
    >
      {/* Header & Command Bar */}
      <div className="mb-6 space-y-3.5">
        {/* Top Header Row: Title, Match Counter Badge, and Create Match Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl md:text-2xl font-extrabold text-[var(--text-primary)] tracking-tight m-0">
              {tr("Ghép đội và giao lưu", "Find a match")}
            </h2>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[var(--brand-sport)]/10 text-[var(--brand-sport)] border border-[var(--brand-sport)]/20 shadow-sm">
              <span className="live-dot shrink-0" />
              <IconFlame size={14} className="text-amber-500 shrink-0" />
              <span>
                {visible.length} {tr("kèo đang mở", "active matches")}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn btn-primary flex items-center gap-1.5 px-4 py-2 text-sm font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
              disabled={Boolean(userProfile) && Number(userProfile.credibilityScore || 0) <= 80}
              onClick={() => {
                if (!userProfile) {
                  onRequireAuth();
                  return;
                }
                setEditingId(null);
                setForm(blank());
                key.current = crypto.randomUUID();
                setShowForm(true);
              }}
            >
              <IconPlus size={16} stroke={2.5} />
              <span>{tr("Tạo kèo mới", "Create match")}</span>
            </button>
          </div>
        </div>

        {userProfile && Number(userProfile.credibilityScore || 0) <= 80 && (
          <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span>⚠️ {tr("Cần trên 80 điểm uy tín để tạo kèo.", "A credibility score above 80 is required to create a match.")}</span>
          </div>
        )}

        {/* Minimal Command Bar with Tabler Icons */}
        <div className="glass-panel p-2 rounded-2xl border border-[var(--surface-card-border)] shadow-sm bg-[var(--surface-card)] flex flex-col md:flex-row items-stretch md:items-center gap-2">
          {/* Segment 1: Môn thể thao (Sport) */}
          <div className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)] hover:border-[var(--brand-sport)]/50 focus-within:border-[var(--brand-sport)] focus-within:ring-2 focus-within:ring-[var(--brand-sport)]/20 transition-all cursor-pointer">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider leading-none mb-1.5">
              <IconTrophy size={14} stroke={2} className="text-[var(--brand-sport)] shrink-0" />
              <span>{tr("Bộ môn", "Sport")}</span>
            </div>
            <select
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              className="w-full text-xs font-bold text-[var(--text-primary)] cursor-pointer focus:outline-none"
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                outline: "none",
                boxShadow: "none",
                height: "auto",
                lineHeight: "1.2"
              }}
            >
              <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="ALL">{tr("Tất cả môn", "All sports")}</option>
              {sports.map((s) => (
                <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" key={s} value={s}>{getSportLabel(s)}</option>
              ))}
            </select>
          </div>

          {/* Segment 2: Thời gian (Date filter) */}
          <div className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)] hover:border-[var(--brand-space)]/50 focus-within:border-[var(--brand-space)] focus-within:ring-2 focus-within:ring-[var(--brand-space)]/20 transition-all cursor-pointer">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider leading-none mb-1.5">
              <IconCalendar size={14} stroke={2} className="text-[var(--brand-space)] shrink-0" />
              <span>{tr("Thời gian", "Date")}</span>
            </div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full text-xs font-bold text-[var(--text-primary)] cursor-pointer focus:outline-none"
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                outline: "none",
                boxShadow: "none",
                height: "auto",
                lineHeight: "1.2"
              }}
            >
              <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="ALL">{tr("Mọi ngày", "Any day")}</option>
              <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="today">{tr("Hôm nay", "Today")}</option>
              <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="tomorrow">{tr("Ngày mai", "Tomorrow")}</option>
              <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="3days">{tr("3 ngày tới", "Next 3 days")}</option>
              <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="1week">{tr("1 tuần tới", "Next 7 days")}</option>
            </select>
          </div>

          {/* Segment 3: Khoảng cách (Distance) */}
          <div className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)] hover:border-cyan-500/50 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all cursor-pointer">
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider leading-none mb-1.5">
              <IconMapPin size={14} stroke={2} className="text-cyan-600 dark:text-cyan-400 shrink-0" />
              <span>{tr("Khoảng cách", "Distance")}</span>
            </div>
            <select
              value={maxDistance}
              onChange={async (e) => {
                const val = e.target.value;
                if (val !== "ALL" && !userLocation) {
                  try {
                    const loc = await getCurrentPosition();
                    setUserLocation(loc);
                  } catch (err) {
                    showError(err.message || tr("Không lấy được vị trí của bạn", "Could not get your location"));
                    return;
                  }
                }
                setMaxDistance(val);
              }}
              className="w-full text-xs font-bold text-[var(--text-primary)] cursor-pointer focus:outline-none"
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                outline: "none",
                boxShadow: "none",
                height: "auto",
                lineHeight: "1.2"
              }}
            >
              <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="ALL">{tr("Mọi khoảng cách", "Any distance")}</option>
              <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="5">{tr("Dưới 5 km", "Under 5 km")}</option>
              <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="10">{tr("Dưới 10 km", "Under 10 km")}</option>
              <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="20">{tr("Dưới 20 km", "Under 20 km")}</option>
            </select>
          </div>

          {/* Reset Filters button (appears when any filter is active) */}
          {(sport !== "ALL" || dateFilter !== "ALL" || maxDistance !== "ALL") && (
            <button
              type="button"
              onClick={() => {
                setSport("ALL");
                setDateFilter("ALL");
                setMaxDistance("ALL");
              }}
              className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all flex items-center justify-center gap-1.5 shrink-0 self-stretch md:self-auto"
              title={tr("Đặt lại bộ lọc", "Reset filters")}
            >
              <IconRefresh size={14} stroke={2} />
              <span>{tr("Đặt lại", "Reset")}</span>
            </button>
          )}
        </div>
      </div>
      <AsyncStatus
        loading={loading}
        error={error}
        retry={() => setRetry((v) => v + 1)}
        empty={!loading && !visible.length}
        lang={lang}
      />
      <div className="feature-grid">
        {visible.slice(0, displayLimit).map((m) => {
          const joined = (m.joinedUsers || []).includes(userProfile?.uid),
            host = m.hostId === userProfile?.uid,
            spotsNeeded = Math.max(0, m.playersMax - m.playersJoined);
          return (
            <article
              key={m.id}
              onClick={() => setSelectedMatch(m)}
              className="glass-panel group relative flex flex-col justify-between p-5 rounded-2xl cursor-pointer border border-[var(--surface-card-border)] hover:border-[var(--brand-sport)]/50 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden"
              style={{
                background: "var(--surface-card)",
              }}
            >
              {/* Header Badges */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border flex items-center gap-1.5 ${getSportBadgeStyle(m.sport)}`}>
                    {getSportIcon(m.sport, 13)}
                    <span>{getSportLabel(m.sport)}</span>
                  </span>
                  {m.province && (
                    <span className="text-xs text-[var(--text-muted)] flex items-center gap-1 font-medium">
                      <IconMapPin size={12} stroke={1.75} className="shrink-0" />
                      {m.province}
                    </span>
                  )}
                </div>
                {m.reservationStatus === "confirmed" && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 whitespace-nowrap"
                    title={m.courtName ? `${tr("Sân", "Court")}: ${m.courtName}` : ""}
                  >
                    <IconCircleCheck size={12} stroke={2} />
                    {tr("Đã giữ sân", "Court confirmed")}
                  </span>
                )}
              </div>

              {/* Title & Venue */}
              <div className="mb-3">
                <h3 className="text-[15px] font-bold text-[var(--text-primary)] group-hover:text-[var(--brand-sport)] transition-colors line-clamp-2 leading-snug mb-1.5">
                  {getSportLabel(m.sport)}
                </h3>
                <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 truncate">
                  <IconMapPin size={14} stroke={1.75} className="shrink-0 text-[var(--brand-sport)]" />
                  <span className="truncate">{m.venueName}</span>
                </p>
              </div>

              {/* Date & Time pill */}
              <div className="p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-[var(--surface-card-border)]/40 flex flex-col gap-1.5 text-xs mb-3">
                <div className="flex items-center gap-2 text-[var(--text-primary)] font-semibold">
                  <IconCalendar size={14} stroke={1.75} className="text-[var(--brand-space)] shrink-0" />
                  <span>
                    {new Date(m.startAt).toLocaleDateString(
                      lang === "vi" ? "vi-VN" : "en-GB",
                      { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }
                    )}{" "}
                    · {m.time}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] pt-1 border-t border-[var(--surface-card-border)]/40">
                  <span>
                    {tr("Trình độ", "Skill")}:{" "}
                    <strong className="text-[var(--text-primary)] font-medium">
                      {localized(m, "levelRequired") || tr("Mọi trình độ", "Any")}
                    </strong>
                  </span>
                  <span className="flex items-center gap-1 font-medium">
                    <IconAward size={13} stroke={2} className="text-amber-500 shrink-0" />
                    {m.hostName} ({m.hostCredibility ?? 0}đ)
                  </span>
                </div>
              </div>

              {/* Slots & Progress Bar */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[var(--text-muted)] flex items-center gap-1 font-medium">
                    <IconUsers size={13} stroke={1.75} />
                    {m.playersJoined}/{m.playersMax} {tr("người", "joined")}
                  </span>
                  {spotsNeeded > 0 ? (
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      {tr(`Còn thiếu ${spotsNeeded}`, `${spotsNeeded} spots left`)}
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold text-red-500">
                      {tr("Đã đủ người", "Full")}
                    </span>
                  )}
                </div>
                <div className="w-full h-1.5 bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--brand-sport)] to-[var(--brand-space)] rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, (m.playersJoined / m.playersMax) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Bottom Footer: Cost & Action Button */}
              <div className="flex items-center justify-between pt-3 border-t border-[var(--surface-card-border)]/60 mt-auto">
                <div>
                  <div className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
                    {tr("Chi phí", "Cost")}
                  </div>
                  <div className="text-sm font-extrabold text-[var(--brand-sport)]">
                    {typeof m.costPerPerson === "number"
                      ? m.costPerPerson === 0
                        ? tr("Miễn phí", "Free")
                        : `${m.costPerPerson.toLocaleString()} đ`
                      : String(m.costPerPerson ?? m.cost ?? tr("Miễn phí", "Free"))}
                    <span className="text-[10px] font-normal text-[var(--text-muted)] ml-0.5">
                      /{tr("người", "p")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {host ? (
                    <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-[var(--brand-sport)]/15 text-[var(--brand-sport)] border border-[var(--brand-sport)]/25">
                      {tr("Kèo của bạn", "Your match")}
                    </span>
                  ) : joined ? (
                    <span className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                      <IconCircleCheck size={13} stroke={2} />
                      {tr("Đã tham gia", "Joined")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--btn-primary)] text-[var(--btn-primary-text)] hover:opacity-90 transition-all flex items-center gap-1 shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedMatch(m);
                      }}
                    >
                      <span>{tr("Xem chi tiết", "Details")}</span>
                      <IconChevronRight size={14} stroke={2.5} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {visible.length > displayLimit && (
        <button type="button" className="btn btn-outline" style={{ marginTop: 16 }}
          onClick={() => setDisplayLimit(value => value + 24)}>
          {tr("Xem thêm kèo", "Show more matches")} ({Math.min(24, visible.length - displayLimit)})
        </button>
      )}
      {showForm && (
        <div
          className="modal-overlay"
          onClick={() => !busy && setShowForm(false)}
        >
          <form
            className="modal-content booking-flow"
            onClick={(e) => e.stopPropagation()}
            onSubmit={create}
          >
            <h3>{tr("Tạo kèo giao lưu", "Create a match")}</h3>
            {Object.entries({
              province: tr("Tỉnh/thành", "Province"),
              venueName: tr("Tên sân", "Venue"),
              levelRequired: tr("Trình độ", "Skill"),
            }).map(([k, label]) => (
              <label key={k}>
                {label}
                <input
                  required
                  maxLength={150}
                  value={form[k]}
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                />
              </label>
            ))}
            <label>
              {tr("Bộ môn", "Sport")}
              <select
                value={form.sport}
                onChange={(e) => setForm({ ...form, sport: e.target.value })}
              >
                {sports.map((s) => (
                  <option key={s} value={s}>{getSportLabel(s)}</option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                {tr("Ngày", "Date")}
                <input
                  type="date"
                  required
                  min={localDate()}
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
              <label>
                {tr("Bắt đầu", "Start")}
                <input
                  type="time"
                  required
                  value={form.startTime}
                  onChange={(e) =>
                    setForm({ ...form, startTime: e.target.value })
                  }
                />
              </label>
              <label>
                {tr("Kết thúc", "End")}
                <input
                  type="time"
                  required
                  value={form.endTime}
                  onChange={(e) =>
                    setForm({ ...form, endTime: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                {tr("Tổng người", "Capacity")}
                <input
                  type="number"
                  min={2}
                  max={22}
                  required
                  value={form.playersMax}
                  onChange={(e) =>
                    setForm({ ...form, playersMax: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                {tr("Chi phí/người (VND)", "Cost/player (VND)")}
                <input
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={form.costPerPerson}
                  onChange={(e) =>
                    setForm({ ...form, costPerPerson: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <button
                type="button"
                disabled={busy}
                className="btn btn-outline"
                onClick={() => setShowForm(false)}
              >
                {tr("Đóng", "Close")}
              </button>
              <button disabled={busy} className="btn btn-primary">
                {tr("Đăng kèo", "Publish")}
              </button>
            </div>
          </form>
        </div>
      )}
      <ConfirmModal
        isOpen={!!confirm}
        title={tr("Hủy kèo", "Cancel match")}
        message={tr(
          "Các thành viên sẽ nhận thông báo hủy.",
          "Members will be notified.",
        )}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={() => !busy && change(confirm, "cancel")}
      />

      {/* Matchmaking Detail Modal */}
      {selectedMatch && (() => {
        const activeMatch = matches.find((item) => item.id === selectedMatch.id) || selectedMatch;
        const joined = (activeMatch.joinedUsers || []).includes(userProfile?.uid);
        const host = activeMatch.hostId === userProfile?.uid;
        const spotsNeeded = Math.max(0, activeMatch.playersMax - activeMatch.playersJoined);

        return (
          <div
            className="modal-overlay"
            onClick={() => setSelectedMatch(null)}
          >
            <div
              className="modal-content !max-w-[620px] p-6 rounded-2xl relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top Close Button */}
              <button
                type="button"
                onClick={() => setSelectedMatch(null)}
                className="absolute top-4 right-4 p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                aria-label={tr("Đóng", "Close")}
              >
                <IconX size={20} stroke={2} />
              </button>

              {/* Modal Header */}
              <div className="flex items-center gap-2 mb-2 flex-wrap pr-8">
                <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border flex items-center gap-1.5 ${getSportBadgeStyle(activeMatch.sport)}`}>
                  {getSportIcon(activeMatch.sport, 14)}
                  <span>{getSportLabel(activeMatch.sport)}</span>
                </span>
                {activeMatch.province && (
                  <span className="text-xs text-[var(--text-muted)] font-medium flex items-center gap-1">
                    <IconMapPin size={13} stroke={1.75} /> {activeMatch.province}
                  </span>
                )}
                {activeMatch.reservationStatus === "confirmed" && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    <IconCircleCheck size={13} stroke={2} />
                    {tr("Sân đã xác nhận", "Court confirmed")}
                  </span>
                )}
              </div>

              <h2 className="text-xl font-bold text-[var(--text-primary)] leading-snug mb-4">
                {getSportLabel(activeMatch.sport)}
              </h2>

              {/* Main Info Sections */}
              <div className="space-y-3 mb-6">
                {/* 1. Venue & Location */}
                <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)] flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[var(--brand-sport)]/10 text-[var(--brand-sport)] shrink-0 mt-0.5">
                    <IconMapPin size={18} stroke={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-0.5">
                      {tr("Địa điểm thi đấu", "Venue & Court")}
                    </div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {activeMatch.venueName}
                    </div>
                    {activeMatch.courtName && (
                      <div className="text-xs text-[var(--brand-sport)] font-semibold mt-0.5">
                        {tr("Sân con", "Sub-court")}: {activeMatch.courtName}
                      </div>
                    )}
                    {activeMatch.venueAddress && (
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        {activeMatch.venueAddress}
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Date & Time */}
                <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)] flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-[var(--brand-space)]/15 text-[var(--brand-space)] shrink-0 mt-0.5">
                    <IconCalendar size={18} stroke={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-0.5">
                      {tr("Thời gian trận đấu", "Schedule")}
                    </div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {new Date(activeMatch.startAt).toLocaleDateString(
                        lang === "vi" ? "vi-VN" : "en-GB",
                        { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Ho_Chi_Minh" }
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] font-semibold flex items-center gap-1 mt-0.5">
                      <IconClock size={13} stroke={1.75} />
                      {activeMatch.time}
                    </div>
                  </div>
                </div>

                {/* 3. Skill & Cost Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)]">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      {tr("Trình độ yêu cầu", "Skill Level")}
                    </div>
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {localized(activeMatch, "levelRequired") || tr("Tất cả trình độ", "All levels")}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)]">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1">
                      {tr("Chi phí / người", "Cost per player")}
                    </div>
                    <div className="text-sm font-extrabold text-[var(--brand-sport)]">
                      {typeof activeMatch.costPerPerson === "number"
                        ? activeMatch.costPerPerson === 0
                          ? tr("Miễn phí", "Free")
                          : `${activeMatch.costPerPerson.toLocaleString()} VND`
                        : String(activeMatch.costPerPerson ?? activeMatch.cost ?? tr("Miễn phí", "Free"))}
                    </div>
                  </div>
                </div>

                {/* 4. Match preferences / characteristics */}
                {(activeMatch.genderPreference || activeMatch.ageGroup || activeMatch.playStyle || activeMatch.matchFormat) && (
                  <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)]">
                    <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                      {tr("Đặc điểm trận đấu", "Match Attributes")}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        localized(activeMatch, "genderPreference"),
                        localized(activeMatch, "ageGroup"),
                        localized(activeMatch, "playStyle"),
                        localized(activeMatch, "matchFormat"),
                      ]
                        .filter(Boolean)
                        .map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 text-xs rounded-lg bg-black/5 dark:bg-white/5 text-[var(--text-primary)] font-medium border border-[var(--surface-card-border)]"
                          >
                            {tag}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {/* 5. Host info */}
                <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-[var(--brand-sport)]/15 text-[var(--brand-sport)] flex items-center justify-center font-bold text-sm">
                      {activeMatch.hostName ? activeMatch.hostName.charAt(0).toUpperCase() : "H"}
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)]">{tr("Người tổ chức (Host)", "Organizer")}</div>
                      <div className="text-sm font-bold text-[var(--text-primary)]">{activeMatch.hostName}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-xs font-bold">
                    <IconAward size={14} stroke={2} />
                    <span>{activeMatch.hostCredibility ?? 0} {tr("điểm uy tín", "credibility")}</span>
                  </div>
                </div>

                {/* 6. Participants list */}
                <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)]">
                  <div className="flex items-center justify-between text-xs font-semibold mb-2">
                    <span className="text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                      <IconUsers size={15} stroke={1.75} />
                      {tr("Thành viên tham gia", "Participants")} ({activeMatch.playersJoined}/{activeMatch.playersMax})
                    </span>
                    {spotsNeeded > 0 ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {tr(`Còn thiếu ${spotsNeeded} người`, `${spotsNeeded} spots left`)}
                      </span>
                    ) : (
                      <span className="text-red-500 font-bold">{tr("Đã đủ người", "Full")}</span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 bg-black/[0.06] dark:bg-white/[0.08] rounded-full overflow-hidden mb-2.5">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--brand-sport)] to-[var(--brand-space)] rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, (activeMatch.playersJoined / activeMatch.playersMax) * 100)}%`,
                      }}
                    />
                  </div>

                  {/* Member names cloud */}
                  {(activeMatch.joinedUsers || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(activeMatch.joinedUsers || []).map((uid, index) => (
                        <span
                          key={uid || index}
                          className="px-2.5 py-1 text-xs rounded-full bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--surface-card-border)] flex items-center gap-1 font-medium"
                        >
                          <IconUserCheck size={12} stroke={2} className="text-emerald-500" />
                          {activeMatch.memberNames?.[uid] || tr("Người chơi", "Player")}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--surface-card-border)]">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setSelectedMatch(null)}
                >
                  {tr("Đóng", "Close")}
                </button>

                {host ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      className="btn btn-outline"
                      onClick={() => {
                        setSelectedMatch(null);
                        setEditingId(activeMatch.id);
                        setForm({
                          ...activeMatch,
                          startTime: activeMatch.time.split(" - ")[0],
                          endTime: activeMatch.time.split(" - ")[1],
                        });
                        setShowForm(true);
                      }}
                    >
                      {tr("Sửa kèo", "Edit match")}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="btn btn-outline !text-red-500 !border-red-500/40 hover:!bg-red-500/10"
                      onClick={() => {
                        setSelectedMatch(null);
                        setConfirm(activeMatch);
                      }}
                    >
                      {tr("Hủy kèo", "Cancel match")}
                    </button>
                  </>
                ) : joined ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="btn btn-outline !text-red-500 !border-red-500/40 hover:!bg-red-500/10"
                    onClick={() => {
                      setSelectedMatch(null);
                      change(activeMatch, "leave");
                    }}
                  >
                    {tr("Rời kèo", "Leave")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy || activeMatch.playersJoined >= activeMatch.playersMax}
                    className="btn btn-primary"
                    onClick={() => {
                      setSelectedMatch(null);
                      change(activeMatch, "join");
                    }}
                  >
                    {tr("Tham gia kèo này", "Join match")}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </section>
  );
}
