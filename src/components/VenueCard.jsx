import React from "react";
import {
  MapPin,
  Layers,
  CalendarCheck,
  ShieldCheck,
  Heart,
} from "lucide-react";
import GoogleRating from "./GoogleRating";
import VenuePhone from "./VenuePhone";

function isPriceSummary(value) {
  const text = String(value || "").trim();
  return /\d[\d.,\s]*(?:đ|vnđ|vnd|k)\b/i.test(text) &&
    /(?:giá|thuê|sân|giờ|\/\s*h\b)/i.test(text);
}

const VenueCard = React.memo(function VenueCard({
  venue,
  onViewDetails,
  onBookNow,
  isSaved = false,
  onToggleSave = () => {},
  lang = "vi",
}) {
  const {
    id,
    name: nameVi,
    name_en,
    sport,
    province: provinceVi,
    province_en,
    address: addressVi,
    address_en,
    operating_hours,
    scale_courts,
    price_summary,
    amenities = [],
    image,
  } = venue;

  const name = lang === "en" ? name_en || nameVi : nameVi;
  const displayPrice = isPriceSummary(price_summary)
    ? price_summary
    : lang === "vi"
      ? "Chưa có giá công khai"
      : "No public price";
  const [imageFailed, setImageFailed] = React.useState(false);
  const province = lang === "en" ? province_en || provinceVi : provinceVi;
  const address = lang === "en" ? address_en || addressVi : addressVi;

  return (
    <div
      className="venue-card smooth-transition animate-fade-up"
      style={{
        background: "var(--surface-card)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--surface-card-border)",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Image Thumbnail with Badges */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "170px",
          overflow: "hidden",
        }}
      >
        <img
          src={
            image ||
            "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=800&auto=format&fit=crop"
          }
          alt={name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transition: "transform 0.5s ease",
          }}
          loading="lazy"
          onError={(e) => {
            setImageFailed(true);
            e.target.onerror = null;
            e.target.src =
              "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?q=80&w=800&auto=format&fit=crop";
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 40%, rgba(0,0,0,0.7) 100%)",
          }}
        />

        {(!image || imageFailed) && (
          <span
            className="badge"
            style={{ position: "absolute", bottom: 8, left: 8 }}
          >
            {lang === "vi" ? "Ảnh minh họa" : "Illustrative image"}
          </span>
        )}
        {/* Top Badges */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            display: "flex",
            gap: 6,
          }}
        >
          <span
            className="badge badge-sport"
            style={{ fontSize: "0.72rem", padding: "3px 8px" }}
          >
            {sport}
          </span>
          <span
            className="badge badge-highlight"
            style={{ fontSize: "0.72rem", padding: "3px 8px" }}
          >
            📍 {province}
          </span>
        </div>

        {/* Top Right: Rating & Heart Bookmark */}
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave(venue.id);
            }}
            style={{
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              border: "none",
              borderRadius: "50%",
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: isSaved ? "#EF4444" : "#fff",
              transition: "transform 0.15s ease",
            }}
            title={
              isSaved
                ? lang === "vi"
                  ? "Bỏ lưu sân"
                  : "Remove from favorites"
                : lang === "vi"
                  ? "Lưu vào danh sách yêu thích"
                  : "Save to favorites"
            }
          >
            <Heart size={14} fill={isSaved ? "#EF4444" : "none"} />
          </button>

          <GoogleRating venue={venue} lang={lang} compact />
        </div>

        {/* Bottom scale & hours on image */}
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 10,
            right: 10,
            display: "flex",
            justifyContent: "space-between",
            color: "#FFF8D2",
            fontSize: "0.75rem",
            fontWeight: 600,
          }}
        >
          <span>
            🏟️ {scale_courts} {lang === "vi" ? "sân con" : "courts"}
          </span>
          <span>🕒 {operating_hours}</span>
        </div>
      </div>

      {/* Card Content Body */}
      <div
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          gap: 10,
        }}
      >
        {/* Name */}
        <h3
          onClick={() => onViewDetails(venue)}
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            lineHeight: 1.35,
            color: "var(--text-primary)",
            cursor: "pointer",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
          title={name}
        >
          {name}
        </h3>

        {/* Address */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 6,
            fontSize: "0.82rem",
            color: "var(--text-muted)",
          }}
        >
          <MapPin
            size={15}
            style={{ flexShrink: 0, marginTop: 2, color: "var(--btn-primary)" }}
          />
          <span
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 1,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {address}
          </span>
        </div>

        {/* Phone / Hotline */}
        <VenuePhone venue={venue} lang={lang} />

        {/* Price Tag */}
        <div
          style={{
            background: "var(--bg-primary)",
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--surface-card-border)",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              fontWeight: 600,
            }}
          >
            {lang === "vi" ? "Giá thuê tham khảo:" : "Price range:"}
          </div>
          <div
            style={{
              fontSize: "0.95rem",
              fontWeight: 800,
              color: "var(--text-primary)",
            }}
          >
            {displayPrice}
          </div>
        </div>

        {/* Card Action Buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button
            onClick={() => onBookNow(venue)}
            className="btn btn-primary"
            style={{ padding: "8px 12px", fontSize: "0.85rem", flex: 1 }}
          >
            <CalendarCheck size={16} />
            <span>{lang === "vi" ? "Đặt sân ngay" : "Book Now"}</span>
          </button>
        </div>
      </div>
    </div>
  );
});

export default VenueCard;
