import { ParsedIntent, PriceTier, Scenario, TimeOfDay } from "../types";
import { USERS, CURRENT_USER_ID } from "../data/users";
import { DISTRICT_CENTERS, resolveLocation } from "../data/districts";
import { inferTimeOfDayFromClock } from "../utils/time";
import { syncReserveTimeFromUserText } from "../utils/reserve_time";
import { applyPriceTierFromText, budgetForPriceTier } from "../utils/price_tier";
import {
  enrichOutingIntent,
  extractDurationHours,
  wantsFullItineraryPlan,
} from "../utils/itinerary";
import { extractFriendIdsFromText, isInviteRequest } from "../utils/friend_ids";
import { extractDeliveryAddonKinds } from "../utils/delivery_addons";
import { DeliveryAddonKind } from "../types";
import { parse_conversation } from "../tools/parse_intent";
import type { ChatContext, ChatMessage } from "../agent/chat_types";
import { ChatCompletionMessage, chatCompletionJson, isLlmConfigured } from "./client";

export type LlmAction = "converse" | "cuisine_info" | "show_plans" | "execute" | "invite_friends";

export interface LlmAgentDecision {
  assistantMessage: string;
  action: LlmAction;
  intent: {
    scenario: Scenario;
    groupSize: number;
    includeActivities: boolean;
    includeRestaurant: boolean;
    cuisines: string[];
    targetDistrict?: string | null;
    wantsReserve: boolean;
    wantsOrder: boolean;
    interactionMode: "show_plans" | "direct_action" | "follow_up";
    reserveTime?: string | null;
    dietFriendly: boolean;
    quietAmbiance: boolean;
    familyFriendly: boolean;
    keywords: string[];
    wantsPlansExplicit: boolean;
    wantsInviteFriends?: boolean;
    inviteFriendIds?: string[];
    inviteActivityId?: string | null;
    wantsFullItinerary?: boolean;
    durationHours?: number;
    itineraryOrder?: "activity_first" | "restaurant_first";
    itineraryPattern?:
      | "activity_first"
      | "restaurant_first"
      | "restaurant_activity_restaurant"
      | "activity_restaurant_activity"
      | "auto";
    budgetMin?: number;
    budgetMax?: number;
    priceTier?: PriceTier | null;
    distanceMaxM?: number;
    prepTimeMaxMin?: number;
    ratingMin?: number;
    deliveryAddonKinds?: string[];
  };
}

const DISTRICTS = Object.keys(DISTRICT_CENTERS).join(", ");
const CUISINES =
  "Cantonese, Japanese, Sichuan, Hotpot, Western, Taiwanese, Healthy, Noodles, BBQ, Seafood, Hunan, Korean, Malaysian, Turkish";

