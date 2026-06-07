import type { Activity, Plan, Restaurant } from "../types";

export interface PlanPhotoStop {
  id: string;
  kind: "activity" | "restaurant";
  name: string;
  src: string;
  emoji: string;
}

const MAX_VISIBLE = 4;

function addStop(
  stops: PlanPhotoStop[],
  seen: Set<string>,
  kind: "activity" | "restaurant",
  venue: Activity | Restaurant
) {
  if (seen.has(venue.id)) return;
  seen.add(venue.id);
  stops.push({
    id: venue.id,
    kind,
    name: venue.name,
    src: venue.imageUrl,
    emoji: kind === "activity" ? "🎯" : "🍽",
  });
}

/** All unique venue stops in plan order — for the multi-photo strip. */
export function collectPlanPhotoStops(plan: Plan): PlanPhotoStop[] {
  const stops: PlanPhotoStop[] = [];
  const seen = new Set<string>();

  if (plan.itinerary?.length) {
    for (const step of plan.itinerary) {
      if (step.kind === "travel") continue;
      if (step.activity) addStop(stops, seen, "activity", step.activity);
      if (step.restaurant) addStop(stops, seen, "restaurant", step.restaurant);
    }
  } else {
    if (plan.activity) addStop(stops, seen, "activity", plan.activity);
    if (plan.restaurant) addStop(stops, seen, "restaurant", plan.restaurant);
  }

  return stops;
}

export function visiblePlanPhotoStops(plan: Plan): {
  stops: PlanPhotoStop[];
  overflowCount: number;
} {
  const all = collectPlanPhotoStops(plan);
  if (all.length <= MAX_VISIBLE) {
    return { stops: all, overflowCount: 0 };
  }
  return {
    stops: all.slice(0, MAX_VISIBLE - 1),
    overflowCount: all.length - (MAX_VISIBLE - 1),
  };
}

/** @deprecated Use collectPlanPhotoStops — kept for any single-hero callers */
export function pickPlanHero(plan: Plan): { src: string; alt: string } {
  const first = collectPlanPhotoStops(plan)[0];
  if (first) return { src: first.src, alt: first.name };
  return { src: "", alt: "Plan" };
}
