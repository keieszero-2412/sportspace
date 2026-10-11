import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import HeroSection from "./components/HeroSection";
import VenueCard from "./components/VenueCard";
import VenueCardSkeleton from "./components/VenueCardSkeleton";
import VenueDetailModal from "./components/VenueDetailModal";
import BookingModal from "./components/BookingModal";
import MatchmakingSection from "./components/MatchmakingSection";
import SportIcon, {
  getSportBadgeStyle,
  getSportPillStyle,
  getSportTextColor,
} from "./components/SportIcons";
import {
  IconCalendar,
  IconClock,
  IconHourglass,
  IconSparkles,
  IconMapPin,
  IconRefresh,
} from "@tabler/icons-react";

const MerchantDashboard = React.lazy(
  () => import("./components/MerchantDashboard"),
);
import UserProfileModal from "./components/UserProfileModal";
import NotificationModal from "./components/NotificationModal";
import AuthModal from "./components/AuthModal";
import PasswordRecoveryModal from "./components/PasswordRecoveryModal";
import ErrorBoundary from "./components/ErrorBoundary";
import InfoModal from "./components/InfoModal";

import { supabase } from "./supabase";
import { publicMatchFeed } from "./services/publicMatches";
import {
  api,
  cachedApi,
  watch,
  watchProfile,
  markRead,
  markAllRead,
} from "./services/api";
import AsyncStatus from "./components/AsyncStatus";
import { getCurrentPosition } from "./utils/geo";
const AdminPanel = React.lazy(() => import("./components/AdminPanel"));
import { useToast } from "./components/ToastContext";
import { consumeAuthError, profileForUser } from "./services/auth";

