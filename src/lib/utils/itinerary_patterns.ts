import { ItineraryPattern, ItineraryStopKind, ParsedIntent, Scenario } from "../types";

export const PATTERN_STOPS: Record<Exclude<ItineraryPattern, "auto">, ItineraryStopKind[]> = {
  activity_first: ["activity", "restaurant"],
  restaurant_first: ["restaurant", "activity"],
  restaurant_activity_restaurant: ["restaurant", "activity", "restaurant"],
  activity_restaurant_activity: ["activity", "restaurant", "activity"],
};

const LONG_OUTING_HOURS = 5.5;

export function extractItineraryPattern(
  text: string,
  durationHours?: number
): ItineraryPattern | undefined {
  const lower = text.toLowerCase();

  if (
    /restaurant\s*[\+\u2192>\-]\s*activit|restaurant\s+then\s+activit|吃.*(然后|再|\+).*玩.*(然后|再|\+).*吃|午餐.*玩.*晚餐|lunch\s+then\s+.*activit.*then\s+dinner|早午餐.*活动.*晚餐|brunch.*activit.*dinner/i.test(
      lower
    )
  ) {
    return "restaurant_activity_restaurant";
  }

  if (
    /activit\s*[\+\u2192>\-]\s*restaurant\s*[\+\u2192>\-]\s*activit|activit\s+then\s+restaurant\s+then\s+activit|玩.*(然后|再|\+).*吃.*(然后|再|\+).*玩|park\s+then\s+lunch\s+then|morning\s+.*activit.*afternoon\s+.*meal/i.test(
      lower
    )
  ) {
    return "activity_restaurant_activity";
  }

  if (/eat\s+first|dinner\s+first|lunch\s+first|先吃|先用餐|先吃饭|restaurant\s+first/i.test(lower)) {
    return "restaurant_first";
  }

  if (/play\s+first|activity\s+first|先玩|先逛|then\s+(eat|dinner|lunch)/i.test(lower)) {
    return "activity_first";
  }

  if ((durationHours ?? 0) >= LONG_OUTING_HOURS) {
    return "auto";
  }

  return undefined;
}

export function autoPatternForLongOuting(intent: ParsedIntent, text: string): ItineraryPattern {
  const lower = text.toLowerCase();
  if (/brunch|早午餐|lunch\s+first|先吃|eat\s+first/i.test(lower)) {
    return "restaurant_activity_restaurant";
  }
  if (intent.scenario === "family" || /kid|child|孩子|亲子|park|公园/i.test(lower)) {
    return "activity_restaurant_activity";
  }
  if (intent.scenario === "friends") {
    return "restaurant_activity_restaurant";
  }
  return "activity_restaurant_activity";
}

export function resolveItineraryStops(intent: ParsedIntent, text = ""): ItineraryStopKind[] {
  let pattern = intent.itineraryPattern;

  if (!pattern && intent.itineraryOrder) {
    pattern = intent.itineraryOrder;
  }

  if (!pattern) {
    pattern = extractItineraryPattern(text, intent.durationHours);
  }

  if (pattern === "auto" || (!pattern && (intent.durationHours ?? 0) >= LONG_OUTING_HOURS)) {
    pattern = autoPatternForLongOuting(intent, text);
  }

  if (!pattern) {
    pattern = "activity_first";
  }

  const stops = PATTERN_STOPS[pattern as Exclude<ItineraryPattern, "auto">];
  if (!stops) return PATTERN_STOPS.activity_first;

  return stops.filter((kind) => {
    if (kind === "activity") return intent.includeActivities;
    return intent.includeRestaurant;
  });
}

export function patternLabel(stops: ItineraryStopKind[]): string {
  if (stops.length <= 2) {
    return stops[0] === "activity" ? "activity → dinner" : "meal → activity";
  }
  return stops.map((k) => (k === "activity" ? "activity" : "meal")).join(" → ");
}

export function restaurantBlockMinutes(stopCount: number, durationHours: number): number {
  if (stopCount <= 2) return 90;
  if (durationHours >= 8) return 80;
  return 75;
}

export function activityBlockMinutes(
  activityDurationHours: number,
  stopCount: number,
  durationHours: number
): number {
  let mins = Math.round(activityDurationHours * 60);
  if (stopCount >= 3) {
    mins = Math.min(mins, durationHours >= 8 ? 150 : 120);
  }
  return Math.max(60, mins);
}

export function applyItineraryPatternToIntent(text: string, intent: ParsedIntent): void {
  const extracted = extractItineraryPattern(text, intent.durationHours);
  if (extracted) {
    intent.itineraryPattern = extracted;
    if (extracted === "activity_first" || extracted === "activity_restaurant_activity") {
      intent.itineraryOrder = "activity_first";
    }
    if (extracted === "restaurant_first" || extracted === "restaurant_activity_restaurant") {
      intent.itineraryOrder = "restaurant_first";
    }
  } else if ((intent.durationHours ?? 0) >= LONG_OUTING_HOURS && intent.wantsFullItinerary) {
    intent.itineraryPattern = "auto";
  }
}
