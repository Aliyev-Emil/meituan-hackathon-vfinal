import { ParsedIntent, Scenario, TimeOfDay } from "../types";
import { USERS, CURRENT_USER_ID } from "../data/users";
import { extractDistrict, resolveLocation } from "../data/districts";
import { inferTimeOfDayFromClock } from "../utils/time";
import { applyPriceTierFromText } from "../utils/price_tier";
import {
  enrichOutingIntent,
  extractDurationHours,
  extractItineraryOrder,
  wantsFullItineraryPlan,
} from "../utils/itinerary";
import { applyItineraryPatternToIntent, extractItineraryPattern } from "../utils/itinerary_patterns";
import { applyActivityPreferencesToIntent } from "../utils/activity_preferences";
import { extractFriendIdsFromText, isInviteRequest } from "../utils/friend_ids";
import { extractDeliveryAddonKinds } from "../utils/delivery_addons";
import { resolveInviteTarget } from "./invite_friends";

const CUISINE_MAP: Record<string, string[]> = {
  cantonese: ["Cantonese", "粤菜"],
  粤菜: ["Cantonese", "粤菜"],
  japanese: ["Japanese", "日料"],
  日料: ["Japanese", "日料"],
  sushi: ["Japanese", "日料"],
  sichuan: ["Sichuan", "川菜"],
  川菜: ["Sichuan", "川菜"],
  hotpot: ["Hotpot", "火锅"],
  火锅: ["Hotpot", "火锅"],
  western: ["Western", "西餐"],
  西餐: ["Western", "西餐"],
  taiwanese: ["Taiwanese", "台式"],
  healthy: ["Healthy", "轻食"],
  轻食: ["Healthy", "轻食"],
  noodles: ["Noodles", "面食"],
  korean: ["Korean", "韩式"],
  韩式: ["Korean", "韩式"],
  韩国: ["Korean", "韩式"],
  malaysian: ["Malaysian", "马来菜"],
  马来: ["Malaysian", "马来菜"],
  turkish: ["Turkish", "土耳其菜"],
  土耳其: ["Turkish", "土耳其菜"],
};

const KEYWORD_PATTERNS: { pattern: RegExp; keyword: string }[] = [
  { pattern: /cantonese|粤菜|点心|dim\s*sum/i, keyword: "Cantonese" },
  { pattern: /japanese|日料|寿司|sushi/i, keyword: "Japanese" },
  { pattern: /sichuan|川菜|spicy|辣/i, keyword: "Sichuan" },
  { pattern: /hotpot|火锅/i, keyword: "hotpot" },
  { pattern: /korean|韩式|韩国|bibimbap|kimchi/i, keyword: "Korean" },
  { pattern: /malaysian|马来|laksa|nasi\s+lemak|satay/i, keyword: "Malaysian" },
  { pattern: /turkish|土耳其|kebab|pide/i, keyword: "Turkish" },
  { pattern: /western|西餐|bistro/i, keyword: "Western" },
  { pattern: /restaurant|餐厅|吃饭|dining|eat|吃|餐|饭|cuisine|美食/i, keyword: "restaurant" },
  { pattern: /family|家人|父母|kids|child|孩子|亲子|wife|老婆/i, keyword: "family" },
  { pattern: /friend|朋友|同事|boys|girls|聚会/i, keyword: "friends" },
  { pattern: /quiet|安静|静谧/i, keyword: "quiet" },
  { pattern: /diet|减肥|轻食|healthy|清淡/i, keyword: "diet-friendly" },
  { pattern: /park|乐园|playground|展览|exhibition|walk|漫步|活动|玩/i, keyword: "activity" },
  { pattern: /quick|快速|fast|office|办公|lunch/i, keyword: "quick lunch" },
  { pattern: /near|附近|close|不远|location/i, keyword: "nearby" },
  { pattern: /book|订|reserve|预约|table|订桌/i, keyword: "reservation" },
  { pattern: /order|点餐|外卖|下单/i, keyword: "order" },
  { pattern: /traffic|交通|remind|提醒/i, keyword: "one-stop" },
  { pattern: /solo|一个人|独自/i, keyword: "solo" },
  { pattern: /budget|预算|便宜|cheap|expensive|premium|fancy|高档|中端|medium/i, keyword: "budget" },
  { pattern: /afternoon|下午|weekend|周末/i, keyword: "afternoon" },
  { pattern: /create\s+(a\s+)?plan|make\s+(a\s+)?plan|itinerary|行程|做个?计划/i, keyword: "full plan" },
  { pattern: /invite|邀请|叫上|带上/i, keyword: "invite" },
];

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function inferScenario(text: string): Scenario {
  const lower = text.toLowerCase();
  if (/friend|朋友|4\s*people|四人|聚会|zhang|lina/i.test(lower)) return "friends";
  if (/solo|独自|一个人|alone/i.test(lower)) return "solo";
  if (/family|家人|wife|老婆|kid|child|5\s*year|亲子|父母|parents|爸|妈|父亲|母亲|my family/i.test(lower))
    return "family";
  return "solo";
}

