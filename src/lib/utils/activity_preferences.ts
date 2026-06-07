import type { Activity, ActivitySetting, ParsedIntent } from "../types";
import { isWeatherSensitive } from "../data/activities";

export type ActivitySettingFilter = ActivitySetting;

const TYPE_PATTERNS: { pattern: RegExp; type: Activity["type"] }[] = [
  { pattern: /museum|展览|exhibition|gallery|博物馆/i, type: "exhibition" },
  { pattern: /theme\s*park|amusement|乐园|过山车|欢乐谷/i, type: "kids_park" },
  { pattern: /kids?\s*park|儿童乐园|亲子乐园/i, type: "kids_park" },
  { pattern: /mall|shopping\s*center|商场|万象城/i, type: "mall" },
  { pattern: /food\s*street|night\s*market|美食街|小吃街/i, type: "food_street" },
  {
    pattern: /boardwalk|\bwalk\b|trail|hike|\bpark\b|步道|漫步|公园|栈道|滨海|徒步/i,
    type: "city_walk",
  },
];

const OUTDOOR_PATTERNS =
  /outdoor|outside|open[\s-]?air|alfresco|户外|室外|外景|露天/i;
const INDOOR_PATTERNS = /indoor|inside|室内|馆内|空调/i;
const RAIN_PATTERNS =
  /rain|rainy|raining|downpour|storm|wet\s+weather|下雨|暴雨|大雨|下雨了|天气.*(差|不好)|too\s+wet|gonna\s+be\s+rain/i;
const INCLUDE_OUTDOOR =
  /include.*(outdoor|outside)|outdoor\s+activ|outside\s+activ|(outdoor|outside).*(activ|活动)|户外.*活动|室外.*活动/i;
const STRICT_OUTDOOR = /only\s+outdoor|outdoor\s+only|只要户外|纯户外/i;
const STRICT_INDOOR = /only\s+indoor|indoor\s+only|只要室内|纯室内/i;
/** Swap phrasing — not a fresh indoor preference */
const INDOOR_SWAP_CONTEXT =
  /(?:change|swap|switch|replace|改成|换成|改|换).*?(?:into\s+)?(?:an?\s+)?(?:inside|indoor|室内)|into\s+(?:an?\s+)?(?:inside|indoor|室内)/i;

export function mentionsRain(text: string): boolean {
  return RAIN_PATTERNS.test(text.toLowerCase());
}

/** User wants venues mainly outdoors / indoors / etc. */
export function extractActivityPreferences(text: string): {
  settings: ActivitySettingFilter[];
  types: Activity["type"][];
  strictSetting: boolean;
  rainSafe: boolean;
} {
  const lower = text.toLowerCase();
  const settings = new Set<ActivitySettingFilter>();
  const types = new Set<Activity["type"]>();

  const hasRain = mentionsRain(lower);
  const hasIndoor = INDOOR_PATTERNS.test(lower) && !INDOOR_SWAP_CONTEXT.test(lower);
  const hasOutdoor =
    (OUTDOOR_PATTERNS.test(lower) || INCLUDE_OUTDOOR.test(lower)) && !hasRain;

  if (hasRain) {
    settings.add("indoor");
  }
  if (hasIndoor) {
    settings.add("indoor");
  }
  if (hasOutdoor) {
    settings.add("outdoor");
  }

  for (const { pattern, type } of TYPE_PATTERNS) {
    if (pattern.test(lower)) types.add(type);
  }

  let strictSetting = STRICT_OUTDOOR.test(lower) || STRICT_INDOOR.test(lower);
  if (
    !strictSetting &&
    (hasRain || (hasIndoor && !hasOutdoor && /\bplan\b|afternoon|下午|outing|activit|活动|行程/i.test(lower)))
  ) {
    strictSetting = true;
  }

  return {
    settings: [...settings],
    types: [...types],
    strictSetting,
    rainSafe: hasRain,
  };
}

