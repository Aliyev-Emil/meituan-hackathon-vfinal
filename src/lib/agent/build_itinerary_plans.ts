import { Activity, ItineraryStep, ItineraryStopKind, ParsedIntent, Plan, Restaurant } from "../types";
import { check_queue_status } from "../tools/check_queue_status";
import { rank_plans } from "../tools/rank_plans";
import { FriendHistory } from "../tools/fetch_friend_history";
import { haversineM } from "../tools/parse_intent";
import {
  activityBlockMinutes,
  patternLabel,
  resolveItineraryStops,
  restaurantBlockMinutes,
} from "../utils/itinerary_patterns";
import {
  estimateTravelMinutes,
  formatMinutesAsTime,
  startMinuteOfDay,
} from "../utils/itinerary";
import { enrichPlanCosts, formatPlanCostSummary } from "../utils/plan_cost";
import { TIME_LABELS } from "../utils/time";

type Stop = { kind: ItineraryStopKind; venue: Activity | Restaurant };

function buildStopsFromPools(
  pattern: ItineraryStopKind[],
  intent: ParsedIntent,
  actPool: Activity[],
  restPool: Restaurant[],
  actOffset: number,
  restOffset: number
): Stop[] {
  const stops: Stop[] = [];
  let ai = actOffset;
  let ri = restOffset;

  for (const kind of pattern) {
    if (kind === "activity" && intent.includeActivities && actPool.length) {
      const venue = actPool[ai % actPool.length];
      ai++;
      if (venue) stops.push({ kind: "activity", venue });
    } else if (kind === "restaurant" && intent.includeRestaurant && restPool.length) {
      const venue = restPool[ri % restPool.length];
      ri++;
      if (venue) stops.push({ kind: "restaurant", venue });
    }
  }

  return stops;
}

function stepsToTimeline(
  intent: ParsedIntent,
  stops: Stop[],
  now: Date
): ItineraryStep[] {
  const steps: ItineraryStep[] = [];
  const durationHours = intent.durationHours ?? 4;
  const mealMins = restaurantBlockMinutes(stops.length, durationHours);
  let cursor = startMinuteOfDay(intent.timeOfDay, now);
  let prevLat = intent.location.lat;
  let prevLng = intent.location.lng;

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const v = stop.venue;

    if (i > 0) {
      const travelMin = estimateTravelMinutes(prevLat, prevLng, v.lat, v.lng);
      const travelStart = cursor;
      cursor += travelMin;
      steps.push({
        order: steps.length + 1,
        kind: "travel",
        timeStart: formatMinutesAsTime(travelStart),
        timeEnd: formatMinutesAsTime(cursor),
        title: "Travel between stops",
        subtitle: `~${travelMin} min · ${travelMin >= 25 ? "metro or taxi" : "short ride"}`,
        travelMinutes: travelMin,
      });
    }

    const durationMin =
      stop.kind === "activity"
        ? activityBlockMinutes((v as Activity).durationHours, stops.length, durationHours)
        : mealMins;
    const start = cursor;
    cursor += durationMin;

    if (stop.kind === "activity") {
      const a = v as Activity;
      const hours = (durationMin / 60).toFixed(1);
      steps.push({
        order: steps.length + 1,
        kind: "activity",
        timeStart: formatMinutesAsTime(start),
        timeEnd: formatMinutesAsTime(cursor),
        title: a.name,
        subtitle: `${a.district} · ~${hours}h · ${a.type.replace(/_/g, " ")}`,
        activity: a,
      });
    } else {
      const r = v as Restaurant;
      const mealTag =
        stops.filter((s) => s.kind === "restaurant").length > 1 && i > 0
          ? stops.slice(0, i).some((s) => s.kind === "restaurant")
            ? " · later meal"
            : " · first meal"
          : "";
      steps.push({
        order: steps.length + 1,
        kind: "restaurant",
        timeStart: formatMinutesAsTime(start),
        timeEnd: formatMinutesAsTime(cursor),
        title: r.name,
        subtitle: `${r.cuisine} · ¥${r.pricePerPerson}/pp · ${r.district}${mealTag}`,
        restaurant: r,
      });
    }

    prevLat = v.lat;
    prevLng = v.lng;
  }

  return steps;
}

function buildSummary(
  intent: ParsedIntent,
  steps: ItineraryStep[],
  durationHours: number,
  sequenceLabel: string
): string {
  const place = intent.targetDistrict ?? intent.location.label.split(",")[0] ?? "Shenzhen";
  const timeLabel = TIME_LABELS[intent.timeOfDay];
  const stopLines = steps
    .filter((s) => s.kind !== "travel")
    .map((s) => {
      const range = s.timeEnd ? `${s.timeStart}–${s.timeEnd}` : s.timeStart;
      const icon = s.kind === "activity" ? "🎯" : "🍽";
      return `${range}: ${icon} ${s.title}`;
    });

  const party = intent.groupSize > 1 ? ` Party of ${intent.groupSize}.` : "";
  const multiStop =
    steps.filter((s) => s.kind !== "travel").length > 2
      ? `\nSequence: ${sequenceLabel}.`
      : "";

  const districtNote = intent.targetDistrict
    ? `\nAll stops in **${intent.targetDistrict}**.`
    : "";
  return `Your ${durationHours}-hour ${timeLabel.toLowerCase()} plan in ${place}:${party}${districtNote}${multiStop}\n\n${stopLines.join("\n")}\n\nSwipe right to book restaurants · swipe left for another plan.`;
}

