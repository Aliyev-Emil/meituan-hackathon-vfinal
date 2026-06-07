import { ACTIVITIES } from "../data/activities";
import { Activity, Scenario, TimeOfDay } from "../types";
import { haversineM } from "./parse_intent";

function slotMatches(timeOfDay: TimeOfDay, slots: TimeOfDay[]): boolean {
  if (slots.includes(timeOfDay)) return true;
  if (timeOfDay === "late_night") return slots.some((s) => ["evening", "late_night", "afternoon"].includes(s));
  return false;
}

/** Full-day plans span morning→evening — don't filter out parks/museums by current clock */
function slotMatchesFullDay(slots: TimeOfDay[]): boolean {
  return slots.some((s) => ["morning", "brunch", "lunch", "afternoon", "evening"].includes(s));
}

export function search_activities(
  location: { lat: number; lng: number },
  scenario: Scenario,
  timeOfDay: TimeOfDay,
  maxDistanceM = 5000,
  district?: string,
  options?: {
    forFullDayPlan?: boolean;
    settings?: Activity["setting"][];
    types?: Activity["type"][];
    settingStrict?: boolean;
  }
): Activity[] {
  const settings = options?.settings ?? [];
  const types = options?.types ?? [];
  const strict = options?.settingStrict ?? false;

  return ACTIVITIES.filter(
    (a) =>
      a.scenarios.includes(scenario) &&
      (options?.forFullDayPlan ? slotMatchesFullDay(a.timeSlots) : slotMatches(timeOfDay, a.timeSlots)) &&
      (!district || a.district === district) &&
      haversineM(location.lat, location.lng, a.lat, a.lng) <= maxDistanceM &&
      (!settings.length ||
        (settings.includes("outdoor") && !settings.includes("indoor")
          ? strict
            ? a.setting === "outdoor"
            : a.setting === "outdoor" || a.setting === "mixed"
          : settings.includes("indoor") && !settings.includes("outdoor")
            ? strict
              ? a.setting === "indoor"
              : a.setting === "indoor" || a.setting === "mixed"
            : settings.includes(a.setting))) &&
      (!types.length || types.includes(a.type))
  )
    .map((a) => ({
      activity: a,
      distance: haversineM(location.lat, location.lng, a.lat, a.lng),
    }))
    .sort((a, b) => a.distance - b.distance)
    .map((x) => x.activity);
}
