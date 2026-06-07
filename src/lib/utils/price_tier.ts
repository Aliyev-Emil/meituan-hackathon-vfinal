import type { PriceTier } from "../types";

/** Per-person RMB tiers (¥/pp) */
export const PRICE_TIER_BOUNDS: Record<PriceTier, { min: number; max: number; label: string }> = {
  cheap: { min: 0, max: 80, label: "¥0–80" },
  medium: { min: 80, max: 140, label: "¥80–140" },
  expensive: { min: 140, max: 9999, label: "¥140+" },
};

const CHEAP_PATTERN =
  /\b(cheap|affordable|budget[- ]?friendly|economical|inexpensive|low[- ]?cost)\b|便宜|省钱|平价|实惠|经济/i;
const MEDIUM_PATTERN =
  /\b(medium|moderate|mid[- ]?range|average\s+price|mid[- ]?priced)\b|中等|中端|适中/i;
const EXPENSIVE_PATTERN =
  /\b(expensive|premium|fancy|upscale|high[- ]?end|luxury|splurge|fine\s+dining)\b|高档|奢华|贵|高端|豪华/i;

export function extractPriceTier(text: string): PriceTier | null {
  const lower = text.toLowerCase();
  if (EXPENSIVE_PATTERN.test(lower)) return "expensive";
  if (CHEAP_PATTERN.test(lower)) return "cheap";
  if (MEDIUM_PATTERN.test(lower)) return "medium";
  return null;
}

export function budgetForPriceTier(tier: PriceTier): { min: number; max: number } {
  const b = PRICE_TIER_BOUNDS[tier];
  return { min: b.min, max: b.max };
}

export function priceMatchesTier(pricePerPerson: number, tier: PriceTier): boolean {
  const { min, max } = PRICE_TIER_BOUNDS[tier];
  if (tier === "cheap") return pricePerPerson <= max;
  if (tier === "expensive") return pricePerPerson >= min;
  return pricePerPerson >= min && pricePerPerson <= max;
}

export function applyPriceTierFromText(
  text: string,
  intent: { budgetMin: number; budgetMax: number; priceTier?: PriceTier | null }
): void {
  const tier = extractPriceTier(text);
  if (!tier) return;
  const { min, max } = budgetForPriceTier(tier);
  intent.priceTier = tier;
  intent.budgetMin = min;
  intent.budgetMax = max;
  if (tier === "expensive") intent.budgetMin = PRICE_TIER_BOUNDS.expensive.min;
}
