/**
 * Venue images:
 * - Default: colored SVG placeholders
 * - Your photos: public/venues/photos/{id}.jpg + NEXT_PUBLIC_USE_LOCAL_VENUE_PHOTOS=true in .env.local
 */

const USE_LOCAL_PHOTOS = process.env.NEXT_PUBLIC_USE_LOCAL_VENUE_PHOTOS === "true";

const RESTAURANT_EMOJI: Record<string, string> = {
  Taiwanese: "🥟",
  Cantonese: "🥡",
  Hotpot: "🍲",
  Japanese: "🍣",
  Sichuan: "🌶️",
  Hunan: "🌶️",
  Western: "🥩",
  Healthy: "🥗",
  Noodles: "🍜",
  BBQ: "🍖",
  Seafood: "🦐",
  Korean: "🍖",
  Malaysian: "🍛",
  Turkish: "🥙",
};

const ACTIVITY_EMOJI: Record<string, string> = {
  kids_park: "🎠",
  exhibition: "🖼️",
  city_walk: "🚶",
  food_street: "🏮",
  mall: "🛍️",
};

function hashHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** Photo-style card (unique color + bokeh per venue) */
function photoDataUri(id: string, title: string, subtitle: string, emoji: string): string {
  const hue = hashHue(id);
  const hue2 = (hue + 40) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <defs>
    <linearGradient id="sky" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="hsl(${hue},45%,22%)"/>
      <stop offset="50%" stop-color="hsl(${hue2},55%,38%)"/>
      <stop offset="100%" stop-color="hsl(${hue},35%,18%)"/>
    </linearGradient>
    <radialGradient id="bokeh1" cx="80%" cy="20%"><stop offset="0%" stop-color="rgba(255,255,255,0.35)"/><stop offset="100%" stop-color="rgba(255,255,255,0)"/></radialGradient>
    <radialGradient id="bokeh2" cx="15%" cy="75%"><stop offset="0%" stop-color="rgba(255,195,0,0.4)"/><stop offset="100%" stop-color="rgba(255,195,0,0)"/></radialGradient>
  </defs>
  <rect width="600" height="400" fill="url(#sky)"/>
  <rect width="600" height="400" fill="url(#bokeh1)"/>
  <rect width="600" height="400" fill="url(#bokeh2)"/>
  <rect x="0" y="280" width="600" height="120" fill="rgba(0,0,0,0.45)"/>
  <text x="300" y="140" text-anchor="middle" font-size="88">${emoji}</text>
  <text x="28" y="330" fill="#FFC300" font-family="system-ui,sans-serif" font-size="26" font-weight="bold">${title}</text>
  <text x="28" y="362" fill="rgba(255,255,255,0.85)" font-family="system-ui,sans-serif" font-size="16">${subtitle}</text>
  <text x="572" y="362" text-anchor="end" fill="rgba(255,255,255,0.5)" font-size="12" font-family="sans-serif">${id}</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export function venueImageUrl(
  id: string,
  kind: "restaurant" | "activity",
  tag?: string
): string {
  if (USE_LOCAL_PHOTOS) {
    return `/venues/photos/${id}.jpg`;
  }
  if (kind === "restaurant") {
    const cuisine = tag ?? "Restaurant";
    const emoji = RESTAURANT_EMOJI[cuisine] ?? "🍽️";
    return photoDataUri(id, cuisine, "Shenzhen · Restaurant", emoji);
  }
  const type = tag ?? "activity";
  const emoji = ACTIVITY_EMOJI[type] ?? "📍";
  const label = type.replace(/_/g, " ");
  return photoDataUri(id, label, "Shenzhen · Activity", emoji);
}

export function avatarImageUrl(userId: string): string {
  const colors = ["#FFC300", "#FF9800", "#4CAF50", "#2196F3", "#9C27B0"];
  const c = colors[userId.length % colors.length];
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${c}"/><text x="40" y="48" text-anchor="middle" font-size="32" font-family="sans-serif" fill="#333">${userId[0].toUpperCase()}</text></svg>`
  )}`;
}

/** Optional: real JPG from Picsum if user runs `npm run photos` (see scripts/download-photos.mjs) */
export function venueImageUrlWithLocalFallback(
  id: string,
  kind: "restaurant" | "activity",
  tag?: string
): string {
  return venueImageUrl(id, kind, tag);
}
