import { ParsedIntent, Plan } from "../types";
import { parse_conversation, haversineM } from "../tools/parse_intent";
import { fetch_friend_history } from "../tools/fetch_friend_history";
import { search_activities } from "../tools/search_activities";
import { search_restaurants } from "../tools/search_restaurants";
import { check_queue_status } from "../tools/check_queue_status";
import { rank_plans } from "../tools/rank_plans";
import { execute_one_stop, resolvePlanRestaurant } from "../tools/one_stop_agent";
import { formatShanghaiTime, inferTimeOfDayFromClock, TIME_LABELS } from "../utils/time";
import { syncReserveTimeFromUserText } from "../utils/reserve_time";
import { build_itinerary_plans } from "./build_itinerary_plans";
import { enrichPlanCosts } from "../utils/plan_cost";
import { finalizeOutingPlanIntent } from "../utils/plan_intent";
import { filterActivitiesByPreferences, activitiesMatchingPreferences } from "../utils/activity_preferences";
import { attachDeliveryAddonsToPlan } from "../utils/delivery_addons";
import { findActivityMentionedInText } from "../utils/activity_match";
import { ACTIVITIES } from "../data/activities";

export interface GeneratePlansResult {
  intent: ParsedIntent;
  plans: Plan[];
  currentTime: string;
  timeLabel: string;
  oneStop?: ReturnType<typeof execute_one_stop> & { pendingReservation?: boolean };
}

function attachOneStop(intent: ParsedIntent, topPlan?: Plan): GeneratePlansResult["oneStop"] {
  const os = intent.oneStop;
  const wantsReserve = Boolean(os?.reserve || intent.wantsReserve);
  const wantsTraffic = Boolean(os?.checkTraffic);
  const wantsReminder = Boolean(os?.remindMinutesBefore);
  if (!wantsReserve && !wantsTraffic && !wantsReminder) return undefined;

  const oneStopIntent: ParsedIntent = {
    ...intent,
    oneStop: {
      reserve: wantsReserve,
      partySize: os?.partySize ?? intent.groupSize,
      reserveTime: os?.reserveTime ?? intent.reserveTime,
      checkTraffic: wantsTraffic,
      remindMinutesBefore: os?.remindMinutesBefore,
    },
  };

  return {
    ...execute_one_stop(oneStopIntent, topPlan, { previewOnly: true }),
    pendingReservation: wantsReserve && Boolean(topPlan && resolvePlanRestaurant(topPlan)),
  };
}

function buildWhyPicked(
  intent: ParsedIntent,
  friendHistory: ReturnType<typeof fetch_friend_history>,
  activityName?: string,
  restaurantName?: string,
  cuisine?: string
): string {
  const parts: string[] = [];
  if (intent.scenario === "family") parts.push("good for family");
  if (intent.scenario === "friends") {
    const zw = friendHistory.find((f) => f.friendId === "zhangwei");
    if (zw && cuisine?.includes("Japanese")) parts.push("Zhang Wei loves Japanese");
  }
  if (restaurantName) parts.push(`great ${cuisine ?? "food"} match`);
  if (activityName) parts.push(`${activityName} fits ${TIME_LABELS[intent.timeOfDay]}`);
  return parts.length ? `Picked because ${parts.join(", ")}.` : "Best distance and group fit.";
}

