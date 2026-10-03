import React, { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import HeroSection from "./components/HeroSection";
import VenueCard from "./components/VenueCard";
import VenueCardSkeleton from "./components/VenueCardSkeleton";
import VenueDetailModal from "./components/VenueDetailModal";
import BookingModal from "./components/BookingModal";
import MatchmakingSection from "./components/MatchmakingSection";

const MerchantDashboard = React.lazy(
  () => import("./components/MerchantDashboard"),
);
import UserProfileModal from "./components/UserProfileModal";
import NotificationModal from "./components/NotificationModal";
import AuthModal from "./components/AuthModal";
import ErrorBoundary from "./components/ErrorBoundary";
import InfoModal from "./components/InfoModal";

import { db, auth } from "./firebase";
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
import { onAuthStateChanged, signOut, getRedirectResult } from "firebase/auth";

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
  useEffect(() => {
    let generation = 0,
      stopProfile = () => {};
    getRedirectResult(auth).catch((e) => showError(e.message));
    const stopAuth = onAuthStateChanged(auth, async (user) => {
      const current = ++generation;
      stopProfile();
      setUserProfile(null);
      setShowProfile(false);
      setShowNotifications(false);
      setAuthLoading(true);
      setNotifications([]);
      setSavedVenueIds([]);
      setSavedVenues([]);
      if (!user) {
        setAuthLoading(false);
        setCurrentTab("explore");
        return;
      }
      try {
        let draft = {};
        try {
          draft = JSON.parse(
            sessionStorage.getItem("registrationDraft") || "{}",
          );
        } catch {
          /* invalid draft */
        }
        const profile = await api("saveProfile", {
          name: user.displayName || user.email?.split("@")[0] || "",
          ...draft,
          initializeOnly: true,
        });
        const token = await user.getIdTokenResult();
        if (current !== generation) return;
        sessionStorage.removeItem("registrationDraft");
        setUserProfile({ ...profile, isAdmin: token.claims.admin === true });
        if (["vi", "en"].includes(profile.preferredLanguage))
          setLang(profile.preferredLanguage);
        stopProfile = watchProfile(
          user.uid,
          (p) => {
            if (current !== generation) return;
            setUserProfile(
              p ? { ...p, isAdmin: token.claims.admin === true } : null,
            );
            setSavedVenueIds(p?.savedVenueIds || []);
          },
          showError,
        );
      } catch (e) {
        if (current === generation) showError(e.message);
      } finally {
        if (current === generation) setAuthLoading(false);
      }
    });
    return () => {
      generation++;
      stopAuth();
      stopProfile();
    };
  }, [showError]);

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
  }, [loadVenues]);
  useEffect(() => {
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
  }, [retryKey]);
  useEffect(
    () =>
      watch(
        "Matches",
        [
          ["status", "==", "open"],
          ["startAt", ">", Date.now()],
        ],
        setLatestMatches,
        () => {},
        { order: "startAt", direction: "asc", limit: 10 },
      ),
    [],
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
    if (!userProfile?.uid) return;
    return watch(
      "Notifications",
      [["userId", "==", userProfile.uid]],
      setNotifications,
      (e) => showError(e.message),
      { order: "createdAt", limit: 100 },
    );
  }, [userProfile?.uid, showError]);
  useEffect(() => {
    let active = true;
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
  }, [userProfile?.uid, JSON.stringify(savedVenueIds), showError]);

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
      return currentLang === "vi" ? "🏅 Tất cả bộ môn" : "🏅 All Sports";
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
        <div>
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
            unreadNotificationCount={unreadNotificationCount}
            onOpenNotifications={() => setShowNotifications(true)}
          />
        </div>

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
                      className={`btn ${isAct ? "btn-primary" : "btn-outline"}`}
                      style={{
                        padding: "8px 16px",
                        fontSize: "0.85rem",
                        borderRadius: "9999px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {getSportLabel(sport, lang)}
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
                      ` • ${getSportLabel(selectedSport, lang)}`}
                  </h2>
                  <div
                    style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}
                  >
                    {lang === "vi"
                      ? `Đã tải ${filteredVenues.length} cụm sân phù hợp • ${savedVenues.length} sân trong danh sách yêu thích`
                      : `Loaded ${filteredVenues.length} matching venues • ${savedVenues.length} venues in favorites`}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  {/* Amenity quick filter */}
                  <select
                    value={selectedAmenity}
                    onChange={(e) => setSelectedAmenity(e.target.value)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--surface-card-border)",
                      background: "var(--surface-card)",
                      color: "var(--text-primary)",
                      fontSize: "0.82rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <option value="ALL">
                      ⚙️ {lang === "vi" ? "Mọi tiện ích" : "All Amenities"}
                    </option>
                    <option value="Mái che">
                      {lang === "vi" ? "Có mái che" : "Covered Roof"}
                    </option>
                    <option value="Đèn">
                      {lang === "vi" ? "Đèn chiếu sáng" : "Night Floodlights"}
                    </option>
                    <option value="Đỗ xe">
                      {lang === "vi" ? "Bãi đỗ ô tô" : "Car Parking"}
                    </option>
                    <option value="Điều hòa">
                      {lang === "vi"
                        ? "Điều hòa / Quạt mát"
                        : "Air Conditioning"}
                    </option>
                  </select>
                </div>
              </div>

              <div className="booking-flow form-row">
                <label>
                  {lang === "vi"
                    ? "Tìm lịch trống theo ngày"
                    : "Filter availability by date"}
                  <input
                    type="date"
                    value={availableDate}
                    onChange={(e) => setAvailableDate(e.target.value)}
                  />
                </label>
                <label>
                  {lang === "vi" ? "Giờ bắt đầu" : "Start time"}
                  <input
                    type="time"
                    step={1800}
                    value={availableTime}
                    onChange={(e) => setAvailableTime(e.target.value)}
                  />
                </label>
                <label>
                  {lang === "vi" ? "Thời lượng" : "Duration"}
                  <select
                    value={availableDuration}
                    onChange={(e) =>
                      setAvailableDuration(Number(e.target.value))
                    }
                  >
                    {[30, 60, 120].map((n) => (
                      <option key={n} value={n}>
                        {n} {lang === "vi" ? "phút" : "minutes"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {lang === "vi" ? "Khoảng cách" : "Distance"}
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
                  >
                    <option value="ALL">{lang === "vi" ? "Mọi khoảng cách" : "Any distance"}</option>
                    <option value="5">{lang === "vi" ? "Dưới 5 km" : "Under 5 km"}</option>
                    <option value="10">{lang === "vi" ? "Dưới 10 km" : "Under 10 km"}</option>
                    <option value="20">{lang === "vi" ? "Dưới 20 km" : "Under 20 km"}</option>
                  </select>
                </label>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setAvailableDate("");
                    setAvailableTime("");
                    setMaxDistance("ALL");
                  }}
                >
                  {lang === "vi" ? "Bỏ lọc" : "Clear filters"}
                </button>
              </div>
              {!!availableDate !== !!availableTime && (
                <p>
                  {lang === "vi"
                    ? "Chọn cả ngày và giờ để kiểm tra sân trống."
                    : "Choose both a date and a time to check availability."}
                </p>
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

        {currentTab === "admin" && userProfile?.isAdmin && (
          <ErrorBoundary title="Admin">
            <React.Suspense fallback={<AsyncStatus loading lang={lang} />}>
              <AdminPanel lang={lang} />
            </React.Suspense>
          </ErrorBoundary>
        )}
      </main>

      {/* FOOTER */}
      <footer
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
      </footer>

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
              await signOut(auth);
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
