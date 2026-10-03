import { ExternalLink, Star } from "lucide-react";
import { getGoogleRating } from "../services/googleRating";

export default function GoogleRating({ venue, lang = "vi", compact = false }) {
  const { rating, count, url } = getGoogleRating(venue);
  const title =
    lang === "vi"
      ? "Xem đánh giá của sân trên Google Maps"
      : "View this venue's ratings on Google Maps";
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="google-rating smooth-transition"
      data-rating-available={rating !== null}
      title={title}
      aria-label={rating === null ? title : `${rating.toFixed(1)}/5 · ${title}`}
      onClick={(event) => event.stopPropagation()}
      style={{
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        color: "#FBBF24",
        padding: compact ? "3px 8px" : "4px 10px",
        borderRadius: "var(--radius-full)",
        fontSize: "0.75rem",
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        textDecoration: "none",
        maxWidth: "100%",
      }}
    >
      <Star
        size={12}
        fill={rating === null ? "none" : "#FBBF24"}
        aria-hidden="true"
      />
      {rating !== null && (
        <span>
          {rating.toFixed(1)}
          {count !== null &&
            ` (${count.toLocaleString(lang === "vi" ? "vi-VN" : "en-US")}${
              compact ? "" : lang === "vi" ? " đánh giá" : " reviews"
            })`}
        </span>
      )}
      <span
        style={{ color: "#FFF8D2", fontSize: compact ? "0.65rem" : "0.75rem" }}
      >
        {compact ? "Google" : "Google Maps"}
      </span>
      <ExternalLink size={11} aria-hidden="true" />
    </a>
  );
}
