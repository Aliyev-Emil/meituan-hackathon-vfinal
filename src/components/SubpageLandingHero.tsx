"use client";

import Link from "next/link";

interface SubpageLandingHeroProps {
  eyebrow: string;
  title: string;
  description: string;
  chips?: string[];
  ctaHref?: string;
  ctaLabel?: string;
  compact?: boolean;
}

export default function SubpageLandingHero({
  eyebrow,
  title,
  description,
  chips = [],
  ctaHref,
  ctaLabel,
  compact = false,
}: SubpageLandingHeroProps) {
  return (
    <section className={`subpage-landing animate-in${compact ? " subpage-landing--compact" : ""}`}>
      <div className="subpage-landing__content">
        <p className="subpage-landing__eyebrow">{eyebrow}</p>
        <h1 className="subpage-landing__title">{title}</h1>
        <p className="subpage-landing__description">{description}</p>
        {chips.length > 0 && (
          <div className="subpage-landing__chips">
            {chips.map((chip) => (
              <span key={chip} className="subpage-landing__chip">
                {chip}
              </span>
            ))}
          </div>
        )}
      </div>
      {ctaHref && ctaLabel && (
        <Link href={ctaHref} className="subpage-landing__cta">
          {ctaLabel}
        </Link>
      )}
    </section>
  );
}
