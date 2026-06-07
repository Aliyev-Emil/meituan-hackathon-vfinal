import { TimeOfDay } from "../types";

/** Current hour in Asia/Shanghai (real clock, not server default TZ). */
export function getShanghaiHour(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  return parseInt(parts.find((p) => p.type === "hour")?.value ?? "12", 10);
}

export function formatShanghaiTime(now = new Date()): string {
  return now.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function inferTimeOfDayFromClock(now = new Date(), text = ""): TimeOfDay {
  const lower = text.toLowerCase();
  if (/brunch|早茶|早午餐/.test(lower)) return "brunch";
  const pmMatch = lower.match(/\b(\d{1,2})\s*pm\b/);
  if (pmMatch) {
    const h = parseInt(pmMatch[1], 10);
    if (h === 12) return "lunch";
    if (h >= 10) return "late_night";
    if (h >= 9) return "evening";
    if (h >= 6) return "dinner";
    if (h >= 2) return "afternoon";
    return "lunch";
  }
  const amMatch = lower.match(/\b(\d{1,2})\s*am\b/);
  if (amMatch) {
    const h = parseInt(amMatch[1], 10);
    if (h < 10) return "morning";
    if (h < 12) return "brunch";
    return "lunch";
  }
  if (/晚上\s*6|六点|18\s*点|18:/i.test(lower)) return "dinner";
  if (/dinner|晚餐|晚饭|7\s*pm|19:|20:/i.test(lower)) return "dinner";
  if (/lunch|午餐|午饭|noon|中午/i.test(lower)) return "lunch";
  if (/morning|上午|早上/.test(lower)) return "morning";
  if (/afternoon|下午/.test(lower)) return "afternoon";
  if (/evening|晚上|night|夜宵|宵夜|midnight|凌晨/.test(lower)) return "evening";

  const h = getShanghaiHour(now);
  if (h >= 0 && h < 6) return "late_night";
  if (h < 10) return "morning";
  if (h < 12) return "brunch";
  if (h < 14) return "lunch";
  if (h < 17) return "afternoon";
  if (h < 21) return "dinner";
  return "evening";
}

export const TIME_LABELS: Record<TimeOfDay, string> = {
  morning: "Morning",
  brunch: "Brunch",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  evening: "Evening",
  late_night: "Late night",
};
