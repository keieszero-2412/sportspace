import React from 'react';
import { 
  Sun, Moon, Globe, ShieldCheck, User, 
  Layers, Users, Calendar, LayoutDashboard, MapPin, Bell
} from 'lucide-react';

export default function Header({ 
  currentTab, 
  setCurrentTab, 
  theme, 
  setTheme, 
  lang, 
  setLang,
  userProfile,
  onOpenProfile,
  onOpenAuth,
  unreadNotificationCount = 0,
  onOpenNotifications = () => {}
}) {
  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const toggleLang = () => {
    setLang(lang === 'vi' ? 'en' : 'vi');
  };

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: theme === 'dark' ? 'rgba(12, 45, 69, 0.92)' : 'rgba(255, 253, 247, 0.92)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--surface-card-border)',
      transition: 'background-color 0.3s ease, border-color 0.3s ease',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
        
        {/* Brand Logo */}
        <div 
          onClick={() => setCurrentTab('explore')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        >
          <div style={{
            width: 44,
            height: 44,
            borderRadius: '12px',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)'
          }}>
            <img src="/logo.png" alt="SportSpace Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
                Sport<span style={{ color: theme === 'dark' ? '#84D175' : '#89B9E6' }}>Space</span>
              </span>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {lang === 'vi' ? 'Đặt sân & Giao lưu thể thao tất cả khu vực' : 'All Locations Sports Booking & Matching'}
            </div>
          </div>
        </div>

        {/* Navigation Tabs (Aligned with HeroSection styling) */}
        <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
          {[
            { id: 'explore', label: lang === 'vi' ? 'Khám phá sân' : 'Find Venues' },
            { id: 'matchmaking', label: lang === 'vi' ? 'Ghép đội & Giao lưu' : 'Matchmaking' },
            { id: 'merchant', label: lang === 'vi' ? 'Quản lý sân' : 'Merchants' }
          ].map((item) => {
            const isActive = currentTab === item.id;
            const isDark = theme === 'dark';
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className="relative px-3.5 py-2 text-[14px] xl:text-[15px] font-bold transition-all duration-200 rounded-lg"
                style={{
                  color: isActive 
                    ? (isDark ? '#FFF8D2' : '#31465A') 
                    : (isDark ? '#B3C9DE' : '#5F7489')
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = isDark ? 'rgba(62, 91, 163, 0.3)' : 'rgba(217, 240, 255, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <span>{item.label}</span>
                {isActive && (
                  <span 
                    className="absolute bottom-0 left-3 right-3 h-[3px] rounded-full shadow-sm"
                    style={{ backgroundColor: isDark ? '#84D175' : '#89B9E6' }}
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right: Actions (Theme Toggle, Lang Toggle, User Profile) */}
        <div className="hidden sm:flex items-center gap-2.5">
          
          {/* Language Switcher */}
          <button
            onClick={toggleLang}
            className="btn btn-outline toggle-btn-lang"
            style={{
              padding: '7px 11px',
              fontSize: '0.82rem',
              borderRadius: '10px',
              border: `1px solid ${theme === 'dark' ? 'rgba(62, 91, 163, 0.8)' : '#BCE0F7'}`,
              color: theme === 'dark' ? '#FFF8D2' : '#31465A',
              backgroundColor: theme === 'dark' ? 'rgba(62, 91, 163, 0.25)' : 'transparent'
            }}
            title={lang === 'vi' ? 'Chuyển sang Tiếng Anh' : 'Switch to Vietnamese'}
          >
            <Globe size={15} />
            <span style={{ fontWeight: 700 }}>{lang.toUpperCase()}</span>
          </button>

          {/* Notification Bell */}
          <button
            onClick={onOpenNotifications}
            className="btn btn-outline"
            style={{
              padding: '7px 11px',
              borderRadius: '10px',
              border: `1px solid ${theme === 'dark' ? 'rgba(62, 91, 163, 0.8)' : '#BCE0F7'}`,
              color: theme === 'dark' ? '#FFF8D2' : '#31465A',
              backgroundColor: theme === 'dark' ? 'rgba(62, 91, 163, 0.25)' : 'transparent',
              position: 'relative'
            }}
            title={lang === 'vi' ? 'Thông báo hệ thống' : 'System Notifications'}
          >
            <Bell size={16} />
            {unreadNotificationCount > 0 && (
              <span style={{
                position: 'absolute',
                top: -4,
                right: -4,
                background: '#EF4444',
                color: '#fff',
                fontSize: '0.62rem',
                fontWeight: 900,
                width: 17,
                height: 17,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {unreadNotificationCount}
              </span>
            )}
          </button>

          {/* Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="btn btn-outline toggle-btn-theme"
            style={{
              padding: '7px 11px',
              borderRadius: '10px',
              border: `1px solid ${theme === 'dark' ? 'rgba(62, 91, 163, 0.8)' : '#BCE0F7'}`,
              color: theme === 'dark' ? '#FFF8D2' : '#31465A',
              backgroundColor: theme === 'dark' ? 'rgba(62, 91, 163, 0.25)' : 'transparent'
            }}
            title={theme === 'dark' ? (lang === 'vi' ? 'Chuyển sang Chế độ Sáng' : 'Switch to Light Mode') : (lang === 'vi' ? 'Chuyển sang Chế độ Tối' : 'Switch to Dark Mode')}
          >
            {theme === 'dark' ? <Sun size={16} color="#FFF8D2" /> : <Moon size={16} />}
          </button>

          {/* User Profile / Login */}
          {userProfile ? (
            <button
              onClick={onOpenProfile}
              className="btn btn-secondary flex items-center gap-2.5"
              style={{
                padding: '6px 14px',
                borderRadius: '9999px',
                backgroundColor: theme === 'dark' ? '#3E5BA3' : '#D9F0FF',
                border: `1px solid ${theme === 'dark' ? 'rgba(132, 209, 117, 0.35)' : '#BCE0F7'}`,
                color: theme === 'dark' ? '#FFF8D2' : '#31465A'
              }}
            >
              <div 
                className="w-7 h-7 rounded-full flex items-center justify-center font-black text-xs shadow-sm"
                style={{
                  backgroundColor: theme === 'dark' ? '#84D175' : '#89B9E6',
                  color: theme === 'dark' ? '#07260F' : '#0E2841'
                }}
              >
                {userProfile.name.charAt(0)}
              </div>
              <div className="text-left leading-tight hidden md:block">
                <div className="text-xs font-bold truncate max-w-[100px]">
                  {userProfile.name}
                </div>
                <div 
                  className="flex items-center gap-1 text-[10px] font-bold"
                  style={{ color: theme === 'dark' ? '#84D175' : '#16A34A' }}
                >
                  <ShieldCheck size={11} />
                  <span>{userProfile.credibilityScore}đ uy tín</span>
                </div>
              </div>
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="btn flex items-center gap-2 transition-all hover:scale-105"
              style={{
                padding: '8px 20px',
                borderRadius: '9999px',
                backgroundColor: theme === 'dark' ? '#84D175' : '#89B9E6',
                color: theme === 'dark' ? '#07260F' : '#0E2841',
                fontWeight: 800,
                fontSize: '0.9rem',
                boxShadow: 'var(--shadow-sm)',
                whiteSpace: 'nowrap'
              }}
            >
              <User size={16} />
              <span>{lang === 'vi' ? 'Đăng nhập' : 'Sign In'}</span>
            </button>
          )}
        </div>

      </div>
    </header>
  );
}
