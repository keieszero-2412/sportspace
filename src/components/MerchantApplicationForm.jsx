import React, { useState } from "react";
import { api, uploadImage } from "../services/api";
import { useToast } from "./ToastContext";
export default function MerchantApplicationForm({ uid, lang = "vi", onClose }) {
  const tr = (vi, en) => (lang === "vi" ? vi : en),
    { showError, showInfo } = useToast();
  const [form, setForm] = useState({
    venueName: "",
    venueAddress: "",
    venueSport: "Pickleball",
    venueScale: 1,
    bankName: "",
    bankAccount: "",
    bankOwner: "",
  });
  const [file, setFile] = useState(null),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const image = file
        ? await uploadImage(file, "merchant_documents/" + uid)
        : null;
      await api("applyMerchant", {
        ...form,
        documentPaths: image ? [image.path] : [],
      });
      showInfo(
        tr(
          "Hồ sơ đang chờ quản trị viên duyệt.",
          "Application awaiting administrator approval.",
        ),
      );
      onClose();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-overlay" onClick={() => !busy && onClose()}>
      <form
        className="modal-content booking-flow"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{tr("Đăng ký chủ sân", "Merchant application")}</h3>
        {Object.entries({
          venueName: tr("Tên cơ sở", "Venue name"),
          venueAddress: tr("Địa chỉ", "Address"),
          venueSport: tr("Bộ môn", "Sport"),
          venueScale: tr("Số sân", "Court count"),
          bankName: tr("Ngân hàng", "Bank"),
          bankAccount: tr("Tài khoản", "Account"),
          bankOwner: tr("Tên người nhận", "Account holder"),
        }).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              required
              value={form[key]}
              type={key === "venueScale" ? "number" : "text"}
              min={1}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          {tr(
            "Giấy tờ cơ sở (ảnh tối đa 5 MB)",
            "Venue document (image up to 5 MB)",
          )}
          <input
            type="file"
            required
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files[0])}
          />
        </label>
        <p>
          {tr(
            "Quyền chủ sân và thông tin thanh toán chỉ được kích hoạt sau khi xác minh.",
            "Merchant permissions and payment details activate after verification.",
          )}
        </p>
        <div className="form-row">
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy}
            onClick={onClose}
          >
            {tr("Đóng", "Close")}
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {tr("Gửi hồ sơ", "Submit")}
          </button>
        </div>
      </form>
    </div>
  );
}