function stopsShareOneDistrict(stops: Stop[], requiredDistrict?: string): boolean {
  if (stops.length === 0) return false;
  const district = stops[0].venue.district;
  if (!stops.every((s) => s.venue.district === district)) return false;
  if (requiredDistrict && district !== requiredDistrict) return false;
  return true;
}

function planFromSteps(
  intent: ParsedIntent,
  steps: ItineraryStep[],
  durationHours: number,
  sequenceLabel: string,
  planIndex: number
): Plan | null {
  if (steps.length === 0) return null;

  const venueSteps = steps.filter((s) => s.kind !== "travel");
  const firstActivity = venueSteps.find((s) => s.activity)?.activity;
  const restaurants = venueSteps.filter((s) => s.restaurant).map((s) => s.restaurant!);
  const primaryRestaurant = restaurants[0];
  const queue = primaryRestaurant ? check_queue_status(primaryRestaurant.id) : undefined;

  const anchor = primaryRestaurant ?? firstActivity;
  const distM = anchor
    ? haversineM(intent.location.lat, intent.location.lng, anchor.lat, anchor.lng)
    : 0;

  const districtSet = new Set(
    venueSteps.map((s) => s.activity?.district ?? s.restaurant?.district).filter(Boolean) as string[]
  );
  const district = districtSet.size === 1 ? [...districtSet][0] : undefined;
  const districtLabel = district ? ` All venues in ${district}.` : "";

  let plan: Plan = {
    id: `itinerary-${planIndex}`,
    activity: firstActivity,
    restaurant: primaryRestaurant,
    queue,
    matchScore: 0,
    distanceScore: Math.max(0, 100 - (distM / Math.max(intent.distanceMaxM, 1)) * 100),
    preferenceMatch: 0,
    cultureTag: primaryRestaurant?.cultureTag ?? firstActivity?.type ?? "—",
    dietFriendly: restaurants.some((r) => r.dietScore >= 0.8) || (primaryRestaurant?.dietScore ?? 0) >= 0.8,
    whyPicked: `Built as ${sequenceLabel} across ${venueSteps.length} stops for your ${TIME_LABELS[intent.timeOfDay].toLowerCase()} window.${districtLabel}`,
    itinerary: steps,
    summary: buildSummary(intent, steps, durationHours, sequenceLabel),
    durationHours,
    planDistrict: district,
  };

  plan = enrichPlanCosts(plan, intent.groupSize);
  if (plan.summary && plan.estimatedTotal) {
    plan = {
      ...plan,
      summary: plan.summary + formatPlanCostSummary(plan, intent.groupSize),
    };
  }
  return plan;
}

export function build_itinerary_plans(
  intent: ParsedIntent,
  actPool: Activity[],
  restPool: Restaurant[],
  friendHistory: FriendHistory[],
  now = new Date()
): Plan[] {
  const durationHours = intent.durationHours ?? 4;
  const pattern = resolveItineraryStops(intent, intent.raw);
  const sequenceLabel = patternLabel(pattern);
  const maxAlternatives = 6;
  const plans: Plan[] = [];
  const seen = new Set<string>();

  if (pattern.length === 0) return [];

  const district = intent.targetDistrict;
  const actFiltered = district ? actPool.filter((a) => a.district === district) : actPool;
  const restFiltered = district ? restPool.filter((r) => r.district === district) : restPool;

  const needsActivity = pattern.includes("activity");
  const needsRestaurant = pattern.includes("restaurant");
  if (needsActivity && actFiltered.length === 0) return [];
  if (needsRestaurant && restFiltered.length === 0) return [];

  const actCount = pattern.filter((k) => k === "activity").length;
  const restCount = pattern.filter((k) => k === "restaurant").length;

  for (let offset = 0; offset < Math.max(actFiltered.length, restFiltered.length, 1) && plans.length < maxAlternatives; offset++) {
    const rawStops = buildStopsFromPools(pattern, intent, actFiltered, restFiltered, offset, offset);
    if (rawStops.length === 0 || rawStops.length < pattern.length) continue;
    if (!stopsShareOneDistrict(rawStops, district)) continue;

    const key = rawStops.map((s) => `${s.kind}:${s.venue.id}`).join("|");
    if (seen.has(key)) continue;
    seen.add(key);

    const steps = stepsToTimeline(intent, rawStops, now);
    const plan = planFromSteps(intent, steps, durationHours, sequenceLabel, plans.length + 1);
    if (plan) plans.push(plan);

    if (actCount >= 2 && restCount >= 1 && plans.length < maxAlternatives) {
      const altStops = buildStopsFromPools(
        pattern,
        intent,
        actFiltered,
        restFiltered,
        offset + 1,
        offset
      );
      const altKey = altStops.map((s) => `${s.kind}:${s.venue.id}`).join("|");
      if (!seen.has(altKey) && altStops.length > 0 && stopsShareOneDistrict(altStops, district)) {
        seen.add(altKey);
        const altSteps = stepsToTimeline(intent, altStops, now);
        const altPlan = planFromSteps(intent, altSteps, durationHours, sequenceLabel, plans.length + 1);
        if (altPlan) plans.push(altPlan);
      }
    }
  }

  return rank_plans(plans, intent, friendHistory);
}
