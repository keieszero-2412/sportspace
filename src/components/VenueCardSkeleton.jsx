import React from "react";

export default function VenueCardSkeleton() {
  return (
    <div
      className="venue-card-skeleton animate-pulse"
      style={{
        background: "var(--surface-card)",
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--surface-card-border)",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
        display: "flex",
        flexDirection: "column",
        height: "380px",
      }}
    >
      {/* Image Placeholder */}
      <div
        style={{
          width: "100%",
          height: "170px",
          backgroundColor: "var(--bg-secondary)",
        }}
      />
      
      {/* Content Body */}
      <div
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          flex: 1,
          gap: 12,
        }}
      >
        {/* Title Placeholder */}
        <div style={{ height: "24px", backgroundColor: "var(--bg-secondary)", borderRadius: "4px", width: "80%" }} />
        
        {/* Address Placeholder */}
        <div style={{ height: "16px", backgroundColor: "var(--bg-secondary)", borderRadius: "4px", width: "60%" }} />
        
        {/* Phone Placeholder */}
        <div style={{ height: "16px", backgroundColor: "var(--bg-secondary)", borderRadius: "4px", width: "40%" }} />
        
        {/* Price Box Placeholder */}
        <div
          style={{
            height: "56px",
            backgroundColor: "var(--bg-secondary)",
            borderRadius: "var(--radius-sm)",
            marginTop: "auto",
          }}
        />
        
        {/* Button Placeholder */}
        <div
          style={{
            height: "40px",
            backgroundColor: "var(--bg-secondary)",
            borderRadius: "var(--radius-sm)",
            marginTop: "4px",
          }}
        />
      </div>
    </div>
  );
}
