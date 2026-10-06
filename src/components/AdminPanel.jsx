import React, { useEffect, useState } from "react";
import { api, watch, openPrivateImage } from "../services/api";
import { useToast } from "./ToastContext";
import AsyncStatus from "./AsyncStatus";
import bundledVenues from "../data/venues.json";
import imageManifest from "../../docs/data/venue-image-update-manifest.json";
import imageCandidates from "../../docs/data/venue-image-candidates.json";
import unresolvedVenues from "../../docs/data/venue-image-unresolved.json";

const imageReviewKey = "sportspace:venue-image-reviews:v1";
const PAGE_SIZE = 24;

function loadImageReviews() {
  try {
    const value = JSON.parse(localStorage.getItem(imageReviewKey) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

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
  const [imageReviews, setImageReviews] = useState(loadImageReviews);
  const [imageFilter, setImageFilter] = useState("weak");
  const [imagePage, setImagePage] = useState(0);
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
  const candidateById = new Map(
    imageManifest.updates.map((item) => [item.id, item]),
  );
  const candidatesById = new Map(
    imageCandidates.candidates.map((item) => [item.id, item.candidates || []]),
  );
  const unresolvedById = new Map(
    unresolvedVenues.venues.map((item) => [item.id, item]),
  );
  const imageReviewRows = bundledVenues
    .map((venue) => ({
      ...venue,
      candidate: candidateById.get(venue.id),
      candidates: candidatesById.get(venue.id) || [],
      unresolved: unresolvedById.get(venue.id),
      review: imageReviews[venue.id] || null,
    }))
    .filter((venue) => {
      const isWeak = venue.candidate?.status === "search_title_matches_exact_name_address_query";
      const isUnresolved = !venue.candidate;
      if (imageFilter === "weak") return isWeak && !venue.review;
      if (imageFilter === "unresolved") return isUnresolved && !venue.review;
      if (imageFilter === "reviewed") return Boolean(venue.review);
      return isWeak || isUnresolved;
    });
  const imagePageRows = imageReviewRows.slice(
    imagePage * PAGE_SIZE,
    (imagePage + 1) * PAGE_SIZE,
  );
  const imagePageCount = Math.max(1, Math.ceil(imageReviewRows.length / PAGE_SIZE));
  const setImageReview = (id, status) => {
    const next = { ...imageReviews, [id]: { status, reviewedAt: new Date().toISOString() } };
    setImageReviews(next);
    localStorage.setItem(imageReviewKey, JSON.stringify(next));
    showSuccess(tr("Đã lưu kết quả duyệt trên trình duyệt.", "Review saved in this browser."));
  };
  return (
    <section className="container booking-flow" style={{ padding: 24 }}>
      <h2>
        {tr(
          "Duyệt chủ sân và tài khoản nhận tiền",
          "Merchant & bank verification",
        )}
      </h2>
      <AsyncStatus error={error} lang={lang} />
      <article className="glass-panel feature-card" style={{ marginBottom: 24 }}>
        <h3>{tr("Xác thực ảnh sân thủ công", "Manual venue image verification")}</h3>
        <p>
          {tr(
            `Chỉ hiển thị ảnh ứng viên yếu và sân chưa tìm được ảnh. Đang có ${imageReviewRows.length} mục trong bộ lọc hiện tại. Kết quả chỉ lưu trên trình duyệt này.`,
            `Only weak candidates and venues without candidates are shown. There are ${imageReviewRows.length} items in the current filter. Reviews are stored only in this browser.`,
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["weak", tr("Ảnh ứng viên yếu", "Weak candidates")],
            ["unresolved", tr("Chưa tìm được ảnh", "No candidate")],
            ["reviewed", tr("Đã duyệt", "Reviewed")],
            ["all", tr("Tất cả cần xử lý", "All to review")],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={imageFilter === value ? "btn btn-primary" : "btn btn-outline"}
              onClick={() => {
                setImageFilter(value);
                setImagePage(0);
              }}
            >
              {label}
            </button>
          ))}
          <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            {imageReviewRows.length} {tr("mục", "items")} · {imagePage + 1}/{imagePageCount}
          </span>
        </div>
      </article>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {imagePageRows.map((venue) => (
          <article className="glass-panel feature-card" key={venue.id}>
            <img
              src={venue.image}
              alt={venue.name}
              loading="lazy"
              style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 12, background: "var(--bg-secondary)" }}
            />
            <h3 style={{ marginTop: 12 }}>{venue.name}</h3>
            <p style={{ color: "var(--text-muted)", minHeight: 44 }}>{venue.address}</p>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
              {venue.candidate
                ? tr("Ứng viên yếu: cần kiểm tra thủ công", "Weak candidate: manual check required")
                : tr("Chưa có ứng viên nguồn", "No source candidate found")}
              </p>
              {(venue.candidates.length > 0 || venue.candidate?.sourceUrl) && (
                <div className="flex flex-col gap-2">
                  {venue.candidates.slice(0, 5).map((candidate) => (
                    <div key={candidate.imageUrl} className="flex items-center gap-2">
                      <img
                        src={candidate.imageUrl}
                        alt=""
                        loading="lazy"
                        style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 6 }}
                      />
                      <a
                        href={candidate.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm underline"
                      >
                        {tr("Mở nguồn ứng viên", "Open candidate source")}
                      </a>
                    </div>
                  ))}
                  {venue.candidate?.sourceUrl && venue.candidates.length === 0 && (
                    <a href={venue.candidate.sourceUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                      {tr("Mở trang nguồn để kiểm tra", "Open source page")}
                    </a>
                  )}
                </div>
              )}
              {venue.unresolved && (
                <div className="flex flex-wrap gap-2">
                  <a href={venue.unresolved.googleMapsSearch} target="_blank" rel="noreferrer" className="text-sm underline">
                    Google Maps
                  </a>
                  <a href={venue.unresolved.bingImagesSearch} target="_blank" rel="noreferrer" className="text-sm underline">
                    Bing Images
                  </a>
                </div>
              )}
            <div className="flex gap-2 mt-3">
              <button type="button" className="btn btn-primary flex-1" onClick={() => setImageReview(venue.id, "approved")}>
                {tr("Đạt", "Pass")}
              </button>
              <button type="button" className="btn btn-outline flex-1" onClick={() => setImageReview(venue.id, "rejected")}>
                {tr("Không đạt", "Reject")}
              </button>
            </div>
            {venue.review && (
              <small style={{ color: venue.review.status === "approved" ? "var(--accent-green)" : "var(--accent-red)" }}>
                {venue.review.status === "approved" ? tr("Đã duyệt", "Passed") : tr("Đã loại", "Rejected")}
              </small>
            )}
          </article>
        ))}
      </div>
      <div className="flex justify-center gap-3 my-6">
        <button type="button" className="btn btn-outline" disabled={imagePage === 0} onClick={() => setImagePage((page) => page - 1)}>
          {tr("Trang trước", "Previous")}
        </button>
        <button type="button" className="btn btn-outline" disabled={imagePage + 1 >= imagePageCount} onClick={() => setImagePage((page) => page + 1)}>
          {tr("Trang sau", "Next")}
        </button>
      </div>
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
