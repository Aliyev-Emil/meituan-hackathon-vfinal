import { ParsedIntent, TimeOfDay } from "../types";
import { getShanghaiHour } from "./time";
import { applyItineraryPatternToIntent } from "./itinerary_patterns";
import { applyActivityPreferencesToIntent } from "./activity_preferences";

export type ItineraryOrder = "activity_first" | "restaurant_first";

const FULL_ITINERARY_PATTERN =
  /create\s+(a\s+)?plans?|make\s+(me\s+)?(some\s+)?(a\s+)?plans?|build\s+(a\s+)?plans?|plan\s+my|give\s+me\s+(?:some\s+)?(?:a\s+)?plans?|need\s+(?:a\s+)?plans?|want\s+(?:a\s+)?plans?|full\s+day|whole\s+day|all\s+day|day\s+plan|fully\s+free|free\s+for\s+(?:the\s+)?(?:whole|full)\s+day|itinerary|schedule\s+my|outing\s+plan|做个?计划|帮我规划|安排.*(一天|行程|下午|晚上)|行程|一整天|全天|规划.*(下午|晚上|一天)|plan\s+for\s+(?:the\s+)?(?:whole\s+|full\s+)?(?:day|afternoon|evening|weekend|morning)|plan\s+(?:an?\s+)?(?:indoor|outdoor|a\s+)?(?:family\s+)?(?:afternoon|morning|evening|weekend|day)\b|帮我安排|make\s+(some\s+)?arrang|arrangements?\s+for|please\s+arrang|安排一下|suggest\s+(an?\s+)?(outing|plan)|organize/i;

/** Friends / social “go out” + plan or full day — not restaurant-only cards */
export function isSocialOutingPlanRequest(text: string): boolean {
  const lower = text.toLowerCase();
  const hasPlan = /\bplans?\b|计划|行程|方案/i.test(lower);
  const goOut = /go\s+out|going\s+out|hang\s+out|出门|出去玩|out\s+with/i.test(lower);
  const social = /friend|mates|buddy|聚会|compan/i.test(lower);
  const longDay = /whole\s+day|full\s+day|all\s+day|一整天|全天/i.test(lower);
  return hasPlan && (goOut || social || longDay);
}

/** Family “go out for a few hours” — activity + meal plan, not restaurant-only */
export function isFamilyOutingRequest(text: string): boolean {
  const lower = text.toLowerCase();
  const goOut =
    /go\s+out|going\s+out|出门|出去玩|out\s+with|一起出|free\s+this|fully\s+free|free\s+for/i.test(lower);
  const family = /wife|kid|child|children|family|老婆|妻子|孩子|亲子|儿子|女儿/i.test(lower);
  const planning =
    /arrang|安排|\bplans?\b|方案|suggest|推荐|few\s+hours|couple\s+of\s+hours|几个小时|几小时|whole\s+day|full\s+day|afternoon|下午|make\s+.*for\s+me/i.test(
      lower
    );
  return family && planning && (goOut || /whole\s+day|full\s+day|all\s+day|afternoon|下午/i.test(lower));
}

/** User wants fresh outing cards — not a backup swap on an existing plan */
export function isNewOutingPlanRequest(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    wantsFullItineraryPlan(text) ||
    /\bplan\s+(?:an?\s+)?(?:indoor|outdoor|a\s+)?(?:family\s+)?(?:afternoon|morning|evening|day|weekend)\b/i.test(
      lower
    ) ||
    /give\s+me\s+(?:some\s+)?plans?|show\s+me\s+plans?|suggest\s+plans?|what\s+should\s+we\s+do|what\s+can\s+we\s+do|帮我.*计划|推荐.*(计划|方案)/i.test(
      lower
    )
  );
}

export function wantsFullItineraryPlan(text: string): boolean {
  return (
    FULL_ITINERARY_PATTERN.test(text) ||
    isFamilyOutingRequest(text) ||
    isSocialOutingPlanRequest(text)
  );
}

