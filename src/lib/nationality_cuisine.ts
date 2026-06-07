import type { Restaurant } from "./types";
import { RESTAURANTS } from "./data/restaurants";

export type RestaurantLike = Pick<
  Restaurant,
  "cuisine" | "cultureTag" | "name" | "nameZh" | "description"
>;

/** Style/category cuisines — not valid profile nationalities */
const EXCLUDED_CUISINES = new Set([
  "Hotpot",
  "BBQ",
  "Seafood",
  "Healthy",
  "Noodles",
  "Western",
]);

/** Regional / cultural cuisines from catalog + supported nationality matchers */
const EXTRA_NATIONALITIES = ["Thai", "Indian"] as const;

export function getNationalityOptions(): string[] {
  const fromCatalog = new Set<string>();
  for (const r of RESTAURANTS) {
    if (!EXCLUDED_CUISINES.has(r.cuisine)) {
      fromCatalog.add(r.cuisine);
    }
  }
  for (const n of EXTRA_NATIONALITIES) {
    fromCatalog.add(n);
  }
  return [...fromCatalog].sort((a, b) => a.localeCompare(b));
}

export const NATIONALITY_OPTIONS = getNationalityOptions();

export function isValidNationality(nation: string): boolean {
  const key = nation.trim().toLowerCase();
  return NATIONALITY_OPTIONS.some((n) => n.toLowerCase() === key);
}

function normalizeNationKey(nation: string): string {
  return nation.trim().toLowerCase().replace(/\s+/g, "");
}

function matchKorean(r: RestaurantLike): boolean {
  return (
    r.cuisine === "Korean" ||
    r.cultureTag.includes("韩式") ||
    /seoul|hongdae|gangnam|kimchi|bibimbap|banchan|korean/i.test(
      `${r.name} ${r.nameZh} ${r.description}`
    )
  );
}

function matchChinese(r: RestaurantLike): boolean {
  return (
    r.cuisine === "Cantonese" ||
    r.cuisine === "Taiwanese" ||
    r.cuisine === "Sichuan" ||
    r.cuisine === "Hunan" ||
    r.cultureTag.includes("粤") ||
    r.cultureTag.includes("川") ||
    r.cultureTag.includes("湘") ||
    r.cultureTag.includes("台式")
  );
}

function matchJapanese(r: RestaurantLike): boolean {
  return (
    r.cuisine === "Japanese" ||
    r.cultureTag.includes("日料") ||
    /sushi|ramen|izakaya|wagyu/i.test(`${r.name} ${r.description}`)
  );
}

const NATION_MATCHERS: Record<string, (r: RestaurantLike) => boolean> = {
  korean: matchKorean,
  korea: matchKorean,
  chinese: matchChinese,
  china: matchChinese,
  japanese: matchJapanese,
  japan: matchJapanese,
  thai: (r) =>
    r.cultureTag.includes("泰") ||
    /thai|tom yum|bangkok/i.test(`${r.name} ${r.cuisine} ${r.description}`),
  vietnamese: (r) => /vietnamese|pho|banh mi/i.test(`${r.name} ${r.cuisine} ${r.description}`),
  indian: (r) =>
    r.cultureTag.includes("印") ||
    /indian|butter chicken|dal|thali/i.test(`${r.name} ${r.cuisine} ${r.description}`),
  malaysian: (r) =>
    r.cuisine === "Malaysian" ||
    r.cultureTag.includes("马来") ||
    /penang|satay|laksa|nasi lemak|malacca/i.test(`${r.name} ${r.description}`),
  malaysia: (r) =>
    r.cuisine === "Malaysian" ||
    r.cultureTag.includes("马来") ||
    /penang|satay|laksa|nasi lemak|malacca/i.test(`${r.name} ${r.description}`),
  turkish: (r) =>
    r.cuisine === "Turkish" ||
    r.cultureTag.includes("土耳其") ||
    /istanbul|anatolia|bosphorus|kebab|lahmacun|pide|döner|doner/i.test(
      `${r.name} ${r.nameZh} ${r.description}`
    ),
  american: (r) => r.cuisine === "Western" && /burger|steak|brunch/i.test(r.description),
  italian: (r) =>
    r.cuisine === "Western" &&
    /pizza|pasta|trattoria|roma|italian/i.test(`${r.name} ${r.description}`),
};

export function restaurantMatchesNationality(
  restaurant: RestaurantLike,
  nation: string
): boolean {
  const key = normalizeNationKey(nation);
  const matcher = NATION_MATCHERS[key];
  if (matcher) return matcher(restaurant);
  return (
    restaurant.cuisine.toLowerCase() === key ||
    restaurant.cultureTag.toLowerCase().includes(key)
  );
}

export function filterRestaurantsByNationality<T extends RestaurantLike>(
  restaurants: T[],
  nation: string
): T[] {
  return restaurants.filter((r) => restaurantMatchesNationality(r, nation));
}