export function applyActivityPreferencesToIntent(text: string, intent: ParsedIntent): void {
  const prefs = extractActivityPreferences(text);
  if (prefs.settings.length) intent.activitySettings = prefs.settings;
  if (prefs.types.length) intent.activityTypes = prefs.types;
  if (prefs.strictSetting) intent.activitySettingStrict = true;
  if (prefs.rainSafe) intent.rainSafeActivities = true;

  if (prefs.settings.includes("outdoor") || prefs.settings.includes("indoor") || prefs.rainSafe) {
    intent.includeActivities = true;
  }
  if (prefs.types.length) {
    intent.includeActivities = true;
  }
}

function matchesSetting(
  activity: Activity,
  settings: ActivitySettingFilter[],
  strict: boolean
): boolean {
  if (!settings.length) return true;

  const wantsOutdoor = settings.includes("outdoor");
  const wantsIndoor = settings.includes("indoor");
  const wantsMixed = settings.includes("mixed");

  if (wantsOutdoor && !wantsIndoor) {
    if (strict) return activity.setting === "outdoor";
    return activity.setting === "outdoor" || activity.setting === "mixed";
  }
  if (wantsIndoor && !wantsOutdoor) {
    if (strict) return activity.setting === "indoor";
    return activity.setting === "indoor" || activity.setting === "mixed";
  }
  if (wantsMixed && !wantsOutdoor && !wantsIndoor) {
    return activity.setting === "mixed";
  }

  return settings.includes(activity.setting);
}

/** Whether an activity fits the user's indoor/outdoor/rain preferences */
export function activityAllowedByPreferences(activity: Activity, intent: ParsedIntent): boolean {
  const settings = intent.activitySettings ?? [];
  const types = intent.activityTypes ?? [];
  const strict = intent.activitySettingStrict ?? false;

  if (settings.length && !matchesSetting(activity, settings, strict)) return false;
  if (intent.rainSafeActivities && isWeatherSensitive(activity)) return false;
  if (types.length && !types.includes(activity.type)) return false;
  return true;
}

/** Prefer outdoor / exhibition / etc. when user asked for categories */
export function filterActivitiesByPreferences(
  activities: Activity[],
  intent: ParsedIntent
): Activity[] {
  const settings = intent.activitySettings ?? [];
  const types = intent.activityTypes ?? [];
  const strict = intent.activitySettingStrict ?? false;
  const rainSafe = intent.rainSafeActivities ?? false;
  const lockFilters = strict || rainSafe;

  if (!settings.length && !types.length && !rainSafe) return activities;

  let filtered = activities.filter((a) => activityAllowedByPreferences(a, intent));

  if (!filtered.length && settings.length && !lockFilters) {
    filtered = activities.filter((a) => {
      if (!matchesSetting(a, settings, false)) return false;
      if (types.length && !types.includes(a.type)) return false;
      return true;
    });
  }
  if (!filtered.length && types.length && !lockFilters) {
    filtered = activities.filter((a) => types.includes(a.type));
  }

  return filtered.sort(
    (a, b) => scoreActivityForPrefs(b, settings, types, intent) - scoreActivityForPrefs(a, settings, types, intent)
  );
}

function scoreActivityForPrefs(
  a: Activity,
  settings: ActivitySettingFilter[],
  types: Activity["type"][],
  intent: ParsedIntent
): number {
  let score = a.rating * 10;
  if (settings.includes("outdoor") && a.setting === "outdoor") score += 25;
  if (settings.includes("indoor") && a.setting === "indoor") score += 25;
  if (types.includes(a.type)) score += 20;
  if (intent.rainSafeActivities && a.setting === "indoor") score += 20;
  if (intent.familyFriendly && a.familyFriendly) score += 12;
  if (/kid|child|孩子|亲子/i.test(intent.raw) && a.type === "kids_park") score += 15;
  return score;
}

/** Catalog activities that match setting / rain / type preferences (ignores distance). */
export function activitiesMatchingPreferences(
  activities: Activity[],
  intent: ParsedIntent
): Activity[] {
  return activities.filter((a) => activityAllowedByPreferences(a, intent));
}