/** Normalize intent after rules or LLM — ensures full outing plans when appropriate */
export function enrichOutingIntent(text: string, intent: ParsedIntent): void {
  const lower = text.toLowerCase();

  const needsFullPlan =
    wantsFullItineraryPlan(text) ||
    isFamilyOutingRequest(text) ||
    isSocialOutingPlanRequest(text) ||
    (/\bplans?\b/i.test(lower) &&
      /go\s+out|whole\s+day|full\s+day|friend|out\s+with|一整天|全天|tomorrow|明天/i.test(lower));

  if (needsFullPlan) {
    intent.wantsFullItinerary = true;
    intent.wantsPlansExplicit = true;
    if (!/只吃|only\s*eat|不要活动|不吃饭|only\s*activ/i.test(lower)) {
      intent.includeActivities = true;
      intent.includeRestaurant = true;
    }
    intent.durationHours =
      intent.durationHours ?? extractDurationHours(text, intent.timeOfDay);
    applyItineraryPatternToIntent(text, intent);
    if (!intent.itineraryPattern && !intent.itineraryOrder) {
      intent.itineraryOrder = extractItineraryOrder(text);
    }
    if (/kid|child|孩子|亲子/i.test(lower)) {
      intent.familyFriendly = true;
      intent.scenario = "family";
    }
    if (/friend|朋友|mates|buddy|聚会/i.test(lower) && intent.scenario === "solo") {
      intent.scenario = "friends";
    }
  }

  if (/not\s+too\s+far|don't\s+go\s+too\s+far|do not go too far|别太远|不要太远|near\s+home|在家附近|离.*近|stay\s+close/i.test(lower)) {
    intent.distanceMaxM = Math.min(intent.distanceMaxM, 5000);
    if (!intent.keywords.includes("nearby")) intent.keywords.push("nearby");
  }

  if (/few\s+hours|couple\s+of\s+hours|几个小时|几小时|\d+\s*hours/i.test(lower)) {
    intent.durationHours =
      intent.durationHours ?? extractDurationHours(text, intent.timeOfDay);
  }

  if (intent.wantsFullItinerary) {
    applyItineraryPatternToIntent(text, intent);
  }

  applyActivityPreferencesToIntent(text, intent);
}

export function extractDurationHours(text: string, timeOfDay: TimeOfDay): number {
  const lower = text.toLowerCase();
  const explicit = lower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|小时|h)\b/i);
  if (explicit) return Math.min(12, Math.max(1, parseFloat(explicit[1])));

  if (/full\s+day|whole\s+day|all\s+day|一整天|全天/i.test(lower)) return 8;
  if (/few\s+hours|couple\s+of\s+hours|几个小时|几小时/i.test(lower)) return 4;
  if (/half\s+day|半天/i.test(lower)) return 4;
  if (timeOfDay === "morning" || timeOfDay === "brunch") return 3;
  if (timeOfDay === "afternoon") return 4;
  if (timeOfDay === "lunch") return 2.5;
  if (timeOfDay === "dinner" || timeOfDay === "evening") return 4;
  if (timeOfDay === "late_night") return 3;
  return 4;
}

export function extractItineraryOrder(text: string): ItineraryOrder {
  const lower = text.toLowerCase();
  if (
    /eat\s+first|dinner\s+first|lunch\s+first|先吃|先用餐|先吃饭|restaurant\s+first|吃饭.*再|用餐.*然后/i.test(
      lower
    )
  ) {
    return "restaurant_first";
  }
  if (
    /play\s+first|activity\s+first|先玩|先逛|先.*(公园|展览|walk)|then\s+(eat|dinner|lunch)|再.*吃/i.test(
      lower
    )
  ) {
    return "activity_first";
  }
  return "activity_first";
}

/** Start minute-of-day in Shanghai for scheduling */
export function startMinuteOfDay(timeOfDay: TimeOfDay, now = new Date()): number {
  const map: Partial<Record<TimeOfDay, number>> = {
    morning: 9 * 60,
    brunch: 10 * 60,
    lunch: 12 * 60,
    afternoon: 14 * 60,
    dinner: 18 * 60,
    evening: 19 * 60,
    late_night: 21 * 60,
  };
  if (map[timeOfDay] != null) return map[timeOfDay]!;

  const h = getShanghaiHour(now);
  return Math.max(9 * 60, Math.min(21 * 60, h * 60));
}

export function formatMinutesAsTime(totalMinutes: number): string {
  const day = 24 * 60;
  const m = ((totalMinutes % day) + day) % day;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const pm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${min.toString().padStart(2, "0")} ${pm ? "PM" : "AM"}`;
}

export function estimateTravelMinutes(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(12, Math.min(45, Math.round(distM / 400 + 10)));
}
