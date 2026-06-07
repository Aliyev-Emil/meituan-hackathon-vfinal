/** Shenzhen district anchors for search & cuisine listings */
export const DISTRICT_CENTERS: Record<
  string,
  { lat: number; lng: number; label: string }
> = {
  Futian: { lat: 22.54, lng: 114.05, label: "Futian, Shenzhen" },
  Nanshan: { lat: 22.52, lng: 113.94, label: "Nanshan, Shenzhen" },
  Luohu: { lat: 22.545, lng: 114.12, label: "Luohu, Shenzhen" },
  "Bao'an": { lat: 22.555, lng: 113.884, label: "Bao'an, Shenzhen" },
  Longgang: { lat: 22.72, lng: 114.246, label: "Longgang, Shenzhen" },
  Longhua: { lat: 22.665, lng: 114.038, label: "Longhua, Shenzhen" },
  Yantian: { lat: 22.596, lng: 114.32, label: "Yantian, Shenzhen" },
  Guangming: { lat: 22.76, lng: 113.958, label: "Guangming, Shenzhen" },
  Dapeng: { lat: 22.595, lng: 114.505, label: "Dapeng, Shenzhen" },
};

const DISTRICT_ALIASES: { pattern: RegExp; district: string }[] = [
  { pattern: /futian|福田/i, district: "Futian" },
  { pattern: /nanshan|南山/i, district: "Nanshan" },
  { pattern: /luohu|罗湖/i, district: "Luohu" },
  { pattern: /bao'?an|宝安/i, district: "Bao'an" },
  { pattern: /longgang|龙岗/i, district: "Longgang" },
  { pattern: /longhua|龙华/i, district: "Longhua" },
  { pattern: /yantian|盐田/i, district: "Yantian" },
  { pattern: /guangming|光明/i, district: "Guangming" },
  { pattern: /dapeng|大鹏/i, district: "Dapeng" },
  { pattern: /shekou|蛇口/i, district: "Nanshan" },
];

export function extractDistrict(text: string): string | null {
  for (const { pattern, district } of DISTRICT_ALIASES) {
    if (pattern.test(text)) return district;
  }
  return null;
}

export function resolveLocation(
  text: string,
  user: { lat: number; lng: number; locationLabel: string }
): { lat: number; lng: number; label: string; targetDistrict?: string } {
  const district = extractDistrict(text);
  if (district && DISTRICT_CENTERS[district]) {
    const c = DISTRICT_CENTERS[district];
    return { lat: c.lat, lng: c.lng, label: c.label, targetDistrict: district };
  }
  return { lat: user.lat, lng: user.lng, label: user.locationLabel };
}
