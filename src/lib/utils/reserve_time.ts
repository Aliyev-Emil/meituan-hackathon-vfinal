import { TimeOfDay } from "../types";
import { extractReserveTime } from "../tools/parse_intent";

const PERIOD_TIME: Record<TimeOfDay, string> = {
  morning: "9:00 AM",
  brunch: "10:00 AM",
  lunch: "12:00 PM",
  afternoon: "2:00 PM",
  dinner: "6:00 PM",
  evening: "7:00 PM",
  late_night: "9:00 PM",
};

function isExplicitReserveTime(value: string): boolean {
  if (/tbd/i.test(value)) return false;
  return (
    /\d{1,2}:\d{2}\s*(AM|PM)/i.test(value) ||
    /\b\d{1,2}\s*(AM|PM)\b/i.test(value) ||
    /\b\d{1,2}\s*pm\b/i.test(value) ||
    /\b\d{1,2}\s*am\b/i.test(value) ||
    /\d{1,2}\s*点/.test(value)
  );
}

/** User mentioned a meal period (not inferred from clock alone). */
export function extractMealPeriodFromText(text: string): TimeOfDay | null {
  const lower = text.toLowerCase();
  if (/brunch|早茶|早午餐/i.test(lower)) return "brunch";
  if (/breakfast|早餐|早饭/i.test(lower)) return "morning";
  if (/morning|早上|上午/i.test(lower)) return "morning";
  if (/lunch|午餐|午饭|中午/i.test(lower)) return "lunch";
  if (/afternoon|下午/i.test(lower)) return "afternoon";
  if (/dinner|晚餐|晚饭/i.test(lower)) return "dinner";
  if (/evening|晚上|tonight|今晚/i.test(lower)) return "evening";
  if (/late[\s-]?night|夜宵|宵夜|midnight|凌晨/i.test(lower)) return "late_night";
  return null;
}

function dayPrefix(text: string): "Today" | "Tomorrow" {
  return /tomorrow|明天/i.test(text) ? "Tomorrow" : "Today";
}

/**
 * Restaurant reservation time only.
 * - No time mentioned → "TBD"
 * - Period words (afternoon, morning, …) → logical default for that period
 * - Explicit clock time → use as parsed
 */
export function resolveRestaurantReserveTime(options: {
  userText?: string;
  reserveTime?: string | null;
}): string {
  const text = options.userText?.trim() ?? "";
  const hinted = options.reserveTime?.trim();

  // User's explicit clock time always wins over LLM hints (e.g. "tomorrow 6pm" vs afternoon 2pm)
  const fromUser = text ? extractReserveTime(text) : undefined;
  if (fromUser && isExplicitReserveTime(fromUser)) {
    return fromUser;
  }

  if (hinted && isExplicitReserveTime(hinted)) {
    return hinted;
  }

  const period = text ? extractMealPeriodFromText(text) : null;
  if (period) {
    return `${dayPrefix(text)} ${PERIOD_TIME[period]}`;
  }

  if (fromUser) return fromUser;

  return hinted || "TBD";
}

/** Prefer parsed user wording over LLM reserveTime on the intent object */
export function syncReserveTimeFromUserText(
  intent: { reserveTime?: string },
  userText: string
): void {
  const fromText = extractReserveTime(userText);
  if (fromText) {
    intent.reserveTime = fromText;
    return;
  }
  const period = extractMealPeriodFromText(userText);
  if (period) {
    intent.reserveTime = `${dayPrefix(userText)} ${PERIOD_TIME[period]}`;
  }
}
