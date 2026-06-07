import { ParsedIntent } from "../types";
import { USERS, CURRENT_USER_ID } from "../data/users";
import { extractDistrict, resolveLocation } from "../data/districts";
import { extractCuisines } from "../tools/parse_intent";
import {
  enrichOutingIntent,
  wantsFullItineraryPlan,
  isNewOutingPlanRequest,
} from "./itinerary";

function userMentionedCuisine(text: string): boolean {
  const lower = text.toLowerCase();
  if (extractCuisines(text).length > 0) return true;
  return /cuisine|菜系|吃什么菜|what\s+(kind\s+of\s+)?food|火锅|日料|寿司|hotpot|malaysian|turkish|korean|cantonese|川菜/i.test(
    lower
  );
}

/** Normalize intent before generating outing plans (rules + LLM) */
export function finalizeOutingPlanIntent(
  userMessages: string[],
  intent: ParsedIntent,
  now = new Date()
): void {
  const combined = userMessages.join("\n");
  const lower = combined.toLowerCase();

  enrichOutingIntent(combined, intent);

  if (/family|家人|亲子|my family|with my family/i.test(lower)) {
    intent.scenario = "family";
  }

  const district = extractDistrict(combined);
  if (district) {
    intent.targetDistrict = district;
    const loc = resolveLocation(combined, USERS[CURRENT_USER_ID]);
    intent.location = { lat: loc.lat, lng: loc.lng, label: loc.label };
  }

  const needsFullPlan =
    intent.wantsFullItinerary ||
    wantsFullItineraryPlan(combined) ||
    isNewOutingPlanRequest(combined);

  if (!needsFullPlan) return;

  intent.wantsFullItinerary = true;
  intent.wantsPlansExplicit = true;
  intent.includeActivities = true;
  intent.includeRestaurant = true;

  if (!userMentionedCuisine(combined)) {
    intent.cuisines = [];
  }

  if (/whole\s+day|full\s+day|all\s+day|一整天|全天/i.test(lower)) {
    intent.durationHours = intent.durationHours ?? 8;
    intent.timeOfDay = "afternoon";
  } else if (
    /tomorrow|明天/i.test(lower) &&
    !/dinner|lunch|morning|afternoon|晚上|中午|\d{1,2}\s*pm|\d{1,2}\s*am|\d{1,2}:\d{2}|\d{1,2}\s*点/i.test(
      lower
    )
  ) {
    intent.timeOfDay = "afternoon";
    intent.durationHours = intent.durationHours ?? 6;
  }

  if (!/kid|child|孩子|亲子|stroller|婴儿/i.test(lower)) {
    intent.familyFriendly = false;
  }

  if (!/diet|减肥|healthy|清淡|轻食/i.test(lower)) {
    intent.dietFriendly = false;
  }

  if (!/quiet|安静/i.test(lower)) {
    intent.quietAmbiance = false;
  }

  if (intent.priceTier && !userMentionedCuisine(combined) && !/cheap|expensive|便宜|贵|budget/i.test(lower)) {
    intent.priceTier = null;
  }
}