function buildUniqueCombos(
  actPool: ReturnType<typeof search_activities>,
  restPool: ReturnType<typeof search_restaurants>,
  includeActivities: boolean,
  includeRestaurant: boolean,
  max: number
) {
  const combos: { activity?: (typeof actPool)[0]; restaurant?: (typeof restPool)[0]; key: string }[] = [];
  const seen = new Set<string>();

  const actList = includeActivities && actPool.length ? actPool : [undefined];
  const restList = includeRestaurant && restPool.length ? restPool : [undefined];

  for (const a of actList) {
    for (const r of restList) {
      if (!a && !r) continue;
      const key = `${a?.id ?? "-"}_${r?.id ?? "-"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push({ activity: a, restaurant: r, key });
      if (combos.length >= max) return combos;
    }
  }
  return combos;
}

function withDeliveryAddons(plans: Plan[], intent: ParsedIntent): Plan[] {
  if (!intent.deliveryAddonKinds?.length) return plans;
  return plans.map((p) => attachDeliveryAddonsToPlan(p, intent.deliveryAddonKinds!));
}

function prioritizeMentionedActivity(plans: Plan[], activityId?: string): Plan[] {
  if (!activityId) return plans;
  const matched = plans.filter(
    (p) => p.activity?.id === activityId || p.itinerary?.some((s) => s.activity?.id === activityId)
  );
  if (!matched.length) return plans;
  const rest = plans.filter((p) => !matched.includes(p));
  return [...matched, ...rest];
}

function searchActivityPool(
  intent: ParsedIntent,
  activitySearchOpts: {
    forFullDayPlan?: boolean;
    settings?: ParsedIntent["activitySettings"];
    types?: ParsedIntent["activityTypes"];
    settingStrict?: boolean;
  },
  maxDistanceM: number,
  timeOfDay = intent.timeOfDay
) {
  if (!intent.includeActivities) return [];

  let pool = search_activities(
    intent.location,
    intent.scenario,
    timeOfDay,
    maxDistanceM,
    intent.targetDistrict,
    activitySearchOpts
  );
  if (pool.length) {
    pool = filterActivitiesByPreferences(pool, intent);
  }
  return pool;
}

function resolveActivityPool(
  intent: ParsedIntent,
  activitySearchOpts: Parameters<typeof searchActivityPool>[1],
  strictDistrict: boolean
) {
  const distances = [intent.distanceMaxM, 15000, 25000];
  let pool: ReturnType<typeof search_activities> = [];

  for (const dist of distances) {
    pool = searchActivityPool(intent, activitySearchOpts, dist);
    if (pool.length || strictDistrict) break;
  }

  return pool;
}

export function generate_plans(
  naturalLanguageInput: string,
  now = new Date(),
  userMessages?: string[],
  providedIntent?: ParsedIntent
): GeneratePlansResult {
  let intent =
    providedIntent ??
    (userMessages?.length
      ? parse_conversation(userMessages, now)
      : parse_conversation([naturalLanguageInput], now));

  if (userMessages?.length) {
    finalizeOutingPlanIntent(userMessages, intent, now);
    const combined = userMessages.join("\n");
    syncReserveTimeFromUserText(intent, combined);
    intent.timeOfDay = inferTimeOfDayFromClock(now, combined);
  } else {
    finalizeOutingPlanIntent([naturalLanguageInput], intent, now);
    syncReserveTimeFromUserText(intent, naturalLanguageInput);
    intent.timeOfDay = inferTimeOfDayFromClock(now, naturalLanguageInput);
  }

  const friendHistory =
    intent.scenario === "friends" ? fetch_friend_history(intent.friendIds) : fetch_friend_history([]);

  const searchParams = {
    location: intent.location,
    district: intent.targetDistrict,
    cuisines: intent.cuisines,
    dietScoreMin: intent.dietFriendly ? 0.75 : 0,
    budgetMin: intent.budgetMin,
    budgetMax: intent.budgetMax,
    priceTier: intent.priceTier,
    ratingMin: intent.ratingMin,
    distanceMaxM: intent.distanceMaxM,
    timeOfDay: intent.timeOfDay,
    familyFriendly: intent.familyFriendly,
    quiet: intent.quietAmbiance,
    prepTimeMaxMin: intent.prepTimeMaxMin,
  };

  const fullDayPlan = Boolean(intent.wantsFullItinerary && (intent.durationHours ?? 0) >= 6);

  const activitySearchOpts = {
    forFullDayPlan: fullDayPlan || intent.wantsFullItinerary,
    settings: intent.activitySettings,
    types: intent.activityTypes,
    settingStrict: intent.activitySettingStrict,
  };

  const strictDistrict = Boolean(intent.wantsFullItinerary && intent.targetDistrict);
  let actPool = resolveActivityPool(intent, activitySearchOpts, strictDistrict);

  const conversationText = userMessages?.join("\n") ?? naturalLanguageInput;
  const mentionCandidates = activitiesMatchingPreferences(ACTIVITIES, intent);
  const activityMention = findActivityMentionedInText(
    conversationText,
    mentionCandidates.length ? mentionCandidates : actPool
  );
  if (activityMention) {
    actPool = [activityMention, ...actPool.filter((a) => a.id !== activityMention.id)];
  }

  const restaurants = intent.includeRestaurant ? search_restaurants(searchParams) : [];

  let restPool =
    restaurants.length > 0
      ? restaurants
      : intent.includeRestaurant && !strictDistrict
        ? search_restaurants({ ...searchParams, cuisines: [], distanceMaxM: 15000, ratingMin: 3.5 })
        : restaurants;

  if (intent.wantsFullItinerary) {
    if (actPool.length === 0 && intent.includeActivities) {
      actPool = resolveActivityPool(intent, activitySearchOpts, strictDistrict);
    }
    if (restPool.length === 0 && intent.includeRestaurant) {
      restPool = search_restaurants({
        ...searchParams,
        cuisines: [],
        dietScoreMin: 0,
        familyFriendly: false,
        quiet: false,
        ratingMin: 3.5,
        distanceMaxM: 20000,
      });
    }

    let itineraryPlans = withDeliveryAddons(
      build_itinerary_plans(intent, actPool, restPool, friendHistory, now),
      intent
    );
    itineraryPlans = prioritizeMentionedActivity(itineraryPlans, activityMention?.id);
    const oneStop = attachOneStop(intent, itineraryPlans[0]);
    return {
      intent,
      plans: itineraryPlans,
      currentTime: formatShanghaiTime(now),
      timeLabel: TIME_LABELS[intent.timeOfDay],
      oneStop,
    };
  }

  const maxCombos = Math.min(3, Math.max(restPool.length, actPool.length, 1));
  const combos = buildUniqueCombos(
    actPool,
    restPool,
    intent.includeActivities,
    intent.includeRestaurant,
    maxCombos
  );

  let plans: Plan[] = combos
    .map((c, idx) => {
      const restaurant = intent.includeRestaurant ? c.restaurant : undefined;
      const activity = intent.includeActivities ? c.activity : undefined;
      if (
        intent.targetDistrict &&
        ((restaurant && restaurant.district !== intent.targetDistrict) ||
          (activity && activity.district !== intent.targetDistrict))
      ) {
        return null;
      }
      const queue = restaurant ? check_queue_status(restaurant.id) : undefined;
      const distM = restaurant
        ? haversineM(intent.location.lat, intent.location.lng, restaurant.lat, restaurant.lng)
        : activity
          ? haversineM(intent.location.lat, intent.location.lng, activity.lat, activity.lng)
          : 0;
      const district = restaurant?.district ?? activity?.district;
      return enrichPlanCosts(
        {
          id: `plan-${idx + 1}`,
          activity,
          restaurant,
          queue,
          matchScore: 0,
          distanceScore: Math.max(0, 100 - (distM / Math.max(intent.distanceMaxM, 1)) * 100),
          preferenceMatch: 0,
          cultureTag: restaurant?.cultureTag ?? activity?.type ?? "—",
          dietFriendly: (restaurant?.dietScore ?? 0) >= 0.8,
          whyPicked: buildWhyPicked(intent, friendHistory, activity?.name, restaurant?.name, restaurant?.cuisine),
          planDistrict: district,
        },
        intent.groupSize
      );
    })
    .filter((p): p is Plan => p != null);

  plans = rank_plans(plans, intent, friendHistory);
  plans = withDeliveryAddons(plans, intent);
  plans = prioritizeMentionedActivity(plans, activityMention?.id);

  const oneStop = attachOneStop(intent, plans[0]);

  return {
    intent,
    plans,
    currentTime: formatShanghaiTime(now),
    timeLabel: TIME_LABELS[intent.timeOfDay],
    oneStop,
  };
}
