import React, { useState, useRef, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  Search,
  MapPin,
  Calendar,
  Users,
  Trophy,
  ShieldCheck,
  Filter,
  Menu,
  X,
  ArrowRight,
  Sparkles,
  Sun,
  Moon,
  Globe,
  Layers,
  LayoutDashboard,
  Bell,
  User,
  CheckCircle2,
} from "lucide-react";

export default function HeroSection({
  // Search & Filters integration
  searchQuery = "",
  setSearchQuery = () => {},
  selectedProvince = "ALL",
  setSelectedProvince = () => {},
  selectedSport = "ALL",
  setSelectedSport = () => {},
  provincesList = [],
  totalVenues = null,
  totalCourts = null,
  latestMatches = [],
  authLoading = false,
  lang = "vi",
  setLang = () => {},
  theme = "light",
  setTheme = () => {},
  userProfile = null,
  unreadNotificationCount = 0,
  onOpenNotifications = () => {},
  // Navigation tabs integration
  currentTab = "explore",
  setCurrentTab = () => {},
  onOpenProfile = () => {},
  onOpenAuth = () => {},
  onSelectMatch = () => {},
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("home"); // 'home' | 'venues' | 'matches' | 'merchant' | 'account'

  const [isProvinceDropdownOpen, setIsProvinceDropdownOpen] = useState(false);
  const provinceDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        provinceDropdownRef.current &&
        !provinceDropdownRef.current.contains(event.target)
      ) {
        setIsProvinceDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isDark = theme === "dark";

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
  };

  const toggleLang = () => {
    setLang(lang === "vi" ? "en" : "vi");
  };

  // Navigation Items according to Requirement
  const navItems = [
    {
      id: "home",
      label: lang === "vi" ? "Trang chủ" : "Home",
      tabKey: "explore",
    },
    {
      id: "venues",
      label: lang === "vi" ? "Tìm sân" : "Find Venues",
      tabKey: "explore",
    },
    {
      id: "matches",
      label: lang === "vi" ? "Ghép trận" : "Matchmaking",
      tabKey: "matchmaking",
    },
  ];
  if (userProfile && userProfile.role === "merchant") {
    navItems.push({
      id: "merchant",
      label: lang === "vi" ? "Quản lý sân" : "Merchants",
      tabKey: "merchant",
    });
  }

  // Admin navigation is available only with a server-issued custom claim.
  if (userProfile?.isAdmin)
    navItems.push({
      id: "admin",
      label: lang === "vi" ? "Quản trị" : "Admin",
      tabKey: "admin",
    });
  const handleNavClick = (item) => {
    setActiveNav(item.id);
    if (item.isProfile) {
      if (userProfile) {
        onOpenProfile();
      } else {
        onOpenAuth();
      }
    } else if (item.tabKey) {
      setCurrentTab(item.tabKey);

      if (item.id === "venues") {
        setTimeout(() => {
          document
            .getElementById("venues-section")
            ?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else if (item.id === "matches") {
        setTimeout(() => {
          document
            .getElementById("matchmaking-section")
            ?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else if (item.id === "merchant") {
        setTimeout(() => {
          document
            .getElementById("merchant-section")
            ?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      } else if (item.id === "home") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
    setMobileMenuOpen(false);
  };

  return (
    <div
      className="relative w-full transition-colors duration-300 font-sans overflow-visible"
      style={{
        backgroundColor: isDark ? "#0C2D45" : "#FFFDF7",
        color: isDark ? "#FFF8D2" : "#31465A",
      }}
    >
      {/* =========================================================================
          1. NAVBAR
          ========================================================================= */}

      <header
        className="fixed top-0 left-0 right-0 z-[100] w-full backdrop-blur-md shadow-sm transition-colors duration-300"
        style={{
          backgroundColor: isDark
            ? "rgba(12, 45, 69, 0.95)"
            : "rgba(255, 253, 247, 0.95)",
          borderBottom: `1px solid ${isDark ? "rgba(62, 91, 163, 0.6)" : "#D9F0FF"}`,
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Left: Brand Logo */}
            <div
              onClick={() => {
                setActiveNav("home");
                setCurrentTab("explore");
              }}
              className="flex items-center gap-3 cursor-pointer select-none group"
            >
              <div
                className="w-11 h-11 rounded-2xl p-0.5 shadow-md group-hover:scale-105 transition-transform duration-200"
                style={{
                  background: isDark
                    ? "linear-gradient(135deg, #84D175, #E6FBDA)"
                    : "linear-gradient(135deg, #89B9E6, #C7DFA3)",
                }}
              >
                <div
                  className="w-full h-full rounded-[14px] flex items-center justify-center transition-colors overflow-hidden"
                  style={{ backgroundColor: isDark ? "#0C2D45" : "#FFFDF7" }}
                >
                  <img src="/logo.jpg" alt="SportSpace Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span
                    className="text-2xl font-black tracking-tight"
                    style={{ color: isDark ? "#FFF8D2" : "#31465A" }}
                  >
                    Sport
                    <span style={{ color: isDark ? "#84D175" : "#89B9E6" }}>
                      Space
                    </span>
                  </span>
                </div>
                <span
                  className="text-xs font-medium hidden sm:inline-block"
                  style={{ color: isDark ? "#B3C9DE" : "#5F7489" }}
                >
                  {lang === "vi"
                    ? "Nền tảng Đặt sân & Giao lưu Thể thao"
                    : "Nationwide Sports Booking & Matching"}
                </span>
              </div>
            </div>

            {/* Middle: Desktop Navigation Menu */}
            <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
              {navItems.map((item) => {
                const isActive = activeNav === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item)}
                    className="relative px-3.5 py-2 text-[14px] xl:text-[15px] font-bold transition-all duration-200 rounded-lg"
                    style={{
                      color: isActive
                        ? isDark
                          ? "#FFF8D2"
                          : "#31465A"
                        : isDark
                          ? "#B3C9DE"
                          : "#5F7489",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = isDark
                          ? "rgba(62, 91, 163, 0.3)"
                          : "rgba(217, 240, 255, 0.4)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <span>{item.label}</span>
                    {/* Active Underline in Primary color (#89B9E6 light / #84D175 dark) */}
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-3 right-3 h-[3px] rounded-full shadow-sm"
                        style={{
                          backgroundColor: isDark ? "#84D175" : "#89B9E6",
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Right: Actions (Theme Toggle, Lang Toggle, User Profile) */}
            <div className="hidden sm:flex items-center gap-3">
              {/* Utility Group: Lang, Bell, Theme */}
              <div
                className="flex items-center p-1 rounded-full shadow-sm transition-colors"
                style={{
                  backgroundColor: isDark
                    ? "rgba(255, 255, 255, 0.08)"
                    : "rgba(255, 253, 247, 0.6)",
                  backdropFilter: "blur(8px)",
                  border: isDark
                    ? "1px solid rgba(255, 255, 255, 0.1)"
                    : "1px solid rgba(137, 185, 230, 0.3)",
                }}
              >
                {/* Language Switcher */}
                <button
                  onClick={toggleLang}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold transition-all hover:bg-black/5 dark:hover:bg-white/10"
                  style={{
                    fontSize: "0.82rem",
                    color: isDark ? "#FFF8D2" : "#31465A",
                  }}
                  title={
                    lang === "vi"
                      ? "Chuyển sang Tiếng Anh"
                      : "Switch to Vietnamese"
                  }
                >
                  <Globe size={15} />
                  <span>{lang.toUpperCase()}</span>
                </button>

                <div
                  className="w-[1px] h-4 mx-1"
                  style={{
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.15)"
                      : "rgba(0,0,0,0.1)",
                  }}
                />

                {/* Notification Bell */}
                <button
                  onClick={onOpenNotifications}
                  className="flex items-center justify-center p-1.5 rounded-full relative transition-all hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ color: isDark ? "#FFF8D2" : "#31465A" }}
                  title="Thông báo hệ thống"
                >
                  <Bell size={16} />
                  {unreadNotificationCount > 0 && (
                    <span
                      style={{
                        position: "absolute",
                        top: 0,
                        right: 0,
                        background: "#EF4444",
                        color: "#fff",
                        fontSize: "0.55rem",
                        fontWeight: 900,
                        width: 14,
                        height: 14,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: `2px solid ${isDark ? "#0C2D45" : "#FFFDF7"}`,
                      }}
                    >
                      {unreadNotificationCount}
                    </span>
                  )}
                </button>

                <div
                  className="w-[1px] h-4 mx-1"
                  style={{
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.15)"
                      : "rgba(0,0,0,0.1)",
                  }}
                />

                {/* Theme Switcher */}
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center p-1.5 rounded-full transition-all hover:bg-black/5 dark:hover:bg-white/10 pr-2.5"
                  style={{ color: isDark ? "#FFF8D2" : "#31465A" }}
                  title={
                    isDark
                      ? "Chuyển sang Chế độ Sáng (Light Mode)"
                      : "Chuyển sang Chế độ Tối (Dark Mode)"
                  }
                >
                  {isDark ? (
                    <Sun size={16} color="#FFF8D2" />
                  ) : (
                    <Moon size={16} />
                  )}
                </button>
              </div>

              {/* User Profile / Login */}
              {userProfile ? (
                <button
                  onClick={onOpenProfile}
                  className="flex items-center gap-2.5 rounded-full p-1 pl-1.5 pr-4 border shadow-sm transition-all hover:scale-105"
                  style={{
                    backgroundColor: isDark
                      ? "rgba(62, 91, 163, 0.4)"
                      : "rgba(217, 240, 255, 0.6)",
                    borderColor: isDark
                      ? "rgba(132, 209, 117, 0.35)"
                      : "rgba(137, 185, 230, 0.4)",
                    color: isDark ? "#FFF8D2" : "#31465A",
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shadow-sm"
                    style={{
                      backgroundColor: isDark ? "#84D175" : "#89B9E6",
                      color: isDark ? "#07260F" : "#0E2841",
                    }}
                  >
                    {String(userProfile.name || "").charAt(0)}
                  </div>
                  <div className="text-left leading-tight hidden md:block">
                    <div className="text-xs font-bold truncate max-w-[100px]">
                      {userProfile.name}
                    </div>
                    <div
                      className="flex items-center gap-1 text-[10px] font-bold"
                      style={{ color: isDark ? "#84D175" : "#16A34A" }}
                    >
                      <ShieldCheck size={11} />
                      <span>{userProfile.credibilityScore}đ uy tín</span>
                    </div>
                  </div>
                </button>
              ) : (
                <button
                  disabled={authLoading}
                  onClick={onOpenAuth}
                  className="btn flex items-center justify-center gap-2 px-5 py-2 rounded-full font-bold transition-all hover:scale-105 shadow-md"
                  style={{
                    backgroundColor: isDark ? "#84D175" : "#89B9E6",
                    color: isDark ? "#07260F" : "#0E2841",
                    fontSize: "0.85rem",
                  }}
                >
                  <User size={16} />
                  <span>{lang === "vi" ? "Đăng nhập" : "Sign In"}</span>
                </button>
              )}
            </div>

            {/* Mobile Hamburger Button */}
            <div className="flex lg:hidden items-center gap-2">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg border"
                style={{
                  backgroundColor: isDark ? "#3E5BA3" : "#D9F0FF",
                  borderColor: isDark ? "rgba(132, 209, 117, 0.3)" : "#BCE0F7",
                  color: isDark ? "#FFF8D2" : "#31465A",
                }}
                aria-label="Toggle theme"
              >
                {isDark ? (
                  <Sun size={18} color="#FFF8D2" />
                ) : (
                  <Moon size={18} />
                )}
              </button>

              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 rounded-lg border transition-colors"
                style={{
                  backgroundColor: isDark ? "#3E5BA3" : "#D9F0FF",
                  borderColor: isDark ? "rgba(132, 209, 117, 0.3)" : "#BCE0F7",
                  color: isDark ? "#FFF8D2" : "#31465A",
                }}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div
            className="lg:hidden border-t px-4 pt-3 pb-5 space-y-2 shadow-xl"
            style={{
              backgroundColor: isDark ? "#0C2D45" : "#FFFDF7",
              borderColor: isDark ? "#3E5BA3" : "#D9F0FF",
            }}
          >
            {navItems.map((item) => {
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-base font-bold transition-all"
                  style={{
                    backgroundColor: isActive
                      ? isDark
                        ? "#3E5BA3"
                        : "#D9F0FF"
                      : "transparent",
                    color: isDark ? "#FFF8D2" : "#31465A",
                    borderLeft: isActive
                      ? `4px solid ${isDark ? "#84D175" : "#89B9E6"}`
                      : "none",
                  }}
                >
                  <span>{item.label}</span>
                  {isActive && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{
                        backgroundColor: isDark ? "#84D175" : "#89B9E6",
                      }}
                    />
                  )}
                </button>
              );
            })}

            <div
              className="pt-2 border-t flex items-center justify-between gap-2"
              style={{ borderColor: isDark ? "#3E5BA3" : "#D9F0FF" }}
            >
              <button
                onClick={toggleLang}
                className="btn btn-outline flex-1 py-2 text-xs font-bold toggle-btn-lang"
                style={{ color: isDark ? "#FFF8D2" : "#31465A" }}
              >
                <Globe size={14} />
                <span>{lang === "vi" ? "Tiếng Việt" : "English"}</span>
              </button>
              {userProfile ? (
                <button
                  onClick={onOpenProfile}
                  className="btn btn-primary flex-1 py-2 text-xs font-bold"
                >
                  <ShieldCheck size={14} />
                  <span>{userProfile.credibilityScore}đ uy tín</span>
                </button>
              ) : (
                <button
                  disabled={authLoading}
                  onClick={onOpenAuth}
                  className="btn btn-primary flex-1 py-2 text-xs font-bold"
                >
                  <User size={14} />
                  <span>{lang === "vi" ? "Đăng nhập" : "Sign In"}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* =========================================================================
          2. HERO SECTION
          ========================================================================= */}
      <section className="relative min-h-[640px] lg:min-h-[700px] pt-[80px] w-full flex items-center">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Background Image: Sân vận động thể thao */}
          <div
            className="absolute inset-0 bg-cover bg-center z-0 transition-transform duration-1000 scale-105"
            style={{
              backgroundImage: `url('https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=2000&q=85')`,
            }}
          />

          {/* Overlay thích ứng theo Theme */}
          <div
            className="absolute inset-0 z-10 transition-colors duration-500"
            style={{
              background: isDark
                ? "linear-gradient(to right, rgba(8, 24, 38, 0.94) 0%, rgba(12, 45, 69, 0.88) 50%, rgba(12, 45, 69, 0.65) 100%)"
                : "linear-gradient(to right, rgba(12, 45, 69, 0.92) 0%, rgba(12, 45, 69, 0.78) 55%, rgba(12, 45, 69, 0.5) 100%)",
            }}
          />
        </div>

        {/* Content Container */}
        <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-18 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* KHỐI NỘI DUNG BÊN TRÁI (Chiếm 12 cột trên Desktop) */}
            <div className="lg:col-span-12 space-y-6">
              {/* Live Status Pill */}
              <div
                className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full backdrop-blur-md border text-xs font-semibold shadow-sm text-white"
                style={{
                  backgroundColor: isDark
                    ? "rgba(62, 91, 163, 0.4)"
                    : "rgba(255, 255, 255, 0.15)",
                  borderColor: isDark
                    ? "rgba(132, 209, 117, 0.4)"
                    : "rgba(255, 255, 255, 0.3)",
                }}
              >
                <span
                  className="w-2 h-2 rounded-full animate-ping"
                  style={{ backgroundColor: isDark ? "#84D175" : "#C7DFA3" }}
                />
                <span
                  className="w-2 h-2 rounded-full -ml-4"
                  style={{ backgroundColor: isDark ? "#84D175" : "#C7DFA3" }}
                />
                <span>
                  {lang === "vi"
                    ? `Hệ thống trực tuyến: ${(totalVenues ?? "…").toLocaleString()} cụm sân • ${(totalCourts ?? "…").toLocaleString()} sân con`
                    : `Live Network: ${(totalVenues ?? "…").toLocaleString()} venues • ${(totalCourts ?? "…").toLocaleString()} courts`}
                </span>
              </div>

              {/* Tiêu đề chính: Font sans-serif lớn, in hoa, in đậm, tôn vinh bảng màu README.md */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black uppercase tracking-tight text-white drop-shadow-lg leading-tight">
                {lang === "vi" ? "ĐẶT SÂN NHANH" : "FAST BOOKING"} <br />
                <span
                  className="text-transparent bg-clip-text"
                  style={{
                    backgroundImage: isDark
                      ? "linear-gradient(to right, #FFF8D2, #84D175, #E6FBDA)"
                      : "linear-gradient(to right, #D9F0FF, #89B9E6, #C7DFA3)",
                  }}
                >
                  {lang === "vi" ? "KẾT NỐI ĐAM MÊ" : "CONNECT PASSION"}
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-200 max-w-xl font-normal leading-relaxed drop-shadow">
                {lang === "vi"
                  ? "Nền tảng đặt sân thể thao thông minh với đặt sân trực tuyến và mạng lưới giao lưu thể thao văn minh, theo dõi lịch hẹn."
                  : "Smart sports platform with online court booking and verified matchmaking with attendance tracking."}
              </p>

              {/* Tiêu đề phụ: "KÈO GHÉP TRẬN MỚI NHẤT" + Icon mũi tên */}
              <div className="pt-2">
                <div
                  onClick={() => setCurrentTab("matchmaking")}
                  className="inline-flex items-center gap-3 text-white font-extrabold text-sm sm:text-base tracking-widest uppercase cursor-pointer select-none group"
                >
                  <span>
                    {lang === "vi"
                      ? "KÈO GHÉP TRẬN MỚI NHẤT"
                      : "LATEST MATCH FIXTURES"}
                  </span>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center border shadow-inner transition-all duration-200"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.2)",
                      borderColor: "rgba(255, 255, 255, 0.4)",
                    }}
                  >
                    <ChevronRight className="w-4 h-4 text-white group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>

                {/* Danh sách 2 Card Glassmorphism (#D9F0FF ở Light Mode / #3E5BA3 ở Dark Mode theo README.md) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                  {latestMatches
                    .filter(
                      (m) =>
                        m.startAt > Date.now() &&
                        m.playersJoined < m.playersMax,
                    )
                    .slice(0, 2)
                    .map((raw) => {
                      const m = {
                        ...raw,
                        venue: raw.venueName,
                        district: raw.province,
                        sportIcon: "🏅",
                        playersCurrent: raw.playersJoined,
                        playersNeeded: raw.playersMax - raw.playersJoined,
                        cost:
                          typeof raw.costPerPerson === "number"
                            ? raw.costPerPerson.toLocaleString() + " VND"
                            : String(raw.costPerPerson || ""),
                        time: new Date(raw.startAt).toLocaleString(
                          lang === "vi" ? "vi-VN" : "en-GB",
                        ),
                      };
                      return (
                        <div
                          key={m.id}
                          onClick={() => {
                            setCurrentTab("matchmaking");
                            onSelectMatch(m);
                          }}
                          className="group cursor-pointer backdrop-blur-md border shadow-xl rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl text-center flex flex-col justify-between"
                          style={{
                            backgroundColor: isDark
                              ? "rgba(62, 91, 163, 0.92)"
                              : "rgba(217, 240, 255, 0.92)",
                            borderColor: isDark
                              ? "rgba(132, 209, 117, 0.35)"
                              : "rgba(255, 255, 255, 0.7)",
                            color: isDark ? "#FFF8D2" : "#31465A",
                          }}
                        >
                          {/* Top: Sport Tag & Time */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-center gap-1.5">
                              <span
                                className="text-[11px] font-black tracking-wider uppercase px-2.5 py-0.5 rounded-full border shadow-xs"
                                style={{
                                  backgroundColor: isDark
                                    ? "rgba(12, 45, 69, 0.7)"
                                    : "rgba(255, 253, 247, 0.85)",
                                  color: isDark ? "#E6FBDA" : "#0E2841",
                                  borderColor: isDark
                                    ? "rgba(132, 209, 117, 0.4)"
                                    : "rgba(137, 185, 230, 0.4)",
                                }}
                              >
                                {m.sportIcon} {m.sport}
                              </span>
                            </div>

                            <div
                              className="text-xs font-semibold"
                              style={{ color: isDark ? "#B3C9DE" : "#5F7489" }}
                            >
                              {m.time}
                            </div>

                            {/* Match Title */}
                            <h4
                              className="text-base font-extrabold transition-colors leading-snug line-clamp-2"
                              style={{
                                color: isDark ? "#FFF8D2" : "#31465A",
                                minHeight: "44px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                              }}
                            >
                              {m.title || m.venue}
                            </h4>

                            {/* Venue Name & District */}
                            <div
                              className="text-[11px] flex flex-col items-center justify-center gap-0.5 font-medium mt-1"
                              style={{ color: isDark ? "#B3C9DE" : "#5F7489" }}
                            >
                              <div className="flex items-center gap-1">
                                <MapPin
                                  size={11}
                                  style={{
                                    color: isDark ? "#84D175" : "#89B9E6",
                                  }}
                                />
                                <span className="font-bold text-[12px]">
                                  {m.venue}
                                </span>
                              </div>
                              <span>{m.district}</span>
                            </div>
                          </div>

                          {/* Divider */}
                          <div
                            className="my-3 border-t"
                            style={{
                              borderColor: isDark
                                ? "rgba(255, 248, 210, 0.2)"
                                : "rgba(137, 185, 230, 0.35)",
                            }}
                          />

                          {/* Host Info */}
                          {m.hostName && (
                            <div className="flex items-center justify-center gap-2 mb-3">
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px]"
                                style={{
                                  backgroundColor: isDark
                                    ? "#84D175"
                                    : "#89B9E6",
                                  color: isDark ? "#07260F" : "#0E2841",
                                }}
                              >
                                {String(m.hostName || "").charAt(0)}
                              </div>
                              <div className="text-left leading-tight flex flex-col items-start">
                                <span
                                  className="text-[11px] font-bold"
                                  style={{
                                    color: isDark ? "#FFF8D2" : "#31465A",
                                  }}
                                >
                                  {m.hostName}
                                </span>
                                <span
                                  className="text-[10px] flex items-center gap-1"
                                  style={{
                                    color: isDark ? "#84D175" : "#16A34A",
                                    fontWeight: 600,
                                  }}
                                >
                                  <ShieldCheck size={10} /> {m.hostCredibility}đ
                                  uy tín
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Bottom Details: Yêu cầu trình độ và số lượng người cần tìm */}
                          <div className="space-y-2">
                            <div
                              className="rounded-lg py-1.5 px-2.5 border"
                              style={{
                                backgroundColor: isDark
                                  ? "rgba(12, 45, 69, 0.7)"
                                  : "rgba(255, 253, 247, 0.85)",
                                borderColor: isDark
                                  ? "rgba(62, 91, 163, 0.8)"
                                  : "rgba(137, 185, 230, 0.3)",
                              }}
                            >
                              <div
                                className="text-[11px] font-medium"
                                style={{
                                  color: isDark ? "#B3C9DE" : "#5F7489",
                                }}
                              >
                                {lang === "vi"
                                  ? "Yêu cầu trình độ:"
                                  : "Skill Level:"}
                              </div>
                              <div
                                className="text-xs font-bold"
                                style={{
                                  color: isDark ? "#FFF8D2" : "#31465A",
                                }}
                              >
                                {m.levelRequired}
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs pt-1 px-1">
                              <span
                                className="font-semibold"
                                style={{
                                  color: isDark ? "#B3C9DE" : "#5F7489",
                                }}
                              >
                                {lang === "vi" ? "Cần tìm:" : "Needs:"}{" "}
                                <strong
                                  style={{
                                    color: isDark ? "#84D175" : "#16A34A",
                                  }}
                                >
                                  {m.playersNeeded}{" "}
                                  {lang === "vi" ? "người" : "players"}
                                </strong>
                              </span>
                              <span
                                className="font-extrabold px-2 py-0.5 rounded border text-[11px]"
                                style={{
                                  backgroundColor: isDark
                                    ? "rgba(230, 251, 218, 0.2)"
                                    : "rgba(199, 223, 163, 0.35)",
                                  color: isDark ? "#E6FBDA" : "#2D4C13",
                                  borderColor: isDark
                                    ? "rgba(230, 251, 218, 0.4)"
                                    : "rgba(199, 223, 163, 0.6)",
                                }}
                              >
                                {m.cost}
                              </span>
                            </div>

                            {/* Primary Action Button (#89B9E6 light / #84D175 dark) */}
                            <button
                              className="w-full mt-2 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                              style={{
                                backgroundColor: isDark ? "#84D175" : "#89B9E6",
                                color: isDark ? "#07260F" : "#0E2841",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = isDark
                                  ? "#71C361"
                                  : "#71A7D8";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = isDark
                                  ? "#84D175"
                                  : "#89B9E6";
                              }}
                            >
                              <span>
                                {lang === "vi"
                                  ? "Xin tham gia ngay"
                                  : "Join Match Now"}
                              </span>
                              <ArrowRight size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Integrated Search Box for Nationwide Venues */}
              <div className="pt-2">
                <div
                  className="backdrop-blur-md p-3.5 sm:p-4 rounded-2xl border shadow-2xl max-w-2xl transition-colors"
                  style={{
                    backgroundColor: isDark
                      ? "rgba(12, 45, 69, 0.95)"
                      : "rgba(255, 253, 247, 0.96)",
                    borderColor: isDark ? "#3E5BA3" : "#D9F0FF",
                  }}
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
                    {/* Province Filter */}
                    <div className="sm:col-span-4">
                      <div
                        className="flex items-center gap-1.5 text-xs font-bold mb-1"
                        style={{ color: isDark ? "#B3C9DE" : "#5F7489" }}
                      >
                        <MapPin
                          size={13}
                          style={{ color: isDark ? "#84D175" : "#89B9E6" }}
                        />
                        <span>{lang === "vi" ? "Khu vực:" : "Province:"}</span>
                      </div>
                      <div className="relative" ref={provinceDropdownRef}>
                        <div
                          onClick={() =>
                            setIsProvinceDropdownOpen(!isProvinceDropdownOpen)
                          }
                          className="w-full px-3 py-2 text-sm font-semibold rounded-lg border flex items-center justify-between cursor-pointer transition-colors"
                          style={{
                            backgroundColor: isDark
                              ? "rgba(62, 91, 163, 0.4)"
                              : "rgba(217, 240, 255, 0.4)",
                            borderColor: isDark
                              ? "rgba(132, 209, 117, 0.4)"
                              : "rgba(137, 185, 230, 0.4)",
                            color: isDark ? "#FFF8D2" : "#31465A",
                          }}
                        >
                          <span className="truncate pr-2">
                            {selectedProvince === "ALL"
                              ? `📍 ${lang === "vi" ? "Tất cả khu vực" : "All Locations"} (${provincesList.length})`
                              : selectedProvince}
                          </span>
                          <ChevronDown
                            size={14}
                            style={{
                              color: isDark ? "#84D175" : "#89B9E6",
                              transition: "transform 0.2s",
                              transform: isProvinceDropdownOpen
                                ? "rotate(180deg)"
                                : "none",
                            }}
                          />
                        </div>

                        {/* Dropdown Menu */}
                        {isProvinceDropdownOpen && (
                          <div
                            className="absolute z-[60] w-full mt-2 rounded-xl shadow-2xl overflow-hidden border animate-fade-in"
                            style={{
                              backgroundColor: isDark
                                ? "rgba(12, 45, 69, 0.95)"
                                : "rgba(255, 253, 247, 0.98)",
                              backdropFilter: "blur(16px)",
                              WebkitBackdropFilter: "blur(16px)",
                              borderColor: isDark
                                ? "rgba(62, 91, 163, 0.6)"
                                : "rgba(137, 185, 230, 0.5)",
                              top: "100%",
                            }}
                          >
                            <div
                              className="max-h-60 overflow-y-auto"
                              style={{
                                scrollbarWidth: "thin",
                                scrollbarColor: isDark
                                  ? "#3E5BA3 transparent"
                                  : "#BCE0F7 transparent",
                              }}
                            >
                              <div
                                onClick={() => {
                                  setSelectedProvince("ALL");
                                  setIsProvinceDropdownOpen(false);
                                }}
                                className="px-4 py-2.5 text-sm font-bold cursor-pointer transition-colors flex items-center justify-between"
                                style={{
                                  color:
                                    selectedProvince === "ALL"
                                      ? isDark
                                        ? "#84D175"
                                        : "#16A34A"
                                      : isDark
                                        ? "#FFF8D2"
                                        : "#31465A",
                                  backgroundColor:
                                    selectedProvince === "ALL"
                                      ? isDark
                                        ? "rgba(132, 209, 117, 0.15)"
                                        : "rgba(22, 163, 74, 0.1)"
                                      : "transparent",
                                }}
                                onMouseEnter={(e) => {
                                  if (selectedProvince !== "ALL")
                                    e.currentTarget.style.backgroundColor =
                                      isDark
                                        ? "rgba(62, 91, 163, 0.4)"
                                        : "rgba(217, 240, 255, 0.4)";
                                }}
                                onMouseLeave={(e) => {
                                  if (selectedProvince !== "ALL")
                                    e.currentTarget.style.backgroundColor =
                                      "transparent";
                                }}
                              >
                                <span>
                                  📍{" "}
                                  {lang === "vi"
                                    ? "Tất cả khu vực"
                                    : "All Locations"}
                                </span>
                                {selectedProvince === "ALL" && (
                                  <ShieldCheck size={14} />
                                )}
                              </div>

                              {provincesList.map((p) => (
                                <div
                                  key={p}
                                  onClick={() => {
                                    setSelectedProvince(p);
                                    setIsProvinceDropdownOpen(false);
                                  }}
                                  className="px-4 py-2 text-sm font-medium cursor-pointer transition-colors flex items-center justify-between border-t"
                                  style={{
                                    borderColor: isDark
                                      ? "rgba(62, 91, 163, 0.2)"
                                      : "rgba(217, 240, 255, 0.5)",
                                    color:
                                      selectedProvince === p
                                        ? isDark
                                          ? "#84D175"
                                          : "#16A34A"
                                        : isDark
                                          ? "#B3C9DE"
                                          : "#5F7489",
                                    backgroundColor:
                                      selectedProvince === p
                                        ? isDark
                                          ? "rgba(132, 209, 117, 0.1)"
                                          : "rgba(22, 163, 74, 0.05)"
                                        : "transparent",
                                  }}
                                  onMouseEnter={(e) => {
                                    if (selectedProvince !== p) {
                                      e.currentTarget.style.backgroundColor =
                                        isDark
                                          ? "rgba(62, 91, 163, 0.3)"
                                          : "rgba(217, 240, 255, 0.6)";
                                      e.currentTarget.style.color = isDark
                                        ? "#FFF8D2"
                                        : "#31465A";
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (selectedProvince !== p) {
                                      e.currentTarget.style.backgroundColor =
                                        "transparent";
                                      e.currentTarget.style.color = isDark
                                        ? "#B3C9DE"
                                        : "#5F7489";
                                    }
                                  }}
                                >
                                  <span>{p}</span>
                                  {selectedProvince === p && (
                                    <CheckCircle2 size={13} />
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Venue search input */}
                    <div className="sm:col-span-5">
                      <div
                        className="flex items-center gap-1.5 text-xs font-bold mb-1"
                        style={{ color: isDark ? "#B3C9DE" : "#5F7489" }}
                      >
                        <Search
                          size={13}
                          style={{ color: isDark ? "#84D175" : "#89B9E6" }}
                        />
                        <span>
                          {lang === "vi" ? "Tên sân:" : "Venue Name:"}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={
                          lang === "vi"
                            ? "Nhập tên cụm sân..."
                            : "Search venue name..."
                        }
                        className="w-full px-3 py-2 text-sm font-medium rounded-lg border focus:outline-none transition-colors"
                        style={{
                          backgroundColor: isDark ? "#081E2F" : "#FFFFFF",
                          borderColor: isDark
                            ? "rgba(132, 209, 117, 0.4)"
                            : "rgba(137, 185, 230, 0.4)",
                          color: isDark ? "#FFF8D2" : "#31465A",
                        }}
                      />
                    </div>

                    {/* Action Button */}
                    <div className="sm:col-span-3 sm:self-end">
                      <button
                        onClick={() => {
                          setCurrentTab("explore");
                          setTimeout(() => {
                            document
                              .getElementById("venues-section")
                              ?.scrollIntoView({ behavior: "smooth" });
                          }, 100);
                        }}
                        className="w-full py-2 px-3 text-sm font-extrabold rounded-lg transition-all shadow flex items-center justify-center gap-1.5"
                        style={{
                          backgroundColor: isDark ? "#84D175" : "#89B9E6",
                          color: isDark ? "#07260F" : "#0E2841",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = isDark
                            ? "#71C361"
                            : "#71A7D8";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = isDark
                            ? "#84D175"
                            : "#89B9E6";
                        }}
                      >
                        <Search size={15} />
                        <span>{lang === "vi" ? "Tìm sân" : "Search"}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