function buildSystemPrompt(): string {
  const user = USERS[CURRENT_USER_ID];
  return `You are Cultra, Meituan's AI lifestyle planner for Shenzhen. You understand natural language in English and Chinese.

Current user: ${user.name} (${user.id}), default location: ${user.locationLabel} (${user.lat}, ${user.lng}).
Friends: ${user.friendIds.join(", ")}.

You help with:
- Finding restaurants and activities (mock local data)
- Showing 1–3 ranked plan cards when the user wants options
- Immediately booking a table (reserve) or placing a food order when they clearly want action now
- Answering what cuisines exist in an area

Districts: ${DISTRICTS}
Restaurant cuisines in data: ${CUISINES}

Rules:
1. Read the FULL conversation — follow-ups like "book the first one" or "就这个" refer to prior context.
2. action=execute only when the user clearly wants to order or reserve NOW (not when browsing options).
3. action=show_plans when they want recommendations, options, plans, or you're unsure — pick this by default for new food/outing requests.
4. action=cuisine_info when they only ask what cuisines/types are available in an area (no booking yet).
5. action=converse for greetings, capability questions, clarifications, or chit-chat with no search needed.
6. Map user wording to canonical cuisines (e.g. sushi → Japanese, 火锅 → Hotpot, dim sum → Cantonese). Leave cuisines [] unless the user explicitly asks for a cuisine — never invent filters for generic "give me plans" requests.
7. Infer scenario: family (parents/kids/spouse), friends (group/social), solo otherwise.
8. reserveTime: human-readable e.g. "Today 7:00 PM", "Tomorrow 9:00 PM", or null.
9. targetDistrict: one of the district names above, or null for user's default area.
10. Write assistantMessage in the same language the user mainly uses; be warm, concise, and specific.
11. If context.hasPlans is true and user confirms a choice, set interactionMode to follow_up and action to execute when appropriate.
12. Price (¥ per person): cheap/便宜/affordable → priceTier "cheap" (¥0–80, budgetMax 80); medium/中等/mid-range → "medium" (¥80–140); expensive/fancy/premium/高档 → "expensive" (¥140+, budgetMin 140). Set budgetMin and budgetMax to match the tier.
13. wantsFullItinerary=true when user asks for ANY outing plan (e.g. "give me a plan", "plan for the whole day", "go out with friends") — NOT restaurant-only cards. includeActivities and includeRestaurant true. durationHours: 8 for whole/full day, else 4–6. itineraryPattern: auto for long days; friends often restaurant_activity_restaurant. Use 3-stop patterns when durationHours >= 6.
14. action=invite_friends when user invites friend(s) (e.g. "invite joshua and emil there too"). Set inviteFriendIds to all names mentioned. "there"/"too" = chosenPlan on screen (activity and/or restaurant). Set inviteActivityId or use restaurant from chosen plan.
15. Backup plans: if user reports rain during an outing, swap outdoor activities for indoor in the same district. If restaurant is crowded or a signature dish is unavailable, suggest a nearby same-cuisine alternative. Keep action as converse unless they ask for new plans.
16. Activity categories: if user asks for outdoor/outside activities, set keywords to include "outdoor"; the planner filters to outdoor and mixed venues. If they mention rain or want indoor activities (e.g. "raining, plan an indoor afternoon"), the planner must use strict indoor-only activities — no parks, boardwalks, or outdoor stops. Whole-day plans in a named district should set targetDistrict and wantsFullItinerary.
17. Family or friends outing / "give me a plan" / "whole day" / "go out with family" (not restaurant-only): wantsFullItinerary=true, includeActivities=true, includeRestaurant=true, action=show_plans, cuisines=[]. Do NOT return restaurant-only for these. familyFriendly=false unless user mentions kids.
18. Quiet ambiance: when user wants quiet/安静/peaceful/calm dining, set quietAmbiance=true. The planner ranks venues with lower reservation fill (fewer tables booked) as quieter — prefer calm spots over busy hotpot/BBQ halls.
19. Delivery add-ons: when user wants cake/flowers/champagne/gifts/balloons delivered to the restaurant (送蛋糕/鲜花/礼物), set deliveryAddonKinds to any of: cake, flowers, champagne, gift, balloons. Include these when building plans. After a plan is chosen, user may add more — acknowledge warmly.

Respond with JSON only:
{
  "assistantMessage": string,
  "action": "converse" | "cuisine_info" | "show_plans" | "execute" | "invite_friends",
  "intent": {
    "scenario": "family" | "friends" | "solo",
    "groupSize": number,
    "includeActivities": boolean,
    "includeRestaurant": boolean,
    "cuisines": string[],
    "targetDistrict": string | null,
    "wantsReserve": boolean,
    "wantsOrder": boolean,
    "interactionMode": "show_plans" | "direct_action" | "follow_up",
    "reserveTime": string | null,
    "dietFriendly": boolean,
    "quietAmbiance": boolean,
    "familyFriendly": boolean,
    "keywords": string[],
    "wantsPlansExplicit": boolean,
    "wantsInviteFriends": boolean (optional),
    "inviteFriendIds": string[] (optional),
    "inviteActivityId": string | null (optional),
    "wantsFullItinerary": boolean (optional),
    "durationHours": number (optional),
    "itineraryOrder": "activity_first" | "restaurant_first" (optional),
    "itineraryPattern": "activity_first" | "restaurant_first" | "restaurant_activity_restaurant" | "activity_restaurant_activity" | "auto" (optional),
    "budgetMin": number (optional),
    "budgetMax": number (optional),
    "priceTier": "cheap" | "medium" | "expensive" | null (optional),
    "distanceMaxM": number (optional),
    "prepTimeMaxMin": number (optional),
    "ratingMin": number (optional),
    "deliveryAddonKinds": string[] (optional, values: cake, flowers, champagne, gift, balloons)
  }
}`;
}

