import { ACTIVITIES, isWeatherSensitive } from "../data/activities";
import { RESTAURANTS } from "../data/restaurants";
import { Activity, ItineraryStep, Plan, Restaurant } from "../types";
import { check_queue_status } from "./check_queue_status";
import { haversineM } from "./parse_intent";
import { findActivityMentionedInText } from "../utils/activity_match";
import { isNewOutingPlanRequest } from "../utils/itinerary";

export type ContingencyKind =
  | "weather_activity"
  | "restaurant_issue"
  | "swap_restaurant"
  | "swap_activity";

export interface ContingencyResult {
  kind: ContingencyKind;
  plan: Plan;
  message: string;
  swappedActivity?: Activity;
  swappedRestaurant?: Restaurant;
  previousActivity?: Activity;
  previousRestaurant?: Restaurant;
}

function wantsRestaurantSwap(text: string): boolean {
  const lower = text.toLowerCase();
  if (
    /change|swap|switch|replace|alternat|another|different|换个|换一家|更换|改/i.test(lower) &&
    /restaurant|餐厅|饭店|餐馆|dining|店/i.test(lower)
  ) {
    return true;
  }
  if (/similar\s+cuisine|same\s+cuisine|类似.*菜|同菜系|相近.*口味|相近.*菜/i.test(lower)) {
    return true;
  }
  return false;
}

function wantsActivitySwap(text: string): boolean {
  const lower = text.toLowerCase();
  if (/into\s+(an?\s+)?(inside|indoor)|改成.*室内|换成.*室内|change.*into\s+(an?\s+)?inside/i.test(lower)) {
    return false;
  }
  if (/rain|rainy|下雨/i.test(lower) && /indoor|inside|室内/i.test(lower)) {
    return false;
  }
  return (
    /change|swap|switch|replace|alternat|another|different|换个|换一家|更换|改/i.test(lower) &&
    /activit|活动|attraction|逛|展览|公园|museum|boardwalk|walk|步道|栈道/i.test(lower)
  );
}

function wantsWeatherOrIndoorActivitySwap(text: string): boolean {
  const lower = text.toLowerCase();
  const hasRain = /rain|rainy|raining|downpour|storm|wet\s+weather|下雨|暴雨|大雨|下雨了|天气.*(差|不好)|too\s+wet|gonna\s+be\s+rain/i.test(
    lower
  );
  const wantsIndoor =
    /indoor|inside|室内|rain-proof|避雨/i.test(lower) &&
    /change|swap|switch|replace|改|换|into/i.test(lower);
  const namesStop = /boardwalk|mangrove|红树林|栈道|walk|park|trail|步道|公园/i.test(lower);
  return hasRain || wantsIndoor || (namesStop && /change|swap|改|换/i.test(lower));
}

