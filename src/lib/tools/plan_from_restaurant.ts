import { GeneratePlansResult } from "../agent/generate_plans";
import { RESTAURANTS } from "../data/restaurants";
import { USERS, CURRENT_USER_ID } from "../data/users";
import { check_queue_status } from "./check_queue_status";
import { haversineM } from "./parse_intent";
import { rank_plans } from "./rank_plans";
import { enrichPlanCosts } from "../utils/plan_cost";
import { formatShanghaiTime, inferTimeOfDayFromClock, TIME_LABELS } from "../utils/time";
import { ParsedIntent } from "../types";

function baseIntent(now = new Date()): ParsedIntent {
  const user = USERS[CURRENT_USER_ID];
  const timeOfDay = inferTimeOfDayFromClock(now);
  return {
    raw: "",
    keywords: ["nearby-pick"],
    scenario: "solo",
    groupSize: 1,
    includeActivities: false,
    includeRestaurant: true,
    cuisines: [],
    budgetMin: 50,
    budgetMax: 280,
    ratingMin: 3.8,
    distanceMaxM: 10000,
    dietFriendly: false,
    quietAmbiance: false,
    familyFriendly: false,
    timeOfDay,
    location: { lat: user.lat, lng: user.lng, label: user.locationLabel },
    friendIds: user.friendIds,
    wantsReserve: false,
    wantsOrder: false,
    wantsPlansExplicit: true,
    wantsFullItinerary: false,
    interactionMode: "show_plans",
  };
}

/** Build ranked single-restaurant plans from catalog ids (first id = user’s pick). */
export function plansFromRestaurantIds(
  restaurantIds: string[],
  now = new Date()
): GeneratePlansResult | null {
  const unique = [...new Set(restaurantIds)];
  const restaurants = unique
    .map((id) => RESTAURANTS.find((r) => r.id === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  if (!restaurants.length) return null;

  const intent = baseIntent(now);
  const user = USERS[CURRENT_USER_ID];

  let plans = restaurants.map((r, idx) => {
    const distM = haversineM(user.lat, user.lng, r.lat, r.lng);
    const queue = check_queue_status(r.id);
    return enrichPlanCosts(
      {
        id: `nearby-${r.id}-${idx}`,
        restaurant: r,
        queue,
        matchScore: 0,
        distanceScore: Math.max(0, 100 - (distM / intent.distanceMaxM) * 100),
        preferenceMatch: 0,
        cultureTag: r.cultureTag,
        dietFriendly: r.dietScore >= 0.8,
        whyPicked: `${r.cuisine} · ${r.district} · ${Math.round(distM)}m away`,
        planDistrict: r.district,
      },
      intent.groupSize
    );
  });

  plans = rank_plans(plans, intent, []);

  // Keep user’s first pick on top when scores are close
  const pickedId = unique[0];
  plans.sort((a, b) => {
    if (a.restaurant?.id === pickedId) return -1;
    if (b.restaurant?.id === pickedId) return 1;
    return b.matchScore - a.matchScore;
  });

  return {
    intent,
    plans,
    currentTime: formatShanghaiTime(now),
    timeLabel: TIME_LABELS[intent.timeOfDay],
  };
}
