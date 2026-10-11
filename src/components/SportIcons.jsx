import React from "react";
import {
  IconBallFootball,
  IconBallBasketball,
  IconBallTennis,
  IconBallVolleyball,
  IconPingPong,
  IconTrophy,
} from "@tabler/icons-react";

/**
 * Custom Tabler-styled SVG for Badminton (Shuttlecock)
 * Uses standard Tabler 24x24 viewBox, stroke-width and round caps
 */
export function IconBadminton({
  size = 24,
  stroke = 1.75,
  className = "",
  style,
  ...props
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      {...props}
    >
      {/* Cork bottom */}
      <path d="M9 17a3 3 0 0 0 6 0c0 -1 -1.34 -2 -3 -2s-3 1 -3 2z" />
      {/* Feathers skirt */}
      <path d="M6 4l3.5 11" />
      <path d="M18 4l-3.5 11" />
      <path d="M9.5 4l1.5 11" />
      <path d="M14.5 4l-1.5 11" />
      <path d="M6 4a12 12 0 0 0 12 0" />
      {/* Connecting bands */}
      <path d="M7.5 8h9" />
      <path d="M8.5 11.5h7" />
    </svg>
  );
}

/**
 * Custom Tabler-styled SVG for Pickleball (Paddle + Perforated Ball)
 */
export function IconPickleball({
  size = 24,
  stroke = 1.75,
  className = "",
  style,
  ...props
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", ...style }}
      {...props}
    >
      {/* Paddle face */}
      <rect x="4" y="3" width="11" height="12" rx="4" />
      {/* Handle */}
      <path d="M9.5 15v6" />
      <path d="M8 21h3" />
      {/* Paddle holes */}
      <circle cx="7.5" cy="7.5" r="0.75" fill="currentColor" />
      <circle cx="11.5" cy="7.5" r="0.75" fill="currentColor" />
      <circle cx="9.5" cy="10.5" r="0.75" fill="currentColor" />
      {/* Pickleball perforated ball */}
      <circle cx="18" cy="7" r="3.5" />
      <circle cx="17" cy="6.2" r="0.5" fill="currentColor" />
      <circle cx="19" cy="6.2" r="0.5" fill="currentColor" />
      <circle cx="18" cy="8" r="0.5" fill="currentColor" />
    </svg>
  );
}

// Re-export Tabler sport icons
export {
  IconBallFootball,
  IconBallBasketball,
  IconBallTennis,
  IconBallVolleyball,
  IconPingPong,
  IconTrophy,
};

/**
 * Consistent Tailwind color badge styling for sports across the entire app
 */
export function getSportBadgeStyle(sport) {
  const norm = (sport || "").toLowerCase().trim();
  switch (norm) {
    case "bóng đá":
    case "football":
    case "soccer":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25";
    case "pickleball":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25";
    case "cầu lông":
    case "badminton":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25";
    case "tennis":
      return "bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/25";
    case "bóng rổ":
    case "basketball":
      return "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25";
    case "bóng bàn":
    case "table tennis":
      return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/25";
    case "bóng chuyền":
    case "volleyball":
      return "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25";
    case "all":
    case "tất cả":
    case "tất cả bộ môn":
    case "all sports":
      return "bg-[var(--brand-sport)]/15 text-[var(--brand-sport)] border-[var(--brand-sport)]/30";
    default:
      return "bg-[var(--brand-sport)]/10 text-[var(--brand-sport)] border-[var(--brand-sport)]/25";
  }
}

/**
 * Text and icon color class for sports across the entire app
 */
export function getSportTextColor(sport) {
  const norm = (sport || "").toLowerCase().trim();
  switch (norm) {
    case "bóng đá":
    case "football":
    case "soccer":
      return "text-blue-600 dark:text-blue-400";
    case "pickleball":
      return "text-emerald-600 dark:text-emerald-400";
    case "cầu lông":
    case "badminton":
      return "text-amber-600 dark:text-amber-400";
    case "tennis":
      return "text-lime-600 dark:text-lime-400";
    case "bóng rổ":
    case "basketball":
      return "text-orange-600 dark:text-orange-400";
    case "bóng bàn":
    case "table tennis":
      return "text-purple-600 dark:text-purple-400";
    case "bóng chuyền":
    case "volleyball":
      return "text-teal-600 dark:text-teal-400";
    default:
      return "text-[var(--brand-sport)]";
  }
}

/**
 * Returns hex color for sport (useful for inline styles or canvas)
 */
export function getSportHex(sport) {
  const norm = (sport || "").toLowerCase().trim();
  switch (norm) {
    case "bóng đá":
    case "football":
    case "soccer":
      return "#2563eb";
    case "pickleball":
      return "#059669";
    case "cầu lông":
    case "badminton":
      return "#d97706";
    case "tennis":
      return "#65a30d";
    case "bóng rổ":
    case "basketball":
      return "#ea580c";
    case "bóng bàn":
    case "table tennis":
      return "#9333ea";
    case "bóng chuyền":
    case "volleyball":
      return "#0d9488";
    default:
      return "#89b9e6";
  }
}

/**
 * Interactive filter pill button styling (active vs inactive)
 */