export function detectContingency(text: string): ContingencyKind | null {
  const lower = text.toLowerCase();

  if (isNewOutingPlanRequest(text)) return null;

  if (wantsRestaurantSwap(text)) return "swap_restaurant";

  if (wantsWeatherOrIndoorActivitySwap(text)) {
    return "weather_activity";
  }

  if (wantsActivitySwap(text)) return "swap_activity";

  if (
    /rain|rainy|raining|downpour|storm|wet\s+weather|下雨|暴雨|大雨|下雨了|天气.*(差|不好)|too\s+wet/i.test(
      lower
    )
  ) {
    return "weather_activity";
  }

  if (
    /crowd|crowded|packed|too\s+full|(?:is|are|'s)\s+full|满了|wait\s*(is\s*)?too\s*long|long\s*line|queue|排队|太多人|挤|没位子|no\s+seats|can't\s+get\s+a\s+table/i.test(
      lower
    )
  ) {
    return "restaurant_issue";
  }

  if (
    /sold\s*out|not\s+available|unavailable|out\s+of\s+stock|signature\s+dish|招牌|没有.*菜|卖光|没货|缺货|main\s+dish/i.test(
      lower
    )
  ) {
    return "restaurant_issue";
  }

  return null;
}

function activitiesInPlan(plan: Plan): Activity[] {
  const seen = new Set<string>();
  const list: Activity[] = [];
  const add = (a?: Activity) => {
    if (a && !seen.has(a.id)) {
      seen.add(a.id);
      list.push(a);
    }
  };
  add(plan.activity);
  plan.itinerary?.forEach((s) => add(s.activity));
  return list;
}

function restaurantsInPlan(plan: Plan): Restaurant[] {
  const seen = new Set<string>();
  const list: Restaurant[] = [];
  const add = (r?: Restaurant) => {
    if (r && !seen.has(r.id)) {
      seen.add(r.id);
      list.push(r);
    }
  };
  add(plan.restaurant);
  plan.itinerary?.forEach((s) => add(s.restaurant));
  return list;
}

export function findIndoorReplacement(
  current: Activity,
  excludeIds: string[],
  familyFriendly?: boolean
): Activity | null {
  const pool = ACTIVITIES.filter(
    (a) =>
      a.id !== current.id &&
      !excludeIds.includes(a.id) &&
      a.setting === "indoor" &&
      a.district === current.district &&
      (!familyFriendly || a.familyFriendly)
  ).sort((a, b) => b.rating - a.rating);

  if (pool.length) return pool[0];

  const fallback = ACTIVITIES.filter(
    (a) =>
      a.id !== current.id &&
      !excludeIds.includes(a.id) &&
      a.setting === "indoor" &&
      (!familyFriendly || a.familyFriendly)
  ).sort((a, b) => b.rating - a.rating);

  return fallback[0] ?? null;
}

export function findActivityAlternative(
  current: Activity,
  excludeIds: string[],
  maxDistanceM = 5000
): Activity | null {
  const pool = ACTIVITIES.filter(
    (a) =>
      a.id !== current.id &&
      !excludeIds.includes(a.id) &&
      haversineM(current.lat, current.lng, a.lat, a.lng) <= maxDistanceM &&
      (a.type === current.type || a.district === current.district || a.setting === current.setting)
  )
    .map((a) => ({
      a,
      score:
        a.rating * 10 -
        haversineM(current.lat, current.lng, a.lat, a.lng) / 250 +
        (a.type === current.type ? 8 : 0) +
        (a.district === current.district ? 5 : 0),
    }))
    .sort((x, y) => y.score - x.score);

  return pool[0]?.a ?? null;
}

export function findSameCuisineAlternative(
  current: Restaurant,
  excludeIds: string[],
  maxDistanceM = 5000
): Restaurant | null {
  const cuisineKey = current.cuisine.toLowerCase();
  const cultureKey = current.cultureTag;

  const candidates = RESTAURANTS.filter((r) => {
    if (r.id === current.id || excludeIds.includes(r.id)) return false;
    const sameCuisine = r.cuisine.toLowerCase() === cuisineKey;
    const sameCulture = Boolean(cultureKey && r.cultureTag === cultureKey);
    if (!sameCuisine && !sameCulture) return false;
    return haversineM(current.lat, current.lng, r.lat, r.lng) <= maxDistanceM;
  }).map((r) => {
    const queue = check_queue_status(r.id);
    const dist = haversineM(current.lat, current.lng, r.lat, r.lng);
    const crowdPenalty = queue.waitMinutes >= 30 ? 20 : queue.waitMinutes >= 15 ? 8 : 0;
    return { r, score: r.rating * 10 - dist / 200 - crowdPenalty };
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.r ?? null;
}

function patchActivityInSteps(
  steps: ItineraryStep[] | undefined,
  fromId: string,
  replacement: Activity
): ItineraryStep[] | undefined {
  if (!steps?.length) return steps;
  return steps.map((step) => {
    if (step.kind !== "activity" || step.activity?.id !== fromId) return step;
    return {
      ...step,
      title: replacement.name,
      subtitle: `${replacement.district} · backup · ${replacement.type.replace(/_/g, " ")}`,
      activity: replacement,
    };
  });
}

function patchRestaurantInSteps(
  steps: ItineraryStep[] | undefined,
  fromId: string,
  replacement: Restaurant
): ItineraryStep[] | undefined {
  if (!steps?.length) return steps;
  return steps.map((step) => {
    if (step.kind !== "restaurant" || step.restaurant?.id !== fromId) return step;
    const queue = check_queue_status(replacement.id);
    return {
      ...step,
      title: replacement.name,
      subtitle: `${replacement.cuisine} · ¥${replacement.pricePerPerson}/pp · backup · ${queue.badge}`,
      restaurant: replacement,
    };
  });
}

function appendBackupNote(summary: string | undefined, note: string): string {
  const base = summary ?? "";
  if (base.includes("Backup update")) return `${base}\n\n${note}`;
  return base ? `${base}\n\n🔄 Backup update: ${note}` : `🔄 Backup update: ${note}`;
}

function resolveRestaurantTarget(plan: Plan | undefined, restaurantId?: string): Restaurant | null {
  if (restaurantId) {
    const fromCatalog = RESTAURANTS.find((r) => r.id === restaurantId);
    if (fromCatalog) return fromCatalog;
  }
  if (!plan) return null;
  const inPlan = restaurantsInPlan(plan);
  if (restaurantId) return inPlan.find((r) => r.id === restaurantId) ?? inPlan[0] ?? null;
  return inPlan[0] ?? null;
}

function resolveActivityTarget(plan: Plan, text?: string): Activity | null {
  const inPlan = activitiesInPlan(plan);
  if (!inPlan.length) return null;

  if (text) {
    const named = findActivityMentionedInText(text, inPlan);
    if (named) return named;
  }

  const outdoor = inPlan.filter(isWeatherSensitive);
  if (text && /rain|下雨|indoor|inside|室内/i.test(text.toLowerCase())) {
    return outdoor[0] ?? inPlan[0];
  }

  return inPlan[0];
}

export function swapOutdoorActivityForRain(plan: Plan, text?: string): ContingencyResult | null {
  const target = resolveActivityTarget(plan, text);
  if (!target) return null;

  const exclude = activitiesInPlan(plan).map((a) => a.id);
  const wantsIndoor = !text || /indoor|inside|室内|rain|下雨/i.test(text.toLowerCase());
  const replacement = wantsIndoor
    ? findIndoorReplacement(target, exclude, plan.activity?.familyFriendly)
    : findActivityAlternative(target, exclude);
  if (!replacement) return null;

  const itinerary = patchActivityInSteps(plan.itinerary, target.id, replacement);
  const updated: Plan = {
    ...plan,
    activity: plan.activity?.id === target.id ? replacement : plan.activity,
    itinerary,
    whyPicked: `${plan.whyPicked} Rain backup: ${replacement.name} replaces ${target.name}.`,
    summary: appendBackupNote(
      plan.summary,
      `It's raining — swapped outdoor **${target.name}** for indoor **${replacement.name}** (${replacement.district}, same area).`
    ),
  };

  return {
    kind: "weather_activity",
    plan: updated,
    previousActivity: target,
    swappedActivity: replacement,
    message: `Rain noted — I updated your plan: **${target.name}** → **${replacement.name}** (indoor, ${replacement.district}). Your restaurant stops stay the same. Check the updated timeline below.`,
  };
}

export function swapActivityByRequest(plan: Plan, text?: string): ContingencyResult | null {
  const activities = activitiesInPlan(plan);
  if (!activities.length) return null;

  const target = resolveActivityTarget(plan, text);
  if (!target) return null;
  const exclude = activities.map((a) => a.id);
  const replacement =
    findActivityAlternative(target, exclude) ??
    findIndoorReplacement(target, exclude, plan.activity?.familyFriendly);
  if (!replacement) return null;

  const itinerary = patchActivityInSteps(plan.itinerary, target.id, replacement);
  const updated: Plan = {
    ...plan,
    activity: plan.activity?.id === target.id ? replacement : plan.activity,
    itinerary,
    whyPicked: `${plan.whyPicked} Activity backup: ${replacement.name} replaces ${target.name}.`,
    summary: appendBackupNote(
      plan.summary,
      `**${target.name}** → **${replacement.name}** (${replacement.district}, ${replacement.type.replace(/_/g, " ")}).`
    ),
  };

  return {
    kind: "swap_activity",
    plan: updated,
    previousActivity: target,
    swappedActivity: replacement,
    message: `Updated your plan: **${target.name}** → **${replacement.name}** (${replacement.district}). Check the itinerary below.`,
  };
}

export function swapRestaurantForIssue(
  plan: Plan | undefined,
  restaurantId?: string
): ContingencyResult | null {
  const target = resolveRestaurantTarget(plan, restaurantId);
  if (!target) return null;

  const exclude = plan ? restaurantsInPlan(plan).map((r) => r.id) : [target.id];
  if (!exclude.includes(target.id)) exclude.push(target.id);

  const replacement = findSameCuisineAlternative(target, exclude);
  if (!replacement) {
    return {
      kind: "swap_restaurant",
      plan:
        plan ?? {
          id: "contingency",
          matchScore: 0,
          distanceScore: 0,
          preferenceMatch: 0,
          cultureTag: target.cultureTag,
          dietFriendly: false,
          whyPicked: "",
          restaurant: target,
        },
      message: `I couldn't find another nearby ${target.cuisine} restaurant right now. Try a different cuisine or widen the area.`,
    };
  }

  const queue = check_queue_status(replacement.id);
  const distM = Math.round(haversineM(target.lat, target.lng, replacement.lat, replacement.lng));

  if (!plan) {
    return {
      kind: "swap_restaurant",
      plan: {
        id: "contingency",
        restaurant: replacement,
        queue,
        matchScore: 85,
        distanceScore: 80,
        preferenceMatch: 80,
        cultureTag: replacement.cultureTag,
        dietFriendly: replacement.dietScore >= 0.8,
        whyPicked: `Backup restaurant: ${replacement.name}`,
        summary: `**${target.name}** → **${replacement.name}** (${replacement.cuisine}, ~${distM}m away).`,
      },
      previousRestaurant: target,
      swappedRestaurant: replacement,
      message: `Done — switched to **${replacement.name}** (${replacement.cuisine}, ${replacement.district}, ${queue.badge}, ~${distM}m from the original).`,
    };
  }

  const itinerary = patchRestaurantInSteps(plan.itinerary, target.id, replacement);
  const updated: Plan = {
    ...plan,
    restaurant: plan.restaurant?.id === target.id ? replacement : plan.restaurant,
    queue: plan.restaurant?.id === target.id ? queue : plan.queue,
    itinerary,
    whyPicked: `${plan.whyPicked} Restaurant backup: ${replacement.name} (${replacement.cuisine}).`,
    summary: appendBackupNote(
      plan.summary,
      `**${target.name}** → **${replacement.name}** (${replacement.cuisine}, ~${distM}m away, ${queue.badge}).`
    ),
  };

  return {
    kind: "swap_restaurant",
    plan: updated,
    previousRestaurant: target,
    swappedRestaurant: replacement,
    message: `Got it — **${target.name}** isn't working out. Backup: **${replacement.name}** (${replacement.cuisine}, ${replacement.district}, ${queue.badge}, ~${distM}m away). Your plan is updated below.`,
  };
}

export function applyPlanContingency(
  text: string,
  plan: Plan | undefined,
  options?: { orderRestaurantId?: string }
): ContingencyResult | null {
  const kind = detectContingency(text);
  if (!kind) return null;

  if (kind === "swap_restaurant" || kind === "restaurant_issue") {
    return swapRestaurantForIssue(plan, options?.orderRestaurantId);
  }

  if (kind === "swap_activity") {
    if (!plan) return null;
    return swapActivityByRequest(plan, text);
  }

  if (kind === "weather_activity") {
    if (!plan) return null;
    return swapOutdoorActivityForRain(plan, text);
  }

  return null;
}
