import React, { useEffect, useState } from "react";
import { api, watch, openPrivateImage } from "../services/api";
import { useToast } from "./ToastContext";
import AsyncStatus from "./AsyncStatus";
export default function AdminPanel({ lang = "vi" }) {
  const tr = (vi, en) => (lang === "vi" ? vi : en),
    { showError, showSuccess } = useToast();
  const [applications, setApplications] = useState([]),
    [facilities, setFacilities] = useState([]),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState({}),
    [bank, setBank] = useState({
      facilityId: "",
      bin: "",
      account: "",
      name: "",
    });
  useEffect(() => {
    const stop = [
      watch(
        "MerchantApplications",
        [["status", "==", "pending"]],
        setApplications,
        setError,
      ),
      watch("Facilities", [], setFacilities, setError, { limit: 200 }),
    ];
    return () => stop.forEach((s) => s());
  }, []);
  async function perform(action, data) {
    if (busy) return;
    setBusy(true);
    try {
      await api(action, data);
      showSuccess(tr("Đã xác minh và lưu.", "Verified and saved."));
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="container booking-flow" style={{ padding: 24 }}>
      <h2>
        {tr(
          "Duyệt chủ sân và tài khoản nhận tiền",
          "Merchant & bank verification",
        )}
      </h2>
      <AsyncStatus error={error} lang={lang} />
      {applications.map((a) => (
        <article className="glass-panel feature-card" key={a.id}>
          <h3>{a.venueName}</h3>
          <p>
            {a.venueAddress} · {a.venueSport}
          </p>
          <p>
            {a.bankName} · {a.bankAccount} · {a.bankOwner}
          </p>
          <p>
            {tr(
              "Chỉ duyệt sau khi kiểm tra giấy tờ và quyền sở hữu cơ sở.",
              "Approve only after checking documents and venue ownership.",
            )}
          </p>
          <select
            value={selected[a.id] || ""}
            onChange={(e) =>
              setSelected({ ...selected, [a.id]: e.target.value })
            }
          >
            <option value="">
              {tr("Chọn cơ sở cần gán", "Select facility to assign")}
            </option>
            {facilities
              .filter((f) => !f.ownerId || f.ownerId === a.userId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
          <button
            disabled={busy || !selected[a.id]}
            className="btn btn-primary"
            onClick={() =>
              perform("approveMerchant", {
                userId: a.userId,
                facilityId: selected[a.id],
              })
            }
          >
            {tr("Duyệt chủ sân", "Approve merchant")}
          </button>
        </article>
      ))}
      {applications
        .filter((a) => a.documentPaths?.length)
        .map((a) => (
          <div className="form-row" key={a.id}>
            <span>{a.venueName}</span>
            {a.documentPaths.map((path, i) => (
              <button
                className="btn btn-outline"
                key={path}
                onClick={() =>
                  openPrivateImage(path).catch((e) => showError(e.message))
                }
              >
                {tr("Tải giấy tờ", "Download document")} {i + 1}
              </button>
            ))}
          </div>
        ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          perform("verifyBank", bank);
        }}
      >
        <h3>
          {tr(
            "Xác minh thông tin nhận chuyển khoản",
            "Verify transfer destination",
          )}
        </h3>
        <select
          required
          value={bank.facilityId}
          onChange={(e) => setBank({ ...bank, facilityId: e.target.value })}
        >
          <option value="">{tr("Chọn cơ sở", "Select facility")}</option>
          {facilities
            .filter((f) => f.ownerId)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
        </select>
        {Object.entries({
          bin: tr("Mã BIN ngân hàng", "Bank BIN"),
          account: tr("Số tài khoản", "Account number"),
          name: tr("Tên người nhận đã xác minh", "Verified account holder"),
        }).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              required
              value={bank[key]}
              onChange={(e) => setBank({ ...bank, [key]: e.target.value })}
            />
          </label>
        ))}
        <p>
          {tr(
            "Thông tin này được dùng để tạo QR và hiển thị người nhận cho khách.",
            "These details generate the payment QR and identify the payee.",
          )}
        </p>
        <button disabled={busy} className="btn btn-primary">
          {tr("Xác nhận đã kiểm tra", "Confirm verified")}
        </button>
      </form>
    </section>
  );
}