export function extractReserveTime(text: string): string | undefined {
  const lower = text.toLowerCase();
  const tomorrow = /tomorrow|明天/i.test(lower);
  const prefix = tomorrow ? "Tomorrow" : "Today";

  const forPm = lower.match(/(?:for|at|by)\s+(\d{1,2})(?::(\d{2}))?\s*pm\b/);
  if (forPm) {
    const h = parseInt(forPm[1], 10);
    const m = forPm[2] ?? "00";
    return `${prefix} ${formatClockTime(h, m, "PM")}`;
  }

  const forAm = lower.match(/(?:for|at|by|@)\s*(\d{1,2})(?::(\d{2}))?\s*am\b/);
  if (forAm) {
    const h = parseInt(forAm[1], 10);
    const m = forAm[2] ?? "00";
    return `${prefix} ${formatClockTime(h, m, "AM")}`;
  }

  const plainPm = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*pm\b/);
  if (plainPm) {
    const h = parseInt(plainPm[1], 10);
    const m = plainPm[2] ?? "00";
    return `${prefix} ${formatClockTime(h, m, "PM")}`;
  }

  const plainAm = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*am\b/);
  if (plainAm) {
    const h = parseInt(plainAm[1], 10);
    const m = plainAm[2] ?? "00";
    return `${prefix} ${formatClockTime(h, m, "AM")}`;
  }

  const h24 = lower.match(/\b(\d{1,2}):(\d{2})\b/);
  if (h24) {
    const h = parseInt(h24[1], 10);
    const m = h24[2];
    const pm = h >= 12;
    const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${prefix} ${formatClockTime(h12, m, pm ? "PM" : "AM")}`;
  }

  if (/晚上\s*9|九点|9\s*点|21\s*点/i.test(lower)) return `${prefix} 9:00 PM`;
  if (/晚上\s*7|七点|7\s*点|19\s*点/i.test(lower)) return `${prefix} 7:00 PM`;
  if (/晚上\s*8|八点|8\s*点|20\s*点/i.test(lower)) return `${prefix} 8:00 PM`;
  if (/晚上\s*6|六点|6\s*点|18\s*点/i.test(lower)) return `${prefix} 6:00 PM`;
  if (/中午|\bnoon\b|12\s*点/i.test(lower) && !/afternoon|下午/i.test(lower)) {
    return `${prefix} 12:00 PM`;
  }

  return undefined;
}

function formatClockTime(h: number, m: string, meridiem: "AM" | "PM"): string {
  return `${h}:${m.padStart(2, "0")} ${meridiem}`;
}

export function inferGroupSize(text: string, _scenario: Scenario): number {
  const lower = text.toLowerCase();

  const explicit = text.match(/(\d+)\s*(people|人|位|pax|guests|guest)/i);
  if (explicit) return Math.max(1, parseInt(explicit[1], 10));

  const partyOf = lower.match(/party\s+of\s+(\d+)|(\d+)\s*人(的)?桌|(\d+)\s*位/i);
  if (partyOf) {
    const n = parseInt(partyOf[1] ?? partyOf[2] ?? partyOf[3], 10);
    if (!Number.isNaN(n)) return Math.max(1, n);
  }

  const friendCount = lower.match(/(\d+)\s*(?:of\s+my\s+)?friends?/i);
  if (friendCount) return 1 + parseInt(friendCount[1], 10);

  if (/with\s+my\s+parents|with\s+parents|my\s+parents|和父母|带父母|跟父母|父母一起|带上父母/i.test(lower))
    return 3;
  if (/(?:with|和|跟).{0,12}parents|父母/i.test(lower) && /with|和|跟|一起|带|go|去/i.test(lower))
    return 3;

  const kidsCount = lower.match(/(\d+)\s*(kids?|children|儿子|女儿)/i);
  if (/wife|老婆|配偶/i.test(lower) && kidsCount) {
    return 2 + parseInt(kidsCount[1], 10);
  }
  if (/wife.*(kid|child|son|daughter)|老婆.*(孩子|儿子|女儿)/i.test(lower)) return 4;
  if (/(wife|老婆|配偶).*(kid|child|孩子|5\s*year)/i.test(lower)) return 4;
  if (/wife|老婆|配偶|couple|伴侣/i.test(lower) && !/parents|父母|kid|child/i.test(lower)) return 2;

  const atMentions = text.match(/@(zhangwei|lina|wangfang|xiaoming|joshua|haeun|emil)/gi);
  if (atMentions?.length) return 1 + atMentions.length;

  if (
    /with\s+(a\s+)?friend|with\s+someone|with\s+my\s+\w+|和朋友|跟朋友|和好友|带上朋友|和同|两个人|两人|我们俩|我们一起去|我们|us\b|together with|go with/i.test(
      lower
    )
  ) {
    if (/friends?|朋友们|好友|同事们|colleagues/i.test(lower)) return 3;
    return 2;
  }

  if (/family|家人|全家|一家人/i.test(lower) && /with|和|跟|一起|带|go|去/i.test(lower)) return 3;

  if (/just me|only me|alone|solo|独自|一个人|自己|for myself|我一个人/i.test(lower)) return 1;

  return 1;
}

function extractKeywords(text: string): string[] {
  const found = new Set<string>();
  for (const { pattern, keyword } of KEYWORD_PATTERNS) {
    if (pattern.test(text)) found.add(keyword);
  }
  for (const [key, tags] of Object.entries(CUISINE_MAP)) {
    if (text.toLowerCase().includes(key.toLowerCase())) tags.forEach((t) => found.add(t));
  }
  return [...found].filter((v, i, a) => a.indexOf(v) === i);
}

export function extractCuisines(text: string): string[] {
  const cuisines: string[] = [];
  const lower = text.toLowerCase();
  for (const [key, tags] of Object.entries(CUISINE_MAP)) {
    if (lower.includes(key.toLowerCase())) cuisines.push(...tags);
  }
  return [...new Set(cuisines)];
}

function inferBudgetFromHistory(userId: string, scenario: Scenario): { min: number; max: number } {
  const user = USERS[userId];
  const relevant = user.purchaseHistory.filter((p) => p.scenario === scenario).slice(0, 5);
  if (relevant.length === 0) return { min: 50, max: 280 };
  const perPerson = relevant.map((p) => p.amount / 4);
  const avg = perPerson.reduce((a, b) => a + b, 0) / perPerson.length;
  return { min: Math.floor(avg * 0.6), max: Math.ceil(avg * 1.4) };
}

function resolveIncludes(text: string, timeOfDay: TimeOfDay): { includeRestaurant: boolean; includeActivities: boolean } {
  const lower = text.toLowerCase();

  const isInfoOnly =
    /which\s+cuisine|what\s+cuisine|有哪些|什么菜|list.*cuisine| cuisines|菜系/i.test(lower) &&
    !/want|find|book|order|吃|要|reserve|activit|show/i.test(lower);

  if (isInfoOnly) {
    return { includeRestaurant: true, includeActivities: false };
  }

  const wantsPlay =
    /activit|activities|活动|玩|park|乐园|展览|exhibition|walk|漫步|逛逛|outing|museum|show\s+.*activ/i.test(
      lower
    ) || /先.*(玩|去)|然后.*吃|first.*then/i.test(lower);

  const wantsReserveOrPlace =
    /book|订|reserve|预约|订桌|定位|订位|reserve\s+a\s+place|book\s+a\s+table|订个|订一家/i.test(lower);

  const wantsFood =
    wantsReserveOrPlace ||
    /吃|餐|饭|eat|dining|restaurant|餐厅|hotpot|火锅|cuisine|菜|食|美食|place\s+to\s+eat|want.*(food|restaurant)/i.test(
      lower
    ) ||
    keywordsHasFood(text);
  const fullOuting = /afternoon|下午|weekend|周末|go\s*out|出门|安排|arrang|free\s+this/i.test(lower);
  const familyGoOut =
    fullOuting &&
    /wife|kid|child|children|family|老婆|孩子|亲子/i.test(lower) &&
    /arrang|安排|few\s+hours|几个小时|make\s+.*for\s+me|plan/i.test(lower);

  const socialDayPlan =
    /\bplan\b/i.test(lower) &&
    /go\s+out|whole\s+day|full\s+day|friend|out\s+with|一整天|全天/i.test(lower);

  const foodOnly = /只吃|只要.*吃|only\s*eat|不想玩|不要活动/i.test(lower);
  const playOnly = /只玩|只要活动|only\s*activ|不吃饭/i.test(lower);

  if (familyGoOut || socialDayPlan) return { includeRestaurant: true, includeActivities: true };

  if (wantsFood && !wantsPlay && !fullOuting) return { includeRestaurant: true, includeActivities: false };
  if ((wantsPlay && !wantsFood) || playOnly) return { includeRestaurant: false, includeActivities: true };
  if (foodOnly) return { includeRestaurant: true, includeActivities: false };
  if (fullOuting && (wantsFood || wantsPlay)) return { includeRestaurant: true, includeActivities: true };
  if (wantsFood && wantsPlay) return { includeRestaurant: true, includeActivities: true };
  if (["lunch", "dinner", "evening", "late_night", "brunch"].includes(timeOfDay)) {
    return { includeRestaurant: true, includeActivities: false };
  }
  return { includeRestaurant: true, includeActivities: fullOuting };
}

function keywordsHasFood(text: string): boolean {
  return KEYWORD_PATTERNS.some((k) => k.keyword === "restaurant" && k.pattern.test(text));
}

/** Merge food-related intent; latest cuisine message replaces earlier cuisines */
export function parse_conversation(userMessages: string[], now = new Date()): ParsedIntent {
  const combined = userMessages.join("\n");
  const intent = parse_intent(combined, now);

  let latestCuisines: string[] = [];
  for (const msg of userMessages) {
    const c = extractCuisines(msg);
    if (c.length) latestCuisines = c;
    if (/family|家人|父母|parents|孩子/i.test(msg)) intent.scenario = "family";
    if (/parents|父母|family|家人/i.test(msg)) intent.scenario = "family";
    if (/parents|父母|people|人|位|pax|\d+\s*(people|人)/i.test(msg)) {
      intent.groupSize = inferGroupSize(msg, intent.scenario);
    }
    const time = extractReserveTime(msg);
    if (time) intent.reserveTime = time;
    const district = extractDistrict(msg);
    if (district) {
      intent.targetDistrict = district;
      const loc = resolveLocation(msg, USERS[CURRENT_USER_ID]);
      intent.location = { lat: loc.lat, lng: loc.lng, label: loc.label };
    }
    if (/activit|activities|活动|展览|museum|park|玩|show\s+.*activ/i.test(msg)) {
      intent.includeActivities = true;
      intent.includeRestaurant = false;
    }
    if (
      /reserve|book|订|预约|订桌|reserve\s+a\s+place/i.test(msg) &&
      !/activit|activities|活动|museum|博物馆|park|展览|exhibition|玩|walk|乐园/i.test(msg)
    ) {
      intent.includeRestaurant = true;
      intent.includeActivities = false;
      intent.wantsReserve = true;
      if (!/give\s*me\s+plan|show\s+plan|方案|有哪些/i.test(msg)) intent.interactionMode = "direct_action";
    }
    if (/want.*(eat|food|restaurant)|想吃|要吃|restaurant|餐厅/i.test(msg)) intent.includeRestaurant = true;
    applyPriceTierFromText(msg, intent);
    if (isInviteRequest(msg)) {
      intent.wantsInviteFriends = true;
      const ids = extractFriendIdsFromText(msg);
      if (ids.length) intent.inviteFriendIds = ids;
      const target = resolveInviteTarget(msg);
      if (target.activityId) intent.inviteActivityId = target.activityId;
    }
    if (wantsFullItineraryPlan(msg)) {
      intent.wantsFullItinerary = true;
      intent.wantsPlansExplicit = true;
      intent.durationHours = extractDurationHours(msg, intent.timeOfDay);
      applyItineraryPatternToIntent(msg, intent);
    }
    const deliveryKinds = extractDeliveryAddonKinds(msg);
    if (deliveryKinds.length) {
      intent.deliveryAddonKinds = [...new Set([...(intent.deliveryAddonKinds ?? []), ...deliveryKinds])];
    }
  }
  if (latestCuisines.length) intent.cuisines = latestCuisines;
  applyPriceTierFromText(combined, intent);
  enrichOutingIntent(combined, intent);

  return intent;
}

export function parse_intent(naturalLanguageInput: string, now = new Date()): ParsedIntent {
  const text = naturalLanguageInput.trim();
  const user = USERS[CURRENT_USER_ID];
  const scenario = inferScenario(text);
  const keywords = extractKeywords(text);
  const timeOfDay = inferTimeOfDayFromClock(now, text);
  const { includeRestaurant, includeActivities } = resolveIncludes(text, timeOfDay);
  const cuisines = extractCuisines(text);

  const historyBudget = inferBudgetFromHistory(CURRENT_USER_ID, scenario);
  let budgetMin = historyBudget.min;
  let budgetMax = historyBudget.max;
  let priceTier: ParsedIntent["priceTier"] = null;
  let distanceMaxM = 8000;
  let ratingMin = 3.8;
  let prepTimeMaxMin: number | undefined;

  const lower = text.toLowerCase();
  if (/quick|fast|office|办公|15\s*min/i.test(lower)) {
    prepTimeMaxMin = 15;
    distanceMaxM = 2000;
  }
  const intentBudget = { budgetMin, budgetMax, priceTier };
  applyPriceTierFromText(text, intentBudget);
  budgetMin = intentBudget.budgetMin;
  budgetMax = intentBudget.budgetMax;
  priceTier = intentBudget.priceTier ?? null;
  if (priceTier === "expensive") ratingMin = Math.max(ratingMin, 4.4);
  if (/near|附近|close|nearby|location|我的位置/i.test(lower)) distanceMaxM = 10000;
  if (/not\s+too\s+far|don't\s+go\s+too\s+far|near\s+home|不要太远|别太远/i.test(lower)) {
    distanceMaxM = Math.min(distanceMaxM, 5000);
  }
  if (extractDistrict(text)) distanceMaxM = 12000;

  const groupSize = inferGroupSize(text, scenario);

  const wantsReserve =
    (/book|订|reserve|预约|订桌|定位|订位|reserve\s+a\s+place|book\s+a\s+table|订个|订一家/i.test(lower) &&
      !/only\s*order|只点|只要外卖/i.test(lower)) ||
    (/place|table|位/i.test(lower) && /reserve|book|订|预约/i.test(lower));
  const wantsOrder =
    /order|点餐|下单|外卖|我要点|点一份|place\s*order/i.test(lower) && !wantsReserve;

  const wantsFullItinerary = wantsFullItineraryPlan(text);
  const wantsPlansExplicit =
    wantsFullItinerary ||
    /give\s*me\s+(plan|options)|show\s+(me\s+)?plans?|plans?\s+(for|near)|^options|方案|计划|推荐一下|有哪些|看看|suggest|what\s+can|what\s+should|帮我安排|make\s+(some\s+)?arrang|go\s+out/i.test(
      lower
    );

  let includeActivitiesResolved = includeActivities;
  let includeRestaurantResolved = includeRestaurant;
  if (wantsFullItinerary && !/只吃|only\s*eat|不要活动|不吃饭|only\s*activ/i.test(lower)) {
    includeActivitiesResolved = true;
    includeRestaurantResolved = true;
  }

  const durationHours = wantsFullItinerary ? extractDurationHours(text, timeOfDay) : undefined;
  const itineraryPattern = wantsFullItinerary ? extractItineraryPattern(text, durationHours) : undefined;
  const itineraryOrder =
    itineraryPattern === "activity_first" || itineraryPattern === "activity_restaurant_activity"
      ? "activity_first"
      : itineraryPattern === "restaurant_first" || itineraryPattern === "restaurant_activity_restaurant"
        ? "restaurant_first"
        : wantsFullItinerary
          ? extractItineraryOrder(text)
          : undefined;

  let interactionMode: "show_plans" | "direct_action" | "follow_up" = "show_plans";
  if ((wantsOrder || wantsReserve) && !wantsPlansExplicit) {
    interactionMode = "direct_action";
  }

  const reserveTime = extractReserveTime(text);

  const wantsInviteFriends = isInviteRequest(text);
  const inviteFriendIds = wantsInviteFriends ? extractFriendIdsFromText(text) : [];
  const inviteTarget = wantsInviteFriends ? resolveInviteTarget(text) : {};

  const friendIdMatch = text.match(/@(zhangwei|lina|wangfang|xiaoming|joshua|haeun|emil)/gi);
  const friendIds =
    inviteFriendIds.length > 0 ? inviteFriendIds
    : friendIdMatch ?
      friendIdMatch.map((m) => m.replace("@", "").toLowerCase())
    : user.friendIds;

  const oneStop = {
    reserve: wantsReserve,
    partySize: groupSize,
    reserveTime: reserveTime?.toLowerCase().includes("tomorrow")
      ? reserveTime.replace(/Tomorrow/i, "tomorrow")
      : reserveTime,
    checkTraffic: /traffic|交通/i.test(lower),
    remindMinutesBefore: /30\s*min|三十分钟|半小时/i.test(lower) ? 30 : /remind|提醒/i.test(lower) ? 15 : undefined,
  };

  const intent: ParsedIntent = {
    raw: text,
    keywords,
    scenario,
    groupSize,
    includeActivities: includeActivitiesResolved,
    includeRestaurant: includeRestaurantResolved,
    wantsFullItinerary,
    durationHours,
    itineraryPattern,
    itineraryOrder,
    cuisines,
    budgetMin,
    budgetMax,
    priceTier,
    ratingMin,
    distanceMaxM,
    dietFriendly: /diet|减肥|轻|healthy|清淡|wife.*diet/i.test(lower),
    quietAmbiance: /quiet|安静|父母|parent/i.test(lower),
    familyFriendly: /kid|child|5\s*year|亲子|父母|parent/i.test(lower) || /family|家人/i.test(lower),
    prepTimeMaxMin,
    timeOfDay,
    location: (() => {
      const loc = resolveLocation(text, user);
      return { lat: loc.lat, lng: loc.lng, label: loc.label };
    })(),
    targetDistrict: extractDistrict(text) ?? undefined,
    friendIds,
    wantsReserve,
    wantsOrder,
    wantsPlansExplicit,
    wantsInviteFriends,
    inviteFriendIds: inviteFriendIds.length ? inviteFriendIds : undefined,
    inviteActivityId: inviteTarget.activityId,
    interactionMode,
    reserveTime,
    oneStop:
      oneStop.checkTraffic || oneStop.remindMinutesBefore || oneStop.reserve ? oneStop : undefined,
  };

  enrichOutingIntent(text, intent);
  applyActivityPreferencesToIntent(text, intent);
  const deliveryKinds = extractDeliveryAddonKinds(text);
  if (deliveryKinds.length) intent.deliveryAddonKinds = deliveryKinds;
  return intent;
}

export { haversineM };