export function getSportPillStyle(sport, isSelected) {
  const norm = (sport || "").toLowerCase().trim();
  if (isSelected) {
    switch (norm) {
      case "bóng đá":
      case "football":
      case "soccer":
        return "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25 ring-2 ring-blue-500/20";
      case "pickleball":
        return "bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/25 ring-2 ring-emerald-500/20";
      case "cầu lông":
      case "badminton":
        return "bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/25 ring-2 ring-amber-500/20";
      case "tennis":
        return "bg-lime-600 text-white border-lime-600 shadow-md shadow-lime-500/25 ring-2 ring-lime-500/20";
      case "bóng rổ":
      case "basketball":
        return "bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/25 ring-2 ring-orange-500/20";
      case "bóng bàn":
      case "table tennis":
        return "bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-500/25 ring-2 ring-purple-500/20";
      case "bóng chuyền":
      case "volleyball":
        return "bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-500/25 ring-2 ring-teal-500/20";
      default:
        return "bg-[var(--brand-sport)] text-white border-[var(--brand-sport)] shadow-md ring-2 ring-[var(--brand-sport)]/20";
    }
  }
  return `${getSportBadgeStyle(sport)} hover:brightness-95 dark:hover:brightness-110`;
}

/**
 * Returns matching React sport icon component
 */
export function getSportIcon(sport, size = 16, className = "", stroke = 1.75) {
  const norm = (sport || "").toLowerCase().trim();
  switch (norm) {
    case "bóng đá":
    case "football":
    case "soccer":
      return (
        <IconBallFootball
          size={size}
          stroke={stroke}
          className={className}
        />
      );
    case "bóng rổ":
    case "basketball":
      return (
        <IconBallBasketball
          size={size}
          stroke={stroke}
          className={className}
        />
      );
    case "tennis":
      return (
        <IconBallTennis
          size={size}
          stroke={stroke}
          className={className}
        />
      );
    case "bóng chuyền":
    case "volleyball":
      return (
        <IconBallVolleyball
          size={size}
          stroke={stroke}
          className={className}
        />
      );
    case "bóng bàn":
    case "table tennis":
      return (
        <IconPingPong
          size={size}
          stroke={stroke}
          className={className}
        />
      );
    case "cầu lông":
    case "badminton":
      return (
        <IconBadminton
          size={size}
          stroke={stroke}
          className={className}
        />
      );
    case "pickleball":
      return (
        <IconPickleball
          size={size}
          stroke={stroke}
          className={className}
        />
      );
    case "all":
    case "tất cả":
    case "tất cả bộ môn":
    case "all sports":
    default:
      return (
        <IconTrophy
          size={size}
          stroke={stroke}
          className={className}
        />
      );
  }
}

/**
 * Bilingual sport name resolver
 */
export function getSportLabel(sport, lang = "vi") {
  if (!sport) return "";
  const s = sport.trim();
  if (s.toUpperCase() === "ALL") {
    return lang === "vi" ? "Tất cả bộ môn" : "All Sports";
  }
  const map = {
    pickleball: { vi: "Pickleball", en: "Pickleball" },
    "bóng đá": { vi: "Bóng đá", en: "Football" },
    football: { vi: "Bóng đá", en: "Football" },
    soccer: { vi: "Bóng đá", en: "Football" },
    "cầu lông": { vi: "Cầu lông", en: "Badminton" },
    badminton: { vi: "Cầu lông", en: "Badminton" },
    tennis: { vi: "Tennis", en: "Tennis" },
    "bóng rổ": { vi: "Bóng rổ", en: "Basketball" },
    basketball: { vi: "Bóng rổ", en: "Basketball" },
    "bóng bàn": { vi: "Bóng bàn", en: "Table Tennis" },
    "table tennis": { vi: "Bóng bàn", en: "Table Tennis" },
    "bóng chuyền": { vi: "Bóng chuyền", en: "Volleyball" },
    volleyball: { vi: "Bóng chuyền", en: "Volleyball" },
  };
  const entry = map[s.toLowerCase()];
  if (!entry) return s;
  return lang === "vi" ? entry.vi : entry.en;
}

/**
 * Unified SportIcon component
 */
export default function SportIcon({
  sport,
  size = 16,
  className = "",
  stroke = 1.75,
}) {
  return getSportIcon(sport, size, className, stroke);
}

/**
 * Unified SportBadge component with icon + label + theme styling
 */
export function SportBadge({
  sport,
  lang = "vi",
  size = "sm",
  className = "",
  showIcon = true,
}) {
  const iconSize = size === "xs" ? 12 : size === "sm" ? 13 : 16;
  const paddingClass =
    size === "xs"
      ? "px-2 py-0.5 text-[11px]"
      : size === "sm"
      ? "px-2.5 py-0.5 text-xs"
      : "px-3 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-bold rounded-full border shadow-xs whitespace-nowrap transition-all ${paddingClass} ${getSportBadgeStyle(
        sport
      )} ${className}`}
    >
      {showIcon && getSportIcon(sport, iconSize)}
      <span>{getSportLabel(sport, lang)}</span>
    </span>
  );
}
