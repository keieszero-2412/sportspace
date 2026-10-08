import React, { useState, useEffect } from "react";
import {
  X,
  Mail,
  Lock,
  User,
  Phone,
  CheckCircle2,
  Image as ImageIcon,
  MapPin,
  CreditCard,
  Building,
  Trophy,
} from "lucide-react";
import { supabase } from "../supabase";
import { api, uploadImage } from "../services/api";
import { authRedirectUrl } from "../services/auth";
import { useToast } from "./ToastContext";

function authMessage(error, lang) {
  const code = error?.code || "";
  if (code === "invalid_credentials") {
    return lang === "vi"
      ? "Email hoặc mật khẩu không đúng. Nếu tài khoản được tạo bằng Google, hãy chọn nút Google thay vì nhập mật khẩu."
      : "The email or password is incorrect. If this account was created with Google, use the Google button instead of a password.";
  }
  if (code === "email_not_confirmed") {
    return lang === "vi"
      ? "Email chưa được xác thực. Hãy kiểm tra hộp thư rồi đăng nhập lại."
      : "Your email is not verified. Check your inbox and try again.";
  }
  if (code === "user_already_exists") {
    return lang === "vi"
      ? "Email này đã có tài khoản. Hãy chuyển sang Đăng nhập."
      : "This email already has an account. Switch to Sign In.";
  }
  return error?.message || (lang === "vi" ? "Đăng nhập thất bại." : "Sign in failed.");
}