function inferBudgetFromHistory(userId: string, scenario: Scenario): { min: number; max: number } {
  const user = USERS[userId];
  const relevant = user.purchaseHistory.filter((p) => p.scenario === scenario).slice(0, 5);
  if (relevant.length === 0) return { min: 50, max: 280 };
  const perPerson = relevant.map((p) => p.amount / 4);
  const avg = perPerson.reduce((a, b) => a + b, 0) / perPerson.length;
  return { min: Math.floor(avg * 0.6), max: Math.ceil(avg * 1.4) };
}

export function llmDecisionToParsedIntent(
  decision: LlmAgentDecision,
  combinedUserText: string,
  now = new Date()
): ParsedIntent {
  const user = USERS[CURRENT_USER_ID];
  const i = decision.intent;
  const scenario = i.scenario;
  const historyBudget = inferBudgetFromHistory(CURRENT_USER_ID, scenario);
  const timeOfDay = inferTimeOfDayFromClock(now, combinedUserText);
  const district =
    i.targetDistrict && DISTRICT_CENTERS[i.targetDistrict] ? i.targetDistrict : undefined;
  const loc = resolveLocation(combinedUserText, user);
  const location = district
    ? {
        lat: DISTRICT_CENTERS[district].lat,
        lng: DISTRICT_CENTERS[district].lng,
        label: DISTRICT_CENTERS[district].label,
      }
    : { lat: loc.lat, lng: loc.lng, label: loc.label };

  let budgetMin = i.budgetMin ?? historyBudget.min;
  let budgetMax = i.budgetMax ?? historyBudget.max;
  let priceTier: PriceTier | null = i.priceTier ?? null;
  if (priceTier) {
    const tierBudget = budgetForPriceTier(priceTier);
    budgetMin = tierBudget.min;
    budgetMax = tierBudget.max;
  }

  const intent: ParsedIntent = {
    raw: combinedUserText,
    keywords: i.keywords?.length ? i.keywords : ["ai-parsed"],
    scenario,
    groupSize: Math.max(1, i.groupSize || 1),
    includeActivities: i.includeActivities,
    includeRestaurant: i.includeRestaurant,
    cuisines: i.cuisines ?? [],
    budgetMin,
    budgetMax,
    priceTier,
    ratingMin: i.ratingMin ?? 3.8,
    distanceMaxM: i.distanceMaxM ?? (district ? 12000 : 8000),
    dietFriendly: i.dietFriendly,
    quietAmbiance: i.quietAmbiance,
    familyFriendly: i.familyFriendly,
    prepTimeMaxMin: i.prepTimeMaxMin,
    timeOfDay,
    location,
    targetDistrict: district,
    friendIds: user.friendIds,
    wantsReserve: i.wantsReserve,
    wantsOrder: i.wantsOrder,
    wantsPlansExplicit: i.wantsPlansExplicit || Boolean(i.wantsFullItinerary),
    wantsInviteFriends: Boolean(i.wantsInviteFriends),
    inviteFriendIds: i.inviteFriendIds?.length ? i.inviteFriendIds : undefined,
    inviteActivityId: i.inviteActivityId ?? undefined,
    wantsFullItinerary: Boolean(i.wantsFullItinerary),
    durationHours: i.durationHours,
    itineraryPattern: i.itineraryPattern ?? undefined,
    itineraryOrder: i.itineraryOrder,
    interactionMode: i.interactionMode,
    reserveTime: i.reserveTime ?? undefined,
    oneStop: undefined,
  };

  const textKinds = extractDeliveryAddonKinds(combinedUserText);
  const llmKinds = (i.deliveryAddonKinds ?? []).filter((k): k is DeliveryAddonKind =>
    ["cake", "flowers", "champagne", "gift", "balloons"].includes(k)
  );
  if (textKinds.length || llmKinds.length) {
    intent.deliveryAddonKinds = [...new Set([...textKinds, ...llmKinds])];
  }

  applyPriceTierFromText(combinedUserText, intent);
  if (intent.priceTier === "expensive") {
    intent.ratingMin = Math.max(intent.ratingMin, 4.4);
  }
  if (isInviteRequest(combinedUserText) || intent.wantsInviteFriends) {
    intent.wantsInviteFriends = true;
    if (!intent.inviteFriendIds?.length) {
      const ids = extractFriendIdsFromText(combinedUserText);
      if (ids.length) intent.inviteFriendIds = ids;
    }
  }
  enrichOutingIntent(combinedUserText, intent);
  syncReserveTimeFromUserText(intent, combinedUserText);
  intent.timeOfDay = inferTimeOfDayFromClock(now, combinedUserText);

  return intent;
}

