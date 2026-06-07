"use client";

import VenueImage from "./VenueImage";

interface VenueCardProps {
  name: string;
  subtitle?: string;
  imageUrl: string;
  description?: string;
  badges?: string[];
  meta?: string;
  onClick?: () => void;
  compact?: boolean;
}

export default function VenueCard({
  name,
  subtitle,
  imageUrl,
  description,
  badges = [],
  meta,
  onClick,
  compact,
}: VenueCardProps) {
  return (
    <div
      className="card animate-fade"
      style={{ overflow: "hidden", cursor: onClick ? "pointer" : "default", padding: 0 }}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={`venue-image-frame ${compact ? "venue-image-frame--fixed" : "venue-image-frame--hero"}`}>
        <VenueImage src={imageUrl} alt={name} fill />
      </div>
      <div style={{ padding: compact ? 12 : 16 }}>
        <strong>{name}</strong>
        {subtitle && <p style={{ fontSize: 13, color: "#666" }}>{subtitle}</p>}
        {meta && <p style={{ fontSize: 12, color: "#888", marginTop: 4 }}>{meta}</p>}
        {description && !compact && (
          <p style={{ fontSize: 13, marginTop: 8, color: "#555", lineHeight: 1.4 }}>{description}</p>
        )}
        {badges.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {badges.map((b) => (
              <span key={b} className="badge badge-gray">
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