export default function App() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("sportspace_theme") || "light";
  });
  const [lang, setLang] = useState(() => {
    return localStorage.getItem("sportspace_lang") || "vi";
  });
  const [currentTab, setCurrentTab] = useState("explore"); // 'explore' | 'matchmaking' | 'merchant'

  const [venuesData, setVenuesData] = useState([]);
  const [isLoadingVenues, setIsLoadingVenues] = useState(true);

  const { showError } = useToast();
  const [venuesError, setVenuesError] = useState(null);
  const [retryKey, setRetryKey] = useState(0);
  const [venueCursor, setVenueCursor] = useState(null);
  const [hasMoreVenues, setHasMoreVenues] = useState(false);
  const [catalogue, setCatalogue] = useState({
    provinces: [],
    totalVenues: null,
    totalCourts: null,
  });
  const [catalogueError, setCatalogueError] = useState(null);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [savedVenues, setSavedVenues] = useState([]);
  const [latestMatches, setLatestMatches] = useState([]);
  const [pendingJoinMatchId, setPendingJoinMatchId] = useState(null);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("sportspace_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("sportspace_lang", lang);
    if (i18n.language !== lang) {
      i18n.changeLanguage(lang);
    }
  }, [lang, i18n]);

  const [authLoading, setAuthLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const isAdminWorkspace = currentTab === 'admin' && Boolean(userProfile?.isAdmin || userProfile?.role === 'admin');
  const [authUser, setAuthUser] = useState(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let active = true;
    let revision = 0;
    const receiveSession = (session, event) => {
      if (!active) return;
      const next = session?.user || null;
      setAuthUser((previous) =>
        previous?.id === next?.id && event !== "USER_UPDATED" ? previous : next,
      );
      setAuthLoading(false);
    };
    const callbackError = consumeAuthError();
    if (callbackError) showError(callbackError);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      revision++;
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      if (event === "SIGNED_OUT") setPasswordRecovery(false);
      receiveSession(session, event);
    });
    const initialRevision = revision;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || revision !== initialRevision) return;
      if (error) throw error;
      receiveSession(data.session, "INITIAL_SESSION");
    }).catch((error) => {
      if (!active || revision !== initialRevision) return;
      showError(error.message);
      setAuthLoading(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [showError]);

  useEffect(() => {
    let active = true;
    let stopProfile = () => {};
    setShowProfile(false);
    setShowNotifications(false);
    setNotifications([]);
    setSavedVenueIds([]);
    setSavedVenues([]);
    if (!authUser) {
      setUserProfile(null);
      setCurrentTab("explore");
      return;
    }
    let currentProfile = profileForUser(authUser);
    setUserProfile(currentProfile);
    const publishProfile = (row) => {
      if (!active) return;
      currentProfile = profileForUser(authUser, row || currentProfile);
      setUserProfile(currentProfile);
      setSavedVenueIds(currentProfile.savedVenueIds);
      if (["vi", "en"].includes(currentProfile.preferredLanguage))
        setLang(currentProfile.preferredLanguage);
    };
    stopProfile = watchProfile(authUser.id, publishProfile, (error) => {
      if (active) showError(error.message);
    });
    return () => {
      active = false;
      stopProfile();
    };
  }, [authUser, showError]);

  // Search & Filters (README 4.1)
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvince, setSelectedProvince] = useState("ALL");
  const [selectedSport, setSelectedSport] = useState("ALL");
  const [selectedAmenity, setSelectedAmenity] = useState("ALL");
  const [availableDate, setAvailableDate] = useState(""),
    [availableTime, setAvailableTime] = useState(""),
    [availableDuration, setAvailableDuration] = useState(60);
  const [maxDistance, setMaxDistance] = useState("ALL");
  const [userLocation, setUserLocation] = useState(null);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const queryKey = JSON.stringify([
    selectedProvince,
    selectedSport,
    selectedAmenity,
    debouncedSearch,
    availableDate,
    availableTime,
    availableDuration,
    retryKey,
  ]);
  const activeQuery = React.useRef(queryKey);
  activeQuery.current = queryKey;
  const loadVenues = React.useCallback(
    async (cursor = null) => {
      const current = queryKey;
      setIsLoadingVenues(true);
      setVenuesError(null);
      try {
        const page = await api("listVenues", {
          province: selectedProvince,
          sport: selectedSport,
          amenity: selectedAmenity,
          search: debouncedSearch,
          availableDate,
          availableTime,
          availableDuration,
          cursor,
          userLat: userLocation?.lat,
          userLng: userLocation?.lng,
          maxDistance,
        });
        if (activeQuery.current !== current) return;
        setVenuesData((prev) =>
          cursor
            ? [
                ...prev,
                ...page.items.filter((v) => !prev.some((p) => p.id === v.id)),
              ]
            : page.items,
        );
        setVenueCursor(page.cursor);
        setHasMoreVenues(page.hasMore);
      } catch (e) {
        if (activeQuery.current === current) setVenuesError(e);
      } finally {
        if (activeQuery.current === current) setIsLoadingVenues(false);
      }
    },
    [queryKey],
  );
  useEffect(() => {
    if (isAdminWorkspace) return;
    const cached = cachedApi("listVenues", {
      province: selectedProvince,
      sport: selectedSport,
      amenity: selectedAmenity,
      search: debouncedSearch,
      availableDate,
      availableTime,
      availableDuration,
      userLat: userLocation?.lat,
      userLng: userLocation?.lng,
      maxDistance,
      cursor: null,
    });
    setVenueCursor(cached?.cursor || null);
    setHasMoreVenues(cached?.hasMore || false);
    setVenuesData(cached?.items || []);
    loadVenues();
  }, [loadVenues, isAdminWorkspace]);
  useEffect(() => {
    if (isAdminWorkspace) return;
    let active = true;
    setCatalogueError(null);
    api("catalogue")
      .then((value) => {
        if (active) setCatalogue(value);
      })
      .catch((e) => {
        if (active) setCatalogueError(e);
      });
    return () => {
      active = false;
    };
  }, [retryKey, isAdminWorkspace]);
  useEffect(
    () =>
      !isAdminWorkspace ? publicMatchFeed.subscribe(
        (rows) => setLatestMatches(rows.slice(0, 10)),
        (error) => console.warn("Match preview unavailable:", error.message),
      ) : undefined,
    [isAdminWorkspace],
  );

  // System Notifications state (README 4.3)
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  const handleMarkAsRead = (id) => {
    markRead(id).catch((e) => showError(e.message));
  };

  const handleMarkAllAsRead = () => {
    markAllRead(notifications).catch((e) => showError(e.message));
  };

  // Saved Venues Wishlist state (README 4.1)
  const [savedVenueIds, setSavedVenueIds] = useState([]);
  const toggleSaveVenue = React.useCallback(
    async (venueId) => {
      if (!userProfile?.uid) {
        setShowAuth(true);
        return;
      }
      try {
        await api("toggleSavedVenue", { venueId });
      } catch (e) {
        showError(e.message);
      }
    },
    [userProfile?.uid, showError],
  );
  useEffect(() => {
    if (isAdminWorkspace) return;
    if (!userProfile?.uid) return;
    return watch(
      "Notifications",
      [["userId", "==", userProfile.uid]],
      setNotifications,
      (e) => showError(e.message),
      { order: "createdAt", limit: 100 },
    );
  }, [userProfile?.uid, showError, isAdminWorkspace]);
  useEffect(() => {
    let active = true;
    if (isAdminWorkspace) return;
    if (userProfile?.uid)
      api("savedVenues")
        .then((v) => {
          if (active) setSavedVenues(v);
        })
        .catch((e) => {
          if (active) showError(e.message);
        });
    return () => {
      active = false;
    };
  }, [userProfile?.uid, JSON.stringify(savedVenueIds), showError, isAdminWorkspace]);

  // Modals state
  const [detailVenue, setDetailVenue] = useState(null);
  const [bookingVenue, setBookingVenue] = useState(null);
  const [bookingCourtId, setBookingCourtId] = useState(null);
  const [showProfile, setShowProfile] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [infoModalPage, setInfoModalPage] = useState(null);

  // User Profile state (README 4.1)

  // Localized Notification helper
  const getLocalizedNotification = (n, currentLang) => {
    return {
      ...n,
      message: currentLang === "en" ? n.messageEn || n.message : n.message,
      time: new Date(n.createdAt).toLocaleString(
        currentLang === "vi" ? "vi-VN" : "en-GB",
      ),
    };
  };

  const localizedNotifications = useMemo(() => {
    return notifications.map((n) => getLocalizedNotification(n, lang));
  }, [notifications, lang]);

  // Extract sorted list of unique provinces
  const provincesList = catalogue.provinces;

  const sportsList = [
    "ALL",
    "Pickleball",
    "Bóng đá",
    "Cầu lông",
    "Tennis",
    "Bóng rổ",
    "Bóng bàn",
    "Bóng chuyền",
  ];

  const getSportLabel = (sport, currentLang) => {
    if (sport === "ALL")
      return currentLang === "vi" ? "Tất cả bộ môn" : "All Sports";
    if (currentLang === "en") {
      const map = {
        Pickleball: "Pickleball",
        "Bóng đá": "Football / Soccer",
        "Cầu lông": "Badminton",
        Tennis: "Tennis",
        "Bóng rổ": "Basketball",
        "Bóng bàn": "Table Tennis",
        "Bóng chuyền": "Volleyball",
      };
      return map[sport] || sport;
    }
    return sport;
  };

  const filteredVenues = venuesData;
  const displayedVenues = venuesData;

  const handleBookNow = React.useCallback((venue, courtId = null) => {
    setBookingVenue(venue);
    setBookingCourtId(courtId);
  }, []);

  return (
    <div
      className="animate-fade-in smooth-transition"
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      {/* Header is now handled entirely within HeroSection to keep the dashboard intact across all tabs */}

      {/* MAIN VIEW CONTROLLER */}
      <main style={{ flex: 1 }}>
        {/* HERO SECTION (ALWAYS RENDERED AS THE MAIN DASHBOARD HEADER) */}
        {isAdminWorkspace ? <header aria-label="Admin workspace" style={{ borderBottom: '1px solid var(--surface-card-border)', background: 'var(--bg-primary)', padding: '16px 20px' }}>
          <div className="container" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div><strong>SportSpace · Admin</strong><p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{userProfile?.email}</p></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button className="btn btn-outline" onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}>{lang === 'vi' ? 'English' : 'Tiếng Việt'}</button>
              <button className="btn btn-outline" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{lang === 'vi' ? 'Đổi giao diện' : 'Switch theme'}</button>
              <button className="btn btn-outline" onClick={() => setCurrentTab('explore')}>{lang === 'vi' ? 'Về trang người chơi' : 'Back to player site'}</button>
            </div>
          </div>
        </header> : <div>
          <HeroSection
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            selectedProvince={selectedProvince}
            setSelectedProvince={setSelectedProvince}
            selectedSport={selectedSport}
            setSelectedSport={setSelectedSport}
            provincesList={provincesList}
            totalVenues={catalogue.totalVenues}
            totalCourts={catalogue.totalCourts}
            latestMatches={latestMatches}
            authLoading={authLoading}
            lang={lang}
            setLang={(value) => {
              setLang(value);
              if (userProfile?.uid)
                api("saveProfile", { preferredLanguage: value }).catch((e) =>
                  showError(e.message),
                );
            }}
            theme={theme}
            setTheme={setTheme}
            userProfile={userProfile}
            currentTab={currentTab}
            setCurrentTab={setCurrentTab}
            onOpenProfile={() => setShowProfile(true)}
            onOpenAuth={() => setShowAuth(true)}
            onJoinMatch={(match) => {
              if (authLoading) return;
              setPendingJoinMatchId(match.id);
              setCurrentTab("matchmaking");
              if (!userProfile?.uid) {
                setShowAuth(true);
              }
            }}
            unreadNotificationCount={unreadNotificationCount}
            onOpenNotifications={() => setShowNotifications(true)}
          />
        </div>}

        {/* TAB 1: EXPLORE VENUES (KHÁM PHÁ SÂN TOÀN QUỐC - README 4.1) */}
        {currentTab === "explore" && (
          <div>
            <div
              id="venues-section"
              className="container"
              style={{ padding: "36px 20px" }}
            >
              {/* Quick Sport Pills Filter (README 4.1) */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  overflowX: "auto",
                  paddingBottom: 14,
                  marginBottom: 20,
                }}
              >
                {sportsList.map((sport) => {
                  const isAct = selectedSport === sport;
                  return (
                    <button
                      key={sport}
                      onClick={() => setSelectedSport(sport)}
                      className={`inline-flex items-center gap-2 font-extrabold cursor-pointer transition-all border ${getSportPillStyle(sport, isAct)}`}
                      style={{
                        padding: "8px 16px",
                        fontSize: "0.85rem",
                        borderRadius: "9999px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <SportIcon sport={sport} size={15} />
                      <span>{getSportLabel(sport, lang)}</span>
                    </button>
                  );
                })}
              </div>

              {/* Results info header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 22,
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <h2 style={{ fontSize: "1.45rem", fontWeight: 800 }}>
                    {selectedProvince === "ALL"
                      ? lang === "vi"
                        ? "Danh Sách Sân Tất Cả Khu Vực"
                        : "All Locations Venues Directory"
                      : lang === "vi"
                        ? `Sân Thể Thao Tại ${selectedProvince}`
                        : `Sports Venues in ${selectedProvince}`}
                    {selectedSport !== "ALL" &&
                      <span className={`inline-flex items-center gap-1.5 ml-2.5 px-3 py-0.5 rounded-full text-xs font-bold border align-middle ${getSportBadgeStyle(selectedSport)}`}>
                        <SportIcon sport={selectedSport} size={14} />
                        <span>{getSportLabel(selectedSport, lang)}</span>
                      </span>
                    }
                  </h2>
                  <div
                    style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}
                  >
                    {lang === "vi"
                      ? `Đã tải ${filteredVenues.length} cụm sân phù hợp • ${savedVenues.length} sân trong danh sách yêu thích`
                      : `Loaded ${filteredVenues.length} matching venues • ${savedVenues.length} venues in favorites`}
                  </div>
                </div>

              </div>

              {/* Find Venues Glass Command Bar - Styled identical to Matchmaking */}
              <div className="glass-panel p-2 rounded-2xl border border-[var(--surface-card-border)] shadow-sm bg-[var(--surface-card)] flex flex-col md:flex-row flex-wrap items-stretch md:items-center gap-2 mb-4">
                {/* Segment 1: Ngày đặt sân (Play date) */}
                <div className="flex-1 min-w-[140px] px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)] hover:border-blue-500/50 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all cursor-pointer">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider leading-none mb-1.5">
                    <IconCalendar size={14} stroke={2} className="text-blue-500 shrink-0" />
                    <span>{lang === "vi" ? "Ngày đặt sân" : "Play date"}</span>
                  </div>
                  <input
                    type="date"
                    value={availableDate}
                    onChange={(e) => setAvailableDate(e.target.value)}
                    className="w-full text-xs font-bold text-[var(--text-primary)] cursor-pointer focus:outline-none"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      outline: "none",
                      boxShadow: "none",
                      height: "auto",
                      lineHeight: "1.2",
                      colorScheme: theme === "dark" ? "dark" : "light",
                    }}
                  />
                </div>

                {/* Segment 2: Giờ bắt đầu (Start time) */}
                <div className="flex-1 min-w-[130px] px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)] hover:border-amber-500/50 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all cursor-pointer">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider leading-none mb-1.5">
                    <IconClock size={14} stroke={2} className="text-amber-500 shrink-0" />
                    <span>{lang === "vi" ? "Giờ bắt đầu" : "Start time"}</span>
                  </div>
                  <input
                    type="time"
                    step={1800}
                    value={availableTime}
                    onChange={(e) => setAvailableTime(e.target.value)}
                    className="w-full text-xs font-bold text-[var(--text-primary)] cursor-pointer focus:outline-none"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      outline: "none",
                      boxShadow: "none",
                      height: "auto",
                      lineHeight: "1.2",
                      colorScheme: theme === "dark" ? "dark" : "light",
                    }}
                  />
                </div>

                {/* Segment 3: Thời lượng (Duration) */}
                <div className="flex-1 min-w-[120px] px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)] hover:border-purple-500/50 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20 transition-all cursor-pointer">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider leading-none mb-1.5">
                    <IconHourglass size={14} stroke={2} className="text-purple-500 shrink-0" />
                    <span>{lang === "vi" ? "Thời lượng" : "Duration"}</span>
                  </div>
                  <select
                    value={availableDuration}
                    onChange={(e) => setAvailableDuration(Number(e.target.value))}
                    className="w-full text-xs font-bold text-[var(--text-primary)] cursor-pointer focus:outline-none"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      outline: "none",
                      boxShadow: "none",
                      height: "auto",
                      lineHeight: "1.2",
                    }}
                  >
                    {[30, 60, 120].map((n) => (
                      <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" key={n} value={n}>
                        {n} {lang === "vi" ? "phút" : "minutes"}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Segment 4: Tiện ích (Amenities) */}
                <div className="flex-1 min-w-[140px] px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)] hover:border-emerald-500/50 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all cursor-pointer">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider leading-none mb-1.5">
                    <IconSparkles size={14} stroke={2} className="text-emerald-500 shrink-0" />
                    <span>{lang === "vi" ? "Tiện ích" : "Amenities"}</span>
                  </div>
                  <select
                    value={selectedAmenity}
                    onChange={(e) => setSelectedAmenity(e.target.value)}
                    className="w-full text-xs font-bold text-[var(--text-primary)] cursor-pointer focus:outline-none"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      outline: "none",
                      boxShadow: "none",
                      height: "auto",
                      lineHeight: "1.2",
                    }}
                  >
                    <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="ALL">{lang === "vi" ? "Mọi tiện ích" : "All amenities"}</option>
                    <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="Mái che">{lang === "vi" ? "Có mái che" : "Covered roof"}</option>
                    <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="Đèn">{lang === "vi" ? "Đèn chiếu sáng" : "Floodlights"}</option>
                    <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="Đỗ xe">{lang === "vi" ? "Bãi đỗ ô tô" : "Car parking"}</option>
                    <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="Điều hòa">{lang === "vi" ? "Điều hòa / Quạt mát" : "Air conditioning"}</option>
                  </select>
                </div>

                {/* Segment 5: Khoảng cách (Distance) */}
                <div className="flex-1 min-w-[140px] px-3.5 py-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] border border-[var(--surface-card-border)] hover:border-cyan-500/50 focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-500/20 transition-all cursor-pointer">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider leading-none mb-1.5">
                    <IconMapPin size={14} stroke={2} className="text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <span>{lang === "vi" ? "Khoảng cách" : "Distance"}</span>
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
                          showError(err.message || (lang === "vi" ? "Không lấy được vị trí của bạn" : "Could not get your location"));
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
                      lineHeight: "1.2",
                    }}
                  >
                    <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="ALL">{lang === "vi" ? "Mọi khoảng cách" : "Any distance"}</option>
                    <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="5">{lang === "vi" ? "Dưới 5 km" : "Under 5 km"}</option>
                    <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="10">{lang === "vi" ? "Dưới 10 km" : "Under 10 km"}</option>
                    <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="20">{lang === "vi" ? "Dưới 20 km" : "Under 20 km"}</option>
                    <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="30">{lang === "vi" ? "Dưới 30 km" : "Under 30 km"}</option>
                    <option className="bg-[var(--bg-primary)] text-[var(--text-primary)]" value="50">{lang === "vi" ? "Dưới 50 km" : "Under 50 km"}</option>
                  </select>
                </div>

                {/* Reset / Clear filters button */}
                {(Boolean(availableDate) || Boolean(availableTime) || selectedAmenity !== "ALL" || availableDuration !== 60 || maxDistance !== "ALL") && (
                  <button
                    type="button"
                    onClick={() => {
                      setAvailableDate("");
                      setAvailableTime("");
                      setSelectedAmenity("ALL");
                      setAvailableDuration(60);
                      setMaxDistance("ALL");
                    }}
                    className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-[var(--text-muted)] hover:text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all flex items-center justify-center gap-1.5 shrink-0 self-stretch md:self-auto cursor-pointer"
                    title={lang === "vi" ? "Đặt lại bộ lọc" : "Reset filters"}
                    style={{ minWidth: "92px" }}
                  >
                    <IconRefresh size={14} stroke={2} />
                    <span>{lang === "vi" ? "Đặt lại" : "Reset"}</span>
                  </button>
                )}
              </div>
              {!!availableDate !== !!availableTime && (
                <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl inline-flex items-center gap-2 mb-4 animate-fade-in">
                  <span>ℹ️</span>
                  <span>
                    {lang === "vi"
                      ? "Chọn cả ngày và giờ để kiểm tra sân trống."
                      : "Choose both a date and a time to check availability."}
                  </span>
                </div>
              )}
              <AsyncStatus
                loading={isLoadingVenues}
                error={venuesError || catalogueError}
                retry={() => setRetryKey((k) => k + 1)}
                lang={lang}
              />
              {venuesError && availableDate && availableTime && (
                <p>
                  {lang === "vi"
                    ? "Chưa kiểm tra được lịch trống. Bỏ lọc lịch để xem danh sách sân."
                    : "Availability could not be checked. Clear the availability filter to browse venues."}
                </p>
              )}
              {/* Venues Grid */}
              {isLoadingVenues && displayedVenues.length === 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
                    gap: 22,
                  }}
                >
                  {[...Array(8)].map((_, i) => (
                    <VenueCardSkeleton key={i} />
                  ))}
                </div>
              ) : displayedVenues.length > 0 ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
                    gap: 22,
                  }}
                >
                  {displayedVenues.map((venue) => (
                    <VenueCard
                      key={venue.id}
                      venue={venue}
                      onViewDetails={setDetailVenue}
                      onBookNow={handleBookNow}
                      isSaved={savedVenueIds.includes(venue.id)}
                      onToggleSave={toggleSaveVenue}
                      lang={lang}
                    />
                  ))}
                </div>
              ) : (
                !isLoadingVenues &&
                !venuesError && (
                  <div style={{ textAlign: "center", padding: "60px 20px" }}>
                    <div style={{ fontSize: "3rem", marginBottom: 12 }}>🔍</div>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: 700 }}>
                      {lang === "vi"
                        ? "Không tìm thấy sân phù hợp"
                        : "No matching venues found"}
                    </h3>
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "0.9rem",
                        marginTop: 4,
                      }}
                    >
                      {lang === "vi"
                        ? "Hãy thử đổi tỉnh thành, môn thể thao hoặc xóa từ khóa tìm kiếm."
                        : "Try changing location, sport category or clearing search keywords."}
                    </p>
                  </div>
                )
              )}

              {/* Load More Button */}
              {hasMoreVenues && (
                <div style={{ textAlign: "center", marginTop: 36 }}>
                  <button
                    disabled={isLoadingVenues}
                    onClick={() => loadVenues(venueCursor)}
                    className="btn btn-secondary"
                    style={{ padding: "12px 32px", fontSize: "0.95rem" }}
                  >
                    {lang === "vi" ? "Xem thêm" : "Load more"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: MATCHMAKING (CỘNG ĐỒNG GHÉP ĐỘI & GIAO LƯU - README 4.1) */}
        {currentTab === "matchmaking" && (
          <ErrorBoundary title="MatchmakingSection">
            <MatchmakingSection
              lang={lang}
              userProfile={userProfile}
              onRequireAuth={() => setShowAuth(true)}
              requestedMatchId={pendingJoinMatchId}
              onRequestedMatchHandled={() => setPendingJoinMatchId(null)}
            />
          </ErrorBoundary>
        )}

        {/* TAB 4: MERCHANT DASHBOARD (DÀNH CHO CHỦ SÂN - README 4.2) */}
        {currentTab === "merchant" && userProfile?.role === "merchant" && (
          <ErrorBoundary title="MerchantDashboard">
            <React.Suspense fallback={<AsyncStatus loading lang={lang} />}>
              <MerchantDashboard
                lang={lang}
                theme={theme}
                userProfile={userProfile}
              />
            </React.Suspense>
          </ErrorBoundary>
        )}

        {isAdminWorkspace && (
          <ErrorBoundary title="Admin">
            <React.Suspense fallback={<AsyncStatus loading lang={lang} />}>
              <AdminPanel lang={lang} />
            </React.Suspense>
          </ErrorBoundary>
        )}
      </main>

      {/* FOOTER */}
      {!isAdminWorkspace && <footer
        style={{
          background: "var(--bg-secondary)",
          borderTop: "1px solid var(--surface-card-border)",
          padding: "40px 0 24px",
          marginTop: 60,
          fontSize: "0.85rem",
          color: "var(--text-muted)",
        }}
      >
        <div className="container">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 24,
              marginBottom: 30,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: 900,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                Sport
                <span
                  style={{ color: theme === "dark" ? "#84D175" : "#89B9E6" }}
                >
                  Space
                </span>
              </div>
              <p style={{ lineHeight: 1.6 }}>
                {lang === "vi"
                  ? "Dự án cá nhân giúp người chơi tìm sân thể thao, đặt lịch và tìm đội giao lưu."
                  : "An independent project helping players find sports venues, book courts, and find teams to play with."}
              </p>
            </div>

            <div>
              <div
                style={{
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                {lang === "vi" ? "Về chúng tôi" : "About Us"}
              </div>
              <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: 0,
                  margin: 0,
                }}
              >
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setInfoModalPage("about");
                    }}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {lang === "vi" ? "Giới thiệu" : "Introduction"}
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setInfoModalPage("privacy");
                    }}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {lang === "vi" ? "Chính sách bảo mật" : "Privacy Policy"}
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setInfoModalPage("terms");
                    }}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {lang === "vi" ? "Điều khoản sử dụng" : "Terms of Service"}
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setInfoModalPage("regulations");
                    }}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {lang === "vi"
                      ? "Quy chế hoạt động"
                      : "Operating Regulations"}
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <div
                style={{
                  fontWeight: 800,
                  color: "var(--text-primary)",
                  marginBottom: 8,
                }}
              >
                {lang === "vi" ? "Hỗ trợ khách hàng" : "Customer Support"}
              </div>
              <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  padding: 0,
                  margin: 0,
                }}
              >
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setInfoModalPage("booking-guide");
                    }}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {lang === "vi" ? "Hướng dẫn đặt sân" : "Booking Guide"}
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setInfoModalPage("payment-guide");
                    }}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {lang === "vi" ? "Hướng dẫn thanh toán" : "Payment Guide"}
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setInfoModalPage("faq");
                    }}
                    style={{ color: "inherit", textDecoration: "none" }}
                  >
                    {lang === "vi" ? "Câu hỏi thường gặp (FAQ)" : "FAQ"}
                  </a>
                </li>
              </ul>
            </div>

          </div>

          <div
            style={{
              borderTop: "1px solid var(--surface-card-border)",
              paddingTop: 18,
              textAlign: "center",
              fontSize: "0.8rem",
            }}
          >
            {lang === "vi"
              ? `© ${new Date().getFullYear()} SportSpace. Dự án cá nhân.`
              : `© ${new Date().getFullYear()} SportSpace. An independent project.`}
          </div>
        </div>
      </footer>}

      {/* DETAIL MODAL */}
      {detailVenue && (
        <ErrorBoundary title="VenueDetailModal">
          <VenueDetailModal
            venue={detailVenue}
            theme={theme}
            onClose={() => setDetailVenue(null)}
            onBookNow={(v, cId) => {
              setDetailVenue(null);
              handleBookNow(v, cId);
            }}
            lang={lang}
          />
        </ErrorBoundary>
      )}

      {/* BOOKING MODAL */}
      {bookingVenue && (
        <ErrorBoundary title="BookingModal">
          <BookingModal
            venue={bookingVenue}
            preselectedCourtId={bookingCourtId}
            onClose={() => {
              setBookingVenue(null);
              setBookingCourtId(null);
            }}
            lang={lang}
            userProfile={userProfile}
            onRequireAuth={() => setShowAuth(true)}
          />
        </ErrorBoundary>
      )}

      {/* USER PROFILE MODAL */}
      {showProfile && userProfile?.uid && (
        <ErrorBoundary title="UserProfileModal">
          <UserProfileModal
            userProfile={userProfile}
            setUserProfile={setUserProfile}
            onClose={() => setShowProfile(false)}
            lang={lang}
            savedVenues={savedVenues}
            onRemoveSavedVenue={toggleSaveVenue}
            onSelectVenue={(v) => {
              setShowProfile(false);
              setDetailVenue(v);
            }}
            onBookNow={(v) => {
              setShowProfile(false);
              handleBookNow(v);
            }}
            onSwitchToMerchant={() => setCurrentTab("merchant")}
            onLogout={async () => {
              await supabase.auth.signOut();
              setShowProfile(false);
              setUserProfile(null);
              setCurrentTab("explore");
            }}
          />
        </ErrorBoundary>
      )}

      {/* NOTIFICATION MODAL */}
      <ErrorBoundary title="NotificationModal">
        <NotificationModal
          isOpen={showNotifications}
          onClose={() => setShowNotifications(false)}
          notifications={localizedNotifications}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
          lang={lang}
        />
      </ErrorBoundary>

      {/* AUTH MODAL (Login/Sign Up) */}
      {showAuth && (
        <ErrorBoundary title="AuthModal">
          <AuthModal
            onClose={() => setShowAuth(false)}
            onLoginSuccess={() => {}}
            lang={lang}
          />
        </ErrorBoundary>
      )}

      {passwordRecovery && (
        <ErrorBoundary title="PasswordRecoveryModal">
          <PasswordRecoveryModal
            lang={lang}
            onClose={() => setPasswordRecovery(false)}
          />
        </ErrorBoundary>
      )}

      {/* INFO MODAL FOR FOOTER LINKS */}
      <InfoModal
        isOpen={!!infoModalPage}
        onClose={() => setInfoModalPage(null)}
        pageType={infoModalPage}
        lang={lang}
        theme={theme}
      />
    </div>
  );
}
