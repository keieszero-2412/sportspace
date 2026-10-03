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
import {
  auth,
  googleProvider,
  signInWithPopup,
  signInWithRedirect,
} from "../firebase";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
} from "firebase/auth";
import { api, uploadImage } from "../services/api";
import { useToast } from "./ToastContext";

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
    if (isSubmitting) return;
    if (!isLogin)
      sessionStorage.setItem(
        "registrationDraft",
        JSON.stringify({ name: formData.name, phone: formData.phone }),
      );
    setIsSubmitting(true);

    try {
      let userCredential;
      if (isLogin) {
        // Đăng nhập thật bằng Firebase
        userCredential = await signInWithEmailAndPassword(
          auth,
          formData.email,
          formData.password,
        );
      } else {
        // Đăng ký thật bằng Firebase
        if (auth.currentUser?.email === formData.email)
          userCredential = { user: auth.currentUser };
        else
          userCredential = await createUserWithEmailAndPassword(
            auth,
            formData.email,
            formData.password,
          );
      }

      const user = userCredential.user;
      if (!isLogin) {
        await updateProfile(user, { displayName: formData.name });
        await api("saveProfile", {
          name: formData.name,
          phone: formData.phone,
        });
        if (!user.emailVerified)
          await sendEmailVerification(user).catch(() =>
            showInfo(
              lang === "vi"
                ? "Bạn có thể gửi lại email xác minh trong hồ sơ."
                : "Resend verification from your profile.",
            ),
          );
        if (isMerchant) {
          const documents = await Promise.all(
            Object.values(files).map((file) =>
              uploadImage(file, `merchant_documents/${user.uid}`),
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
        }
        sessionStorage.removeItem("registrationDraft");
      }
      onLoginSuccess();
      onClose();
    } catch (error) {
      console.error("Auth Error:", error);
      showError(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      onLoginSuccess();
      onClose();
    } catch (error) {
      console.error("Google Sign In Error:", error);
      if (error.code === "auth/popup-blocked") {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      showError(error.message);
      setIsGoogleLoading(false);
    }
  };

  const isDark = theme === "dark";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center animate-fade-in px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-md transition-colors"
        style={{
          backgroundColor: isDark
            ? "rgba(12, 45, 69, 0.8)"
            : "rgba(49, 70, 90, 0.6)",
        }}
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className="relative w-full max-w-md flex flex-col animate-slide-up shadow-2xl"
        style={{
          backgroundColor: isDark ? "#1C3144" : "#FFFDF7",
          borderRadius: "24px",
          border: `1px solid ${isDark ? "rgba(137, 185, 230, 0.2)" : "rgba(255, 255, 255, 0.8)"}`,
          maxHeight: "90vh",
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
                background: "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)",
                color: "#FFF",
                boxShadow: "0 4px 14px rgba(34, 197, 94, 0.3)",
              }}
            >
              SS
            </div>
            <div className="flex flex-col">
              <span
                className="font-black text-xl leading-none tracking-tight"
                style={{ color: isDark ? "#FFF8D2" : "#31465A" }}
              >
                SPORT<span style={{ color: "#22C55E" }}>SPACE</span>
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
            className="absolute top-4 right-4 p-2 rounded-full transition-colors hover:bg-black/10 z-10"
            style={{ color: isDark ? "#89B9E6" : "#5F7489" }}
          >
            <X size={20} />
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
                borderBottom: `3px solid ${isLogin ? "#22C55E" : "transparent"}`,
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
                borderBottom: `3px solid ${!isLogin ? "#22C55E" : "transparent"}`,
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

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="merchant-checkbox"
                  checked={isMerchant}
                  onChange={(e) => setIsMerchant(e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: "#22C55E" }}
                />
                <label
                  htmlFor="merchant-checkbox"
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    color: isDark ? "#B3C9DE" : "#5F7489",
                    cursor: "pointer",
                  }}
                >
                  {lang === "vi"
                    ? "Đăng nhập / Đăng ký với vai trò Chủ sân"
                    : "Login / Register as Venue Owner"}
                </label>
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
                      try {
                        await sendPasswordResetEmail(auth, formData.email);
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
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl font-bold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2 mt-2"
                style={{
                  background:
                    "linear-gradient(135deg, #22C55E 0%, #16A34A 100%)",
                }}
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
                  className="flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold transition-all hover:scale-105 shadow-sm disabled:opacity-70 disabled:hover:scale-100"
                  style={{
                    backgroundColor: isDark ? "rgba(12, 45, 69, 0.5)" : "#FFF",
                    border: `1px solid ${isDark ? "#3E5BA3" : "#BCE0F7"}`,
                    color: isDark ? "#FFF8D2" : "#31465A",
                  }}
                >
                  {isGoogleLoading ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <img
                      src="https://www.svgrepo.com/show/475656/google-color.svg"
                      alt="Google"
                      className="w-4 h-4"
                    />
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
