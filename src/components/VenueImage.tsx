"use client";

import { useState } from "react";

interface VenueImageProps {
  src: string;
  alt: string;
  height?: number;
  fill?: boolean;
}

export default function VenueImage({ src, alt, height = 140, fill }: VenueImageProps) {
  const [err, setErr] = useState(false);

  const url = err
    ? src.startsWith("data:")
      ? src
      : `https://picsum.photos/seed/${encodeURIComponent(alt)}/800/533`
    : src;

  if (fill) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={alt}
        onError={() => setErr(true)}
        className="venue-image__fill"
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      onError={() => setErr(true)}
      className="venue-image__fixed"
      style={{ height }}
      loading="lazy"
      decoding="async"
    />
  );
}
