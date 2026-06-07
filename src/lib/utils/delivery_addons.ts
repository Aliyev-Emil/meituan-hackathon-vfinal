import { DELIVERY_CATALOG } from "../data/delivery_vendors";
import { DeliveryAddonKind, Plan, PlanDeliveryAddon } from "../types";
import { resolvePlanRestaurant } from "../tools/one_stop_agent";

const KIND_PATTERNS: { kind: DeliveryAddonKind; pattern: RegExp }[] = [
  { kind: "cake", pattern: /birthday\s+cake|celebration\s+cake|蛋糕|生日蛋糕|买个蛋糕|送蛋糕|cake/i },
  { kind: "flowers", pattern: /flower|bouquet|roses|鲜花|花束|送花|买花/i },
  { kind: "champagne", pattern: /champagne|sparkling\s+wine|香槟|起泡酒/i },
  { kind: "gift", pattern: /gift\s*box|present|礼物|礼盒|伴手礼/i },
  { kind: "balloons", pattern: /balloon|气球/i },
];

const DELIVERY_VERB =
  /deliver|delivery|send|bring|arrange|order\s+(a|some)|get\s+(a|some)|送|配送|送到|带去|准备/i;

export const POST_PLAN_FOLLOWUP_MESSAGE =
  "Is there anything else I can do for this outing? I can arrange **cake**, **flowers**, **champagne**, or **gifts** delivered to the restaurant — just say the word.";

export function extractDeliveryAddonKinds(text: string): DeliveryAddonKind[] {
  const lower = text.toLowerCase();
  const found = new Set<DeliveryAddonKind>();
  for (const { kind, pattern } of KIND_PATTERNS) {
    if (pattern.test(lower) || pattern.test(text)) found.add(kind);
  }
  return [...found];
}

export function isDeliveryAddonRequest(text: string): boolean {
  const kinds = extractDeliveryAddonKinds(text);
  if (!kinds.length) return false;
  if (DELIVERY_VERB.test(text)) return true;
  return /cake|flower|champagne|gift|balloon|蛋糕|鲜花|香槟|礼物|气球/i.test(text);
}

export function resolveDeliveryAddons(
  kinds: DeliveryAddonKind[],
  deliverTo: string,
  deliverToVenueId?: string
): PlanDeliveryAddon[] {
  return kinds.map((kind) => {
    const item = DELIVERY_CATALOG[kind];
    return {
      id: `del-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      kind,
      label: item.label,
      vendorName: item.vendorName,
      price: item.price,
      etaMinutes: item.etaMinutes,
      deliverTo,
      deliverToVenueId,
      status: "scheduled" as const,
    };
  });
}

export function mergeDeliveryAddons(
  existing: PlanDeliveryAddon[] | undefined,
  incoming: PlanDeliveryAddon[]
): PlanDeliveryAddon[] {
  const merged = [...(existing ?? [])];
  for (const addon of incoming) {
    if (merged.some((m) => m.kind === addon.kind)) continue;
    merged.push(addon);
  }
  return merged;
}

export function attachDeliveryAddonsToPlan(plan: Plan, kinds: DeliveryAddonKind[]): Plan {
  if (!kinds.length) return plan;
  const restaurant = resolvePlanRestaurant(plan);
  if (!restaurant) return plan;

  const incoming = resolveDeliveryAddons(kinds, restaurant.name, restaurant.id);
  const deliveryAddons = mergeDeliveryAddons(plan.deliveryAddons, incoming);
  const existingAddonCost = deliveryAddonCost(plan.deliveryAddons);
  const mealTotal = Math.max(0, (plan.estimatedTotal ?? 0) - existingAddonCost);
  const addonTotal = deliveryAddonCost(deliveryAddons);

  return {
    ...plan,
    deliveryAddons,
    estimatedTotal: mealTotal + addonTotal,
    summary: plan.summary
      ? `${plan.summary}\n\n🎁 Delivery add-ons: ${formatDeliveryAddonList(deliveryAddons)}.`
      : `🎁 Delivery add-ons: ${formatDeliveryAddonList(deliveryAddons)}.`,
  };
}

export interface DeliveryAddonApplyResult {
  updatedPlan: Plan;
  newlyAdded: PlanDeliveryAddon[];
  message: string;
}

/** Parse user text and merge delivery add-ons onto a plan (no order side effects). */
export function applyDeliveryAddonsFromMessage(
  plan: Plan,
  userMessage: string
): DeliveryAddonApplyResult | null {
  if (!isDeliveryAddonRequest(userMessage)) return null;

  const kinds = extractDeliveryAddonKinds(userMessage);
  if (!kinds.length) return null;

  if (!resolvePlanRestaurant(plan)) return null;

  const beforeKinds = new Set((plan.deliveryAddons ?? []).map((a) => a.kind));
  const updatedPlan = attachDeliveryAddonsToPlan(plan, kinds);
  const newlyAdded =
    updatedPlan.deliveryAddons?.filter((a) => !beforeKinds.has(a.kind)) ?? [];

  const message =
    newlyAdded.length > 0
      ? formatDeliveryAddonConfirmation(newlyAdded)
      : `Those add-ons are already on your plan: ${kinds.join(", ")}.`;

  return { updatedPlan, newlyAdded, message };
}

export function formatDeliveryAddonList(addons: PlanDeliveryAddon[]): string {
  return addons.map((a) => `${a.label} → ${a.deliverTo} (¥${a.price})`).join(" · ");
}

export function formatDeliveryAddonConfirmation(addons: PlanDeliveryAddon[]): string {
  const lines = addons.map(
    (a) =>
      `• **${a.label}** from ${a.vendorName} → ${a.deliverTo} · ¥${a.price} · ETA ~${a.etaMinutes} min`
  );
  return `Delivery arranged:\n${lines.join("\n")}`;
}

export function deliveryAddonCost(addons: PlanDeliveryAddon[] | undefined): number {
  return addons?.reduce((sum, a) => sum + a.price, 0) ?? 0;
}
