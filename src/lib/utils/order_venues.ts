import { Activity, Plan, Restaurant } from "../types";
import { reservationLoadLabel } from "./reservation_load";

export type OrderVenueItem = {
  kind: "activity" | "restaurant";
  venue: Activity | Restaurant;
  timeStart?: string;
  timeEnd?: string;
  stepTitle?: string;
};

export function collectVenuesFromPlan(plan: Plan): OrderVenueItem[] {
  const seen = new Set<string>();
  const items: OrderVenueItem[] = [];

  const add = (
    kind: OrderVenueItem["kind"],
    venue: Activity | Restaurant | undefined,
    meta?: Pick<OrderVenueItem, "timeStart" | "timeEnd" | "stepTitle">
  ) => {
    if (!venue || seen.has(venue.id)) return;
    seen.add(venue.id);
    items.push({ kind, venue, ...meta });
  };

  if (plan.itinerary?.length) {
    for (const step of plan.itinerary) {
      if (step.kind === "activity" && step.activity) {
        add("activity", step.activity, {
          timeStart: step.timeStart,
          timeEnd: step.timeEnd,
          stepTitle: step.title,
        });
      }
      if (step.kind === "restaurant" && step.restaurant) {
        add("restaurant", step.restaurant, {
          timeStart: step.timeStart,
          timeEnd: step.timeEnd,
          stepTitle: step.title,
        });
      }
    }
  }

  add("activity", plan.activity);
  add("restaurant", plan.restaurant);

  return items;
}

export function venueMeta(
  kind: OrderVenueItem["kind"],
  venue: Activity | Restaurant
): { subtitle: string; meta: string; badges: string[] } {
  if (kind === "restaurant") {
    const r = venue as Restaurant;
    return {
      subtitle: `${r.cuisine} · ${r.district}`,
      meta: `${r.address} · ★ ${r.rating} · ¥${r.pricePerPerson}/pp · ${reservationLoadLabel(r.reservationLoad)}`,
      badges: [
        r.cultureTag,
        `${r.reservationLoad}% reserved`,
        ...(r.reservable ? ["Reservable"] : []),
        ...(r.familyFriendly ? ["Family-friendly"] : []),
        ...(r.quiet ? ["Quiet"] : []),
      ].filter(Boolean),
    };
  }

  const a = venue as Activity;
  return {
    subtitle: `${a.type.replace(/_/g, " ")} · ${a.district}`,
    meta: `${a.address} · ★ ${a.rating} · ${a.durationHours}h · ${
      a.admissionPerPerson > 0 ? `¥${a.admissionPerPerson}/pp` : "Free entry"
    }`,
    badges: [
      a.setting,
      ...(a.familyFriendly ? ["Family-friendly"] : []),
    ].filter(Boolean),
  };
}