export default function AuthModal({ onClose, onLoginSuccess, lang = "vi" }) {
  const { showError, showInfo, showSuccess } = useToast();
  const [files, setFiles] = useState({});
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    password: "",
    idCardPhoto: "",
    venueName: "",
    venueAddress: "",
    venueSport: "Pickleball",
    venueScale: "",
    venueLicense: "",
    bankName: "",
    bankAccount: "",
    bankOwner: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [theme, setTheme] = useState("light");

  const [isMerchant, setIsMerchant] = useState(false);

  useEffect(() => {
    // Read theme from DOM to match current theme
    const currentTheme =
      document.documentElement.getAttribute("data-theme") || "light";
    setTheme(currentTheme);
    const observer = new MutationObserver(() =>
      setTheme(document.documentElement.getAttribute("data-theme") || "light"),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting || isGoogleLoading) return;
    setIsSubmitting(true);

    try {
      let user, error, session;
      if (isLogin) {
        // Đăng nhập bằng Supabase
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email.trim(),
          password: formData.password,
        });
        user = data?.user;
        session = data?.session;
        error = signInError;
      } else {
        // Đăng ký bằng Supabase
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: formData.email.trim(),
          password: formData.password,
          options: {
            emailRedirectTo: authRedirectUrl(),
            data: {
              name: formData.name,
              phone: formData.phone
            }
          }
        });
        user = data?.user;
        session = data?.session;
        error = signUpError;
      }

      if (error) throw error;

      if (!isLogin && user) {
        if (!session) {
          showInfo(lang === "vi" ? "Vui lòng kiểm tra email để xác thực tài khoản." : "Check your email to confirm your account.");
          if (isMerchant) {
            showError("Vui lòng xác thực email rồi đăng nhập lại để tiếp tục đăng ký sân.");
          }
          onClose();
          return;
        }

        if (isMerchant) {
          try {
          const documents = await Promise.all(
            Object.values(files).map((file) =>
              uploadImage(file, `merchant_documents/${user.id}`),
            ),
          );
          await api("applyMerchant", {
            ...formData,
            password: undefined,
            documentPaths: documents.map((d) => d.path),
          });
          showInfo(
            lang === "vi"
              ? "Hồ sơ chủ sân đang chờ duyệt."
              : "Merchant application is awaiting approval.",
          );
          } catch (error) {
            showError(lang === "vi"
              ? `Tài khoản đã được tạo và đăng nhập, nhưng chưa gửi được hồ sơ chủ sân. Hãy thử lại trong Hồ sơ. ${error.message}`
              : `Your account is created and signed in, but the merchant application failed. Retry from Profile. ${error.message}`);
          }
        }
      }
      if (!user || !session) throw new Error(lang === "vi" ? "Chưa nhận được phiên đăng nhập. Vui lòng thử lại." : "No sign-in session was returned. Please try again.");
      onLoginSuccess();
      onClose();
    } catch (error) {
      console.error("Auth Error:", error);
      showError(authMessage(error, lang));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (isSubmitting || isGoogleLoading) return;
    setIsGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: authRedirectUrl(),
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error("Google Sign In Error:", error);
      showError(
        error.message ||
          (lang === "vi"
            ? "Không thể kết nối Google. Vui lòng thử lại."
            : "Could not connect to Google. Please try again."),
      );
      setIsGoogleLoading(false);
    }
  };

  const isDark = theme === "dark";

  return (
    <div className="modal-overlay" onClick={onClose}>
      {/* Modal Content */}
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "450px",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header Graphic */}
        <div
          className="h-28 w-full flex-shrink-0 relative flex items-center justify-center overflow-hidden"
          style={{
            background: isDark
              ? "linear-gradient(135deg, rgba(62, 91, 163, 0.4) 0%, rgba(12, 45, 69, 0) 100%)"
              : "linear-gradient(135deg, rgba(137, 185, 230, 0.4) 0%, rgba(217, 240, 255, 0) 100%)",
            borderBottom: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
          }}
        >
          {/* Logo element */}
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl shadow-lg"
              style={{
                backgroundColor: isDark ? "#FFF8D2" : "#FFFDF7",
                overflow: "hidden",
                boxShadow: "0 4px 14px rgba(49, 70, 90, 0.2)",
              }}
            >
              <img
                src="/logo.png"
                alt="SportSpace Logo"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex flex-col">
              <span
                className="font-black text-xl leading-none tracking-tight"
                style={{ color: "var(--brand-sport)" }}
              >
                Sport<span style={{ color: "var(--brand-space)" }}>Space</span>
              </span>
              <span
                className="text-[10px] uppercase font-bold tracking-widest"
                style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
              >
                {lang === "vi" ? "Hệ Sinh Thái Thể Thao" : "Sports Ecosystem"}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="absolute top-4 right-4 btn btn-outline"
            style={{ padding: "6px", borderRadius: "50%", zIndex: 10, border: "none", background: "transparent" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Container for Tabs & Form */}
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          {/* Tab Toggles */}
          <div className="flex px-6 pt-6 gap-4">
            <button
              onClick={() => setIsLogin(true)}
              className="flex-1 pb-3 font-bold text-center transition-all relative toggle-btn-lang"
              style={{
                color: isLogin
                  ? isDark
                    ? "#FFF8D2"
                    : "#31465A"
                  : isDark
                    ? "#5F7489"
                    : "#8FA4B8",
                borderBottom: `3px solid ${isLogin ? "var(--btn-primary)" : "transparent"}`,
                whiteSpace: "nowrap"
              }}
            >
              {lang === "vi" ? "Đăng nhập" : "Sign In"}
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className="flex-1 pb-3 font-bold text-center transition-all relative toggle-btn-lang"
              style={{
                color: !isLogin
                  ? isDark
                    ? "#FFF8D2"
                    : "#31465A"
                  : isDark
                    ? "#5F7489"
                    : "#8FA4B8",
                borderBottom: `3px solid ${!isLogin ? "var(--btn-primary)" : "transparent"}`,
                whiteSpace: "nowrap"
              }}
            >
              {lang === "vi" ? "Đăng ký" : "Sign Up"}
            </button>
          </div>

          {/* Form Body */}
          <div className="p-6">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Conditional Sign up fields */}
              {!isLogin && (
                <div className="animate-fade-in flex flex-col gap-4">
                  <div>
                    <div className="relative">
                      <User
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        size={18}
                        style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
                      />
                      <input
                        type="text"
                        name="name"
                        required
                        placeholder={lang === "vi" ? "Họ và Tên" : "Full Name"}
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-3 rounded-xl outline-none font-medium transition-all"
                        style={{
                          backgroundColor: isDark
                            ? "rgba(12, 45, 69, 0.4)"
                            : "#F3F7FA",
                          color: isDark ? "#FFF8D2" : "#31465A",
                          border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="relative">
                      <Phone
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        size={18}
                        style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
                      />
                      <input
                        type="tel"
                        name="phone"
                        required
                        placeholder={
                          lang === "vi" ? "Số điện thoại" : "Phone Number"
                        }
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-3 rounded-xl outline-none font-medium transition-all"
                        style={{
                          backgroundColor: isDark
                            ? "rgba(12, 45, 69, 0.4)"
                            : "#F3F7FA",
                          color: isDark ? "#FFF8D2" : "#31465A",
                          border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Common fields */}
              <div>
                <div className="relative">
                  <Mail
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    size={18}
                    style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
                  />
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    required
                    placeholder={lang === "vi" ? "Email" : "Email address"}
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl outline-none font-medium transition-all"
                    style={{
                      backgroundColor: isDark
                        ? "rgba(12, 45, 69, 0.4)"
                        : "#F3F7FA",
                      color: isDark ? "#FFF8D2" : "#31465A",
                      border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="relative">
                  <Lock
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    size={18}
                    style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
                  />
                  <input
                    type="password"
                    name="password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    minLength={isLogin ? undefined : 6}
                    required
                    placeholder={lang === "vi" ? "Mật khẩu" : "Password"}
                    value={formData.password}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-3 rounded-xl outline-none font-medium transition-all"
                    style={{
                      backgroundColor: isDark
                        ? "rgba(12, 45, 69, 0.4)"
                        : "#F3F7FA",
                      color: isDark ? "#FFF8D2" : "#31465A",
                      border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                    }}
                  />
                </div>
              </div>

              {/* Extended Merchant Fields for Sign Up */}
              {!isLogin && isMerchant && (
                <div
                  className="animate-fade-in flex flex-col gap-5 mt-4 p-4 rounded-xl border"
                  style={{
                    backgroundColor: isDark ? "rgba(0,0,0,0.2)" : "#F9FAFB",
                    borderColor: isDark ? "#3E5BA3" : "#E2E8F0",
                  }}
                >
                  <h4
                    className="font-bold text-sm"
                    style={{ color: isDark ? "#84D175" : "#16A34A" }}
                  >
                    {lang === "vi"
                      ? "1. Xác thực Danh tính Chủ sân"
                      : "1. Identity Verification"}
                  </h4>
                  <div>
                    <label
                      className="block text-xs font-semibold mb-1"
                      style={{ color: isDark ? "#B3C9DE" : "#5F7489" }}
                    >
                      {lang === "vi"
                        ? "Ảnh chụp CCCD/CMND (Bắt buộc)"
                        : "ID Card Photo (Required)"}
                    </label>
                    <input
                      type="file"
                      onChange={(e) =>
                        setFiles((prev) => ({
                          ...prev,
                          document1: e.target.files[0],
                        }))
                      }
                      accept="image/*"
                      required
                      className="w-full text-xs"
                      style={{ color: isDark ? "#FFF8D2" : "#31465A" }}
                    />
                  </div>

                  <div
                    className="border-t my-1"
                    style={{ borderColor: isDark ? "#3E5BA3" : "#E2E8F0" }}
                  ></div>

                  <h4
                    className="font-bold text-sm"
                    style={{ color: isDark ? "#84D175" : "#16A34A" }}
                  >
                    {lang === "vi"
                      ? "2. Thông tin Cơ sở kinh doanh"
                      : "2. Venue Details"}
                  </h4>
                  <div className="relative">
                    <Building
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      size={16}
                      style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
                    />
                    <input
                      type="text"
                      name="venueName"
                      required
                      placeholder={
                        lang === "vi" ? "Tên cơ sở thể thao" : "Venue Name"
                      }
                      value={formData.venueName}
                      onChange={handleChange}
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg outline-none font-medium text-sm transition-all"
                      style={{
                        backgroundColor: isDark
                          ? "rgba(12, 45, 69, 0.4)"
                          : "#FFF",
                        color: isDark ? "#FFF8D2" : "#31465A",
                        border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                      }}
                    />
                  </div>
                  <div className="relative">
                    <MapPin
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      size={16}
                      style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
                    />
                    <input
                      type="text"
                      name="venueAddress"
                      required
                      placeholder={
                        lang === "vi" ? "Địa chỉ chi tiết" : "Detailed Address"
                      }
                      value={formData.venueAddress}
                      onChange={handleChange}
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg outline-none font-medium text-sm transition-all"
                      style={{
                        backgroundColor: isDark
                          ? "rgba(12, 45, 69, 0.4)"
                          : "#FFF",
                        color: isDark ? "#FFF8D2" : "#31465A",
                        border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                      }}
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <Trophy
                        className="absolute left-3 top-1/2 -translate-y-1/2"
                        size={16}
                        style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
                      />
                      <select
                        name="venueSport"
                        required
                        value={formData.venueSport}
                        onChange={handleChange}
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg outline-none font-medium text-sm transition-all appearance-none"
                        style={{
                          backgroundColor: isDark
                            ? "rgba(12, 45, 69, 0.4)"
                            : "#FFF",
                          color: isDark ? "#FFF8D2" : "#31465A",
                          border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                        }}
                      >
                        <option value="Pickleball">Pickleball</option>
                        <option value="Cầu lông">
                          {lang === "vi" ? "Cầu lông" : "Badminton"}
                        </option>
                        <option value="Bóng đá">
                          {lang === "vi" ? "Bóng đá" : "Football"}
                        </option>
                        <option value="Tennis">Tennis</option>
                      </select>
                    </div>
                    <div className="relative flex-1">
                      <input
                        type="number"
                        name="venueScale"
                        required
                        placeholder={
                          lang === "vi" ? "Số mặt sân" : "No. of courts"
                        }
                        value={formData.venueScale}
                        onChange={handleChange}
                        min="1"
                        className="w-full px-4 py-2.5 rounded-lg outline-none font-medium text-sm transition-all"
                        style={{
                          backgroundColor: isDark
                            ? "rgba(12, 45, 69, 0.4)"
                            : "#FFF",
                          color: isDark ? "#FFF8D2" : "#31465A",
                          border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      className="block text-xs font-semibold mb-1"
                      style={{ color: isDark ? "#B3C9DE" : "#5F7489" }}
                    >
                      {lang === "vi"
                        ? "Hình ảnh sân / Giấy phép (Bắt buộc)"
                        : "Venue Photo / License"}
                    </label>
                    <input
                      type="file"
                      onChange={(e) =>
                        setFiles((prev) => ({
                          ...prev,
                          document2: e.target.files[0],
                        }))
                      }
                      accept="image/*"
                      required
                      className="w-full text-xs"
                      style={{ color: isDark ? "#FFF8D2" : "#31465A" }}
                    />
                  </div>

                  <div
                    className="border-t my-1"
                    style={{ borderColor: isDark ? "#3E5BA3" : "#E2E8F0" }}
                  ></div>

                  <h4
                    className="font-bold text-sm"
                    style={{ color: isDark ? "#84D175" : "#16A34A" }}
                  >
                    {lang === "vi"
                      ? "3. Thông tin Thanh toán (Payout)"
                      : "3. Payment Information"}
                  </h4>
                  <div className="relative">
                    <CreditCard
                      className="absolute left-3 top-1/2 -translate-y-1/2"
                      size={16}
                      style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
                    />
                    <input
                      type="text"
                      name="bankName"
                      required
                      placeholder={
                        lang === "vi"
                          ? "Tên Ngân hàng (VD: Vietcombank)"
                          : "Bank Name"
                      }
                      value={formData.bankName}
                      onChange={handleChange}
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg outline-none font-medium text-sm transition-all"
                      style={{
                        backgroundColor: isDark
                          ? "rgba(12, 45, 69, 0.4)"
                          : "#FFF",
                        color: isDark ? "#FFF8D2" : "#31465A",
                        border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                      }}
                    />
                  </div>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      name="bankAccount"
                      required
                      placeholder={
                        lang === "vi" ? "Số tài khoản" : "Account Number"
                      }
                      value={formData.bankAccount}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-lg outline-none font-medium text-sm transition-all flex-1"
                      style={{
                        backgroundColor: isDark
                          ? "rgba(12, 45, 69, 0.4)"
                          : "#FFF",
                        color: isDark ? "#FFF8D2" : "#31465A",
                        border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                      }}
                    />
                    <input
                      type="text"
                      name="bankOwner"
                      required
                      placeholder={
                        lang === "vi" ? "Tên Chủ thẻ" : "Account Owner"
                      }
                      value={formData.bankOwner}
                      onChange={handleChange}
                      className="w-full px-4 py-2.5 rounded-lg outline-none font-medium text-sm transition-all flex-1"
                      style={{
                        backgroundColor: isDark
                          ? "rgba(12, 45, 69, 0.4)"
                          : "#FFF",
                        color: isDark ? "#FFF8D2" : "#31465A",
                        border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                      }}
                    />
                  </div>
                </div>
              )}

              {isLogin && (
                <div className="flex justify-end">
                  <button
                    onClick={async () => {
                      if (!formData.email.trim()) {
                        showInfo(lang === "vi" ? "Nhập email trước để nhận liên kết đặt lại mật khẩu." : "Enter your email to receive a reset link.");
                        return;
                      }
                      try {
                        const { error } = await supabase.auth.resetPasswordForEmail(formData.email.trim(), { redirectTo: authRedirectUrl() });
                        if (error) throw error;
                        showInfo(
                          lang === "vi"
                            ? "Đã gửi email đặt lại mật khẩu."
                            : "Password reset email sent.",
                        );
                      } catch (e) {
                        showError(e.message);
                      }
                    }}
                    type="button"
                    className="text-xs font-bold transition-opacity hover:opacity-70"
                    style={{ color: "#22C55E" }}
                  >
                    {lang === "vi" ? "Quên mật khẩu?" : "Forgot password?"}
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting || isGoogleLoading}
                className="btn btn-primary w-full mt-2 flex items-center justify-center gap-2 py-3"
                style={{ fontSize: "1rem" }}
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    {isLogin
                      ? lang === "vi"
                        ? "Đăng Nhập"
                        : "Sign In"
                      : lang === "vi"
                        ? "Tạo Tài Khoản"
                        : "Create Account"}
                    <CheckCircle2 size={18} />
                  </>
                )}
              </button>
            </form>

            {/* Social Logins */}
            <div className="mt-6">
              <div className="relative flex items-center justify-center mb-6">
                <div
                  className="absolute w-full border-t"
                  style={{ borderColor: isDark ? "#3E5BA3" : "#D9F0FF" }}
                />
                <div
                  className="relative px-4 text-xs font-bold"
                  style={{
                    backgroundColor: isDark ? "#1C3144" : "#FFFDF7",
                    color: isDark ? "#89B9E6" : "#5F7489",
                  }}
                >
                  {lang === "vi" ? "HOẶC TIẾP TỤC VỚI" : "OR CONTINUE WITH"}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  disabled={isGoogleLoading || isSubmitting}
                  className="btn btn-secondary w-full flex items-center justify-center gap-2 py-3"
                  style={{ fontSize: "0.95rem" }}
                >
                  {isGoogleLoading ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 48 48" className="w-4 h-4">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      <path fill="none" d="M0 0h48v48H0z"></path>
                    </svg>
                  )}
                  {isGoogleLoading
                    ? lang === "vi"
                      ? "Đang kết nối..."
                      : "Connecting..."
                    : "Google"}
                </button>
              </div>
            </div>

            {!isLogin && (
              <p
                className="mt-6 text-center text-[10px] max-w-[90%] mx-auto leading-relaxed"
                style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
              >
                {lang === "vi"
                  ? "Bằng việc đăng ký, bạn đồng ý với Điều khoản Dịch vụ và Chính sách Bảo mật của SportSpace."
                  : "By signing up, you agree to SportSpace Terms of Service and Privacy Policy."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
