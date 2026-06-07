import { Activity, ItineraryStep, Plan, Restaurant } from "../types";
import { deliveryAddonCost } from "./delivery_addons";

export interface PaidStopLine {
  kind: "activity" | "restaurant";
  name: string;
  perPerson: number;
  subtotal: number;
}

export function paidStopsFromItinerary(
  steps: ItineraryStep[] | undefined,
  groupSize: number
): PaidStopLine[] {
  const lines: PaidStopLine[] = [];
  if (!steps?.length) return lines;

  for (const step of steps) {
    if (step.kind === "restaurant" && step.restaurant) {
      const perPerson = step.restaurant.pricePerPerson;
      if (perPerson > 0) {
        lines.push({
          kind: "restaurant",
          name: step.restaurant.name,
          perPerson,
          subtotal: perPerson * groupSize,
        });
      }
    }
    if (step.kind === "activity" && step.activity) {
      const perPerson = step.activity.admissionPerPerson ?? 0;
      if (perPerson > 0) {
        lines.push({
          kind: "activity",
          name: step.activity.name,
          perPerson,
          subtotal: perPerson * groupSize,
        });
      }
    }
  }
  return lines;
}

export function paidStopsFromSimplePlan(
  plan: Plan,
  groupSize: number
): PaidStopLine[] {
  const lines: PaidStopLine[] = [];
  if (plan.restaurant) {
    lines.push({
      kind: "restaurant",
      name: plan.restaurant.name,
      perPerson: plan.restaurant.pricePerPerson,
      subtotal: plan.restaurant.pricePerPerson * groupSize,
    });
  }
  if (plan.activity && (plan.activity.admissionPerPerson ?? 0) > 0) {
    lines.push({
      kind: "activity",
      name: plan.activity.name,
      perPerson: plan.activity.admissionPerPerson,
      subtotal: plan.activity.admissionPerPerson * groupSize,
    });
  }
  return lines;
}

export function collectPaidStops(plan: Plan, groupSize: number): PaidStopLine[] {
  const fromItinerary = paidStopsFromItinerary(plan.itinerary, groupSize);
  if (fromItinerary.length) return fromItinerary;
  return paidStopsFromSimplePlan(plan, groupSize);
}

export function districtsInPlan(plan: Plan): string[] {
  const set = new Set<string>();
  plan.itinerary?.forEach((s) => {
    if (s.activity) set.add(s.activity.district);
    if (s.restaurant) set.add(s.restaurant.district);
  });
  if (plan.activity) set.add(plan.activity.district);
  if (plan.restaurant) set.add(plan.restaurant.district);
  return [...set];
}

export function enrichPlanCosts(plan: Plan, groupSize: number): Plan {
  const paidStops = collectPaidStops(plan, Math.max(1, groupSize));
  const mealTotal = paidStops.reduce((sum, s) => sum + s.subtotal, 0);
  const addonTotal = deliveryAddonCost(plan.deliveryAddons);
  const estimatedTotal = mealTotal + addonTotal;
  const districts = districtsInPlan(plan);
  const planDistrict = districts.length === 1 ? districts[0] : undefined;

  return {
    ...plan,
    planDistrict,
    paidStops,
    estimatedTotal,
    estimatedPerPerson:
      groupSize > 0 ? Math.round(estimatedTotal / Math.max(1, groupSize)) : estimatedTotal,
    splitBillEligible: paidStops.length >= 2,
  };
}

export function formatPlanCostSummary(plan: Plan, groupSize: number): string {
  if (!plan.paidStops?.length || !plan.estimatedTotal) return "";
  const lines = plan.paidStops.map(
    (s) =>
      `• ${s.kind === "restaurant" ? "🍽" : "🎯"} ${s.name}: ¥${s.perPerson}/pp × ${groupSize} = ¥${s.subtotal}`
  );
  const splitNote = plan.splitBillEligible
    ? `\n\n💰 Total ¥${plan.estimatedTotal} across ${plan.paidStops.length} paid stops — split ¥${plan.estimatedPerPerson}/person with your group.`
    : "";
  return `\n\nEstimated costs:\n${lines.join("\n")}${splitNote}`;
}