export async function analyzeWithLlm(
  messages: ChatMessage[],
  context: ChatContext
): Promise<{ decision: LlmAgentDecision; intent: ParsedIntent; usedLlm: true } | { usedLlm: false }> {
  if (!isLlmConfigured()) return { usedLlm: false };

  const transcript = messages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");

  const chosen = context.chosenPlan;
  const planHint = chosen
    ? `User's chosen plan: ${[
        chosen.activity ? `activity ${chosen.activity.name} (${chosen.activity.id})` : "",
        chosen.restaurant ? `restaurant ${chosen.restaurant.name} (${chosen.restaurant.id})` : "",
      ]
        .filter(Boolean)
        .join("; ")}`
    : context.lastPlans?.length
      ? `Visible plans on screen: ${context.lastPlans
          .slice(0, 3)
          .map((p, idx) => {
            const act = p.activity ? `${p.activity.name} (${p.activity.id})` : "";
            const rest = p.restaurant ? `${p.restaurant.name} (${p.restaurant.id})` : "";
            return `${idx + 1}. ${[act, rest].filter(Boolean).join(" + ") || "plan"}`;
          })
          .join("; ")}`
      : "No plans on screen yet.";

  const llmMessages: ChatCompletionMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: `${planHint}\nhasPlans: ${Boolean(context.hasPlans)}\n\nConversation:\n${transcript}`,
    },
  ];

  const decision = await chatCompletionJson<LlmAgentDecision>(llmMessages);
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
  const combined = userTexts.join("\n");
  const intent = llmDecisionToParsedIntent(decision, combined);

  return { decision, intent, usedLlm: true };
}

export function analyzeWithRules(messages: ChatMessage[]): {
  intent: ParsedIntent;
  action: LlmAction;
} {
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.text);
  const intent = parse_conversation(userTexts);
  const last = userTexts[userTexts.length - 1] ?? "";

  let action: LlmAction = "show_plans";
  if (/which\s+cuisine|what\s+cuisine|有哪些.*菜|菜系/i.test(last)) action = "cuisine_info";
  else if (isInviteRequest(last)) action = "invite_friends";
  else if (intent.interactionMode === "direct_action" || intent.interactionMode === "follow_up")
    action = "execute";
  else if (/^(hi|hello|hey|你好|谢谢|help)/i.test(last.trim())) action = "converse";

  return { intent, action };
}
