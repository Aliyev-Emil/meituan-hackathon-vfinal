import { ActivityRoom, Plan, ParsedIntent } from "../types";
import {
  formatInviteSuccessMessage,
  inviteFriendsToVenue,
  parseInviteFromConversation,
} from "../tools/invite_friends";
import { isInviteRequest, extractFriendIdsFromText } from "../utils/friend_ids";
import { isNewOutingPlanRequest } from "../utils/itinerary";
import { finalizeOutingPlanIntent } from "../utils/plan_intent";
import { applyPlanContingency, detectContingency } from "../tools/plan_contingency";
import { setActiveOutingPlan, getActiveOutingPlan, addDeliveryAddonsToOrder, syncLinkedOrdersFromPlan } from "../store";
import { formatShanghaiTime, inferTimeOfDayFromClock, TIME_LABELS } from "../utils/time";
import { generate_plans, GeneratePlansResult } from "./generate_plans";
import { listNearbyCuisines } from "../tools/search_restaurants";
import { RESTAURANTS } from "../data/restaurants";
import { haversineM } from "../tools/parse_intent";
import { analyzeWithLlm, analyzeWithRules, LlmAction } from "../llm/agent";
import { isLlmConfigured } from "../llm/client";
import { resolveRestaurantReserveTime, syncReserveTimeFromUserText } from "../utils/reserve_time";
import { ACTIVITIES } from "../data/activities";
import { CURRENT_USER_ID, USERS } from "../data/users";
import { findActivityMentionedInText } from "../utils/activity_match";
import { getFriendsAlsoWant } from "../tools/fetch_friend_history";
import {
  applyDeliveryAddonsFromMessage,
  extractDeliveryAddonKinds,
  isDeliveryAddonRequest,
  POST_PLAN_FOLLOWUP_MESSAGE,
} from "../utils/delivery_addons";
import { DeliveryAddonKind } from "../types";
import { execute_one_stop, resolvePlanRestaurant } from "../tools/one_stop_agent";

export type { ChatMessage, ChatContext } from "./chat_types";
import type { ChatContext, ChatMessage } from "./chat_types";

export interface ChatResponse {
  assistantMessage: string;
  result?: GeneratePlansResult;
  autoExecuted?: boolean;
  executedAction?: "order" | "reserve" | "share_only";
  executedPlan?: Plan;
  showPlans: boolean;
  usedLlm?: boolean;
  room?: ActivityRoom;
  /** Plan was updated in place (rain / restaurant backup) */
  planContingency?: boolean;
  /** Plan updated with delivery add-ons */
  updatedPlan?: Plan;
  /** Top plan auto-picked via One-Stop Agent button */
  oneStopAgent?: boolean;
}

function areaLabel(intent: ParsedIntent): string {
  if (intent.targetDistrict) return intent.targetDistrict;
  return intent.location.label.split(",")[0] ?? "your area";
}

function answerCuisineInfo(intent: ParsedIntent): string {
  const district = intent.targetDistrict;
  const loc = intent.location;
  const label = areaLabel(intent);

  const list = listNearbyCuisines(loc, district ? 20000 : 10000, district);
  const venues = RESTAURANTS.filter((r) =>
    district ? r.district === district : haversineM(loc.lat, loc.lng, r.lat, r.lng) <= 10000
  )
    .slice(0, 8)
    .map(
      (r) =>
        `• ${r.name} (${r.cuisine}, ${district ? r.district : `${Math.round(haversineM(loc.lat, loc.lng, r.lat, r.lng) / 100) / 10}km`})`
    );

  return `In ${label}, I have these cuisines:\n${list.join("\n")}\n\nTop spots:\n${venues.join("\n")}\n\nWant a table? Tell me cuisine, time, and party size — I'll book it for you.`;
}

function buildExecuteMessage(
  action: "order" | "reserve" | "share_only",
  best: Plan,
  intent: ParsedIntent,
  userText = ""
): string {
  const timeNote =
    action === "reserve"
      ? ` for ${resolveRestaurantReserveTime({ userText, reserveTime: intent.reserveTime })}`
      : "";
  const partyNote = action === "reserve" && intent.groupSize ? `, party of ${intent.groupSize}` : "";
  if (action === "share_only") {
    const party = Math.max(1, intent.groupSize || 1);
    const ticket = best.activity?.admissionPerPerson ?? 0;
    const ticketNote =
      ticket > 0 ? ` Tickets booked: ¥${ticket}/person (${party} people, total ¥${ticket * party}).` : "";
    const activityId = best.activity?.id;
    if (activityId) {
      const friendIds = USERS[CURRENT_USER_ID]?.friendIds ?? [];
      const friendsAlsoWant = getFriendsAlsoWant(activityId, friendIds);
      if (friendsAlsoWant.length > 0) {
        const topFriends = friendsAlsoWant.slice(0, 3).join(", ");
        return `Done — ${best.activity?.name ?? "your activity"} is booked (${best.matchScore}% match).${ticketNote} See Orders for confirmation.\n\nYour friends ${topFriends} also want to go there. Want me to invite them?`;
      }
    }
    return `Done — ${best.activity?.name ?? best.restaurant?.name ?? "your activity"} is booked (${best.matchScore}% match).${ticketNote} See Orders for confirmation.`;
  }
  return action === "reserve"
    ? `Done — I booked ${best.restaurant?.name ?? "the venue"}${timeNote}${partyNote} (${best.matchScore}% match). See Orders for confirmation.`
    : `Done — order placed at ${best.restaurant?.name ?? "the venue"} (${best.matchScore}% match). Track delivery on Orders.`;
}

function getContextPlan(context: ChatContext): Plan | undefined {
  if (context.chosenPlan) return context.chosenPlan;
  if (context.lastPlans?.length && context.lastPlanIndex != null) {
    return context.lastPlans[context.lastPlanIndex];
  }
  return context.lastPlans?.[0];
}

function resolveContextPlans(context: ChatContext, fallback?: Plan): Plan[] {
  if (context.lastPlans?.length) return context.lastPlans;
  if (context.chosenPlan) return [context.chosenPlan];
  if (fallback) return [fallback];
  const active = getActiveOutingPlan();
  return active ? [active] : [];
}

function handleDeliveryAddons(
  lastUser: string,
  userMessages: string[],
  intent: ParsedIntent,
  context: ChatContext,
  assistantMessage?: string,
  usedLlm?: boolean
): (ChatResponse & { intent: ParsedIntent }) | null {
  const plan =
    context.chosenPlan ?? getContextPlan(context) ?? getActiveOutingPlan() ?? undefined;
  if (!plan) return null;

  const applied = applyDeliveryAddonsFromMessage(plan, lastUser);
  if (!applied) return null;

  const { updatedPlan, message: confirm } = applied;
  const kinds = extractDeliveryAddonKinds(lastUser);

  setActiveOutingPlan(updatedPlan);

  if (context.planAccepted && context.acceptedOrderId) {
    addDeliveryAddonsToOrder(context.acceptedOrderId, kinds, { pushMessage: false });
  }

  const msg =
    assistantMessage && usedLlm
      ? `${assistantMessage}\n\n${confirm}`
      : context.planAccepted
        ? `${confirm}\n\n${POST_PLAN_FOLLOWUP_MESSAGE}`
        : `${confirm}\n\nI've added this to your plan preview — swipe right to book when ready.`;

  intent.deliveryAddonKinds = [
    ...new Set([...(intent.deliveryAddonKinds ?? []), ...kinds]),
  ] as DeliveryAddonKind[];

  const basePlans = resolveContextPlans(context, plan).map((p) =>
    p.id === updatedPlan.id ? updatedPlan : p
  );

  return {
    intent,
    showPlans: Boolean(context.hasPlans && !context.planAccepted),
    usedLlm,
    assistantMessage: msg,
    updatedPlan,
    result: basePlans.length
      ? {
          intent,
          plans: basePlans,
          currentTime: formatShanghaiTime(new Date()),
          timeLabel: TIME_LABELS[intent.timeOfDay] ?? "Today",
        }
      : undefined,
  };
}

function handleInviteFriends(
  lastUser: string,
  intent: ParsedIntent,
  context: ChatContext,
  assistantMessage?: string,
  usedLlm?: boolean
): (ChatResponse & { intent: ParsedIntent }) | null {
  const chosenPlan = getContextPlan(context);
  const { friendIds: parsedFriends, target } = parseInviteFromConversation(
    lastUser,
    chosenPlan,
    context.lastPlans
  );
  const friendIds =
    intent.inviteFriendIds?.length ? intent.inviteFriendIds
    : parsedFriends.length ? parsedFriends
    : extractFriendIdsFromText(lastUser);

  const activityId = intent.inviteActivityId ?? target.activityId;
  const restaurantId = target.restaurantId;

  if (!activityId && !restaurantId) {
    const hint = chosenPlan?.activity
      ? ` Your last pick was ${chosenPlan.activity.name} (${chosenPlan.activity.id}).`
      : chosenPlan?.restaurant
        ? ` Your reservation was at ${chosenPlan.restaurant.name} (${chosenPlan.restaurant.id}).`
        : "";
    return {
      intent,
      showPlans: Boolean(context.hasPlans || chosenPlan),
      usedLlm,
      assistantMessage:
        assistantMessage ??
        `Which place should I invite them to? Say "invite joshua and emil there too" right after you pick a plan or reserve.${hint}`,
    };
  }

  if (friendIds.length === 0) {
    return {
      intent,
      showPlans: Boolean(context.hasPlans || chosenPlan),
      usedLlm,
      assistantMessage:
        assistantMessage ??
        `Who should I invite? Try "invite joshua and emil there too" after you choose a plan or book a table.`,
    };
  }

  const validIds = friendIds.filter((id) => id);
  const { room, invalidIds } = inviteFriendsToVenue({
    friendIds: validIds,
    activityId,
    restaurantId: activityId ? target.restaurantId : restaurantId,
    planId: target.planId ?? chosenPlan?.id,
  });

  const invitedValid = validIds.filter((id) => !invalidIds.includes(id));
  const inviteMessage = formatInviteSuccessMessage(room, invitedValid, invalidIds);

  return {
    intent,
    showPlans: Boolean(context.hasPlans || chosenPlan),
    usedLlm,
    room,
    assistantMessage: assistantMessage && usedLlm
      ? `${assistantMessage}\n\n${inviteMessage}`
      : inviteMessage,
  };
}

function resolveAction(
  llmAction: LlmAction,
  intent: ParsedIntent,
  context: ChatContext
): LlmAction {
  if (llmAction === "invite_friends") return llmAction;
  if (llmAction !== "show_plans") return llmAction;
  if (intent.interactionMode === "direct_action" || intent.interactionMode === "follow_up") {
    return context.hasPlans ? "execute" : "show_plans";
  }
  return "show_plans";
}

export async function handle_chat(
  messages: ChatMessage[],
  context: ChatContext = {}
): Promise<ChatResponse & { intent: ParsedIntent }> {
  const userMessages = messages.filter((m) => m.role === "user").map((m) => m.text);
  const lastUser = userMessages[userMessages.length - 1] ?? "";

  let usedLlm = false;
  let assistantMessage: string | undefined;
  let action: LlmAction = "show_plans";
  let intent: ParsedIntent;

  const llmResult = await analyzeWithLlm(messages, context).catch(() => ({ usedLlm: false as const }));

  if (llmResult.usedLlm) {
    usedLlm = true;
    assistantMessage = llmResult.decision.assistantMessage;
    action = resolveAction(llmResult.decision.action, llmResult.intent, context);
    intent = llmResult.intent;
  } else {
    const rules = analyzeWithRules(messages);
    intent = rules.intent;
    action = rules.action;
    if (!isLlmConfigured()) {
      assistantMessage =
        "I'm running in basic mode (no API key). Add OPENAI_API_KEY to .env.local for real AI understanding. ";
    }
  }

  const combinedUserText = userMessages.join("\n");
  finalizeOutingPlanIntent(userMessages, intent);
  syncReserveTimeFromUserText(intent, combinedUserText);
  intent.timeOfDay = inferTimeOfDayFromClock(new Date(), combinedUserText);
  const activityTarget = findActivityMentionedInText(combinedUserText, ACTIVITIES);
  const mentionedFriendIds = extractFriendIdsFromText(combinedUserText);
  const explicitActivityBooking =
    Boolean(activityTarget) &&
    /book|reserve|ticket|tickets|buy\s+ticket|订票|门票|预订|book\s+.*(museum|park|activity|walk)/i.test(
      combinedUserText
    );
  const explicitSocialActivityPlan =
    Boolean(activityTarget) &&
    mentionedFriendIds.length > 0 &&
    /book|go|visit|for\s+both|for\s+us|with|join|一起|和.*去|跟.*去|带上/i.test(combinedUserText);
  if (activityTarget) {
    intent.includeActivities = true;
    if (
      /book|reserve|订|预约/i.test(combinedUserText) &&
      !/restaurant|餐厅|dinner|lunch|eat|吃饭/i.test(combinedUserText)
    ) {
      intent.includeRestaurant = false;
    }
  }
  if (explicitActivityBooking) {
    action = "execute";
    intent.includeActivities = true;
    intent.includeRestaurant = false;
    // Override LLM "can't book tickets" style replies with deterministic booking confirmation.
    assistantMessage = undefined;
  }
  if (explicitSocialActivityPlan) {
    action = "invite_friends";
    intent.wantsInviteFriends = true;
    intent.inviteActivityId = activityTarget?.id;
    intent.inviteFriendIds = [
      ...new Set([...(intent.inviteFriendIds ?? []), ...mentionedFriendIds]),
    ];
    // Prefer deterministic room creation response over generic planning chatter.
    assistantMessage = undefined;
  }

  const deliveryKinds = extractDeliveryAddonKinds(combinedUserText);
  if (deliveryKinds.length) {
    intent.deliveryAddonKinds = [
      ...new Set([...(intent.deliveryAddonKinds ?? []), ...deliveryKinds]),
    ] as DeliveryAddonKind[];
  }

  if (isDeliveryAddonRequest(lastUser) && (context.chosenPlan || context.planAccepted || context.hasPlans)) {
    const deliveryResponse = handleDeliveryAddons(
      lastUser,
      userMessages,
      intent,
      context,
      assistantMessage,
      usedLlm
    );
    if (deliveryResponse) return deliveryResponse;
    if (extractDeliveryAddonKinds(lastUser).length) {
      return {
        intent,
        showPlans: Boolean(context.hasPlans || context.planAccepted),
        usedLlm,
        assistantMessage:
          assistantMessage ??
          "I can deliver cakes, flowers, or gifts to a restaurant on your plan — choose a plan with a dining stop first.",
      };
    }
  }

  if (isInviteRequest(lastUser)) {
    action = "invite_friends";
  }

  const askingForNewPlans =
    isNewOutingPlanRequest(combinedUserText) || isNewOutingPlanRequest(lastUser) || intent.wantsFullItinerary;

  const planForBackup =
    askingForNewPlans ? undefined : getContextPlan(context) ?? getActiveOutingPlan() ?? undefined;
  const contingencyKind = askingForNewPlans ? null : detectContingency(lastUser);
  const contingency = askingForNewPlans ? null : applyPlanContingency(lastUser, planForBackup);
  if (contingency) {
    setActiveOutingPlan(contingency.plan);
    if (context.acceptedOrderId) {
      syncLinkedOrdersFromPlan(contingency.plan, { orderId: context.acceptedOrderId });
    } else if (planForBackup?.id) {
      syncLinkedOrdersFromPlan(contingency.plan);
    }
    const timeLabel = TIME_LABELS[intent.timeOfDay] ?? "Today";
    return {
      intent,
      showPlans: true,
      planContingency: true,
      usedLlm,
      assistantMessage: contingency.message,
      result: {
        intent,
        plans: [contingency.plan],
        currentTime: formatShanghaiTime(new Date()),
        timeLabel,
      },
    };
  }

  if (contingencyKind && planForBackup) {
    const fallbackMsg =
      contingencyKind === "weather_activity"
        ? "I couldn't find an indoor backup in the same district for that outdoor stop. Try asking for a mall or museum in " +
          (planForBackup.activity?.district ?? planForBackup.restaurant?.district ?? "your area") +
          "."
        : "I couldn't find another nearby restaurant with the same cuisine. Say a different cuisine or district and I'll search again.";
    return {
      intent,
      showPlans: false,
      usedLlm,
      assistantMessage: fallbackMsg,
    };
  }

  if (action === "converse") {
    const msg =
      assistantMessage ??
      "I'm Cultra — tell me what you'd like to eat or do in Shenzhen, and I can find spots, show plans, or book for you.";
    return { intent, showPlans: false, usedLlm, assistantMessage: msg };
  }

  if (action === "cuisine_info") {
    const msg = assistantMessage ? `${assistantMessage}\n\n${answerCuisineInfo(intent)}` : answerCuisineInfo(intent);
    return { intent, showPlans: false, usedLlm, assistantMessage: msg };
  }

  if (
    action === "invite_friends" ||
    intent.wantsInviteFriends ||
    isInviteRequest(lastUser)
  ) {
    const inviteResponse = handleInviteFriends(lastUser, intent, context, assistantMessage, usedLlm);
    if (inviteResponse) return inviteResponse;
  }

  const result = generate_plans(lastUser, new Date(), userMessages, intent);
  const mergedIntent = result.intent;

  const followUp = action === "execute" && context.hasPlans;
  const best =
    followUp && context.lastPlans?.length ? context.lastPlans[0] : result.plans[0];

  if (action === "execute" && best) {
    const reserve =
      Boolean(best.restaurant) &&
      mergedIntent.wantsReserve ||
      /book|reserve|预约|订/i.test(lastUser.toLowerCase());
    const execAction: "order" | "reserve" | "share_only" = best.restaurant
      ? reserve
        ? "reserve"
        : "order"
      : "share_only";
    const msg =
      assistantMessage && usedLlm
        ? assistantMessage
        : buildExecuteMessage(execAction, best, mergedIntent, combinedUserText);
    return {
      intent: mergedIntent,
      result,
      autoExecuted: true,
      executedAction: execAction,
      executedPlan: best,
      showPlans: false,
      usedLlm,
      assistantMessage: msg,
    };
  }

  const n = result.plans.length;
  const place = areaLabel(mergedIntent);

  if (n === 0) {
    const fallback = mergedIntent.wantsFullItinerary
      ? `I couldn't build a full-day plan in ${place} with the current filters. Try a nearby district, or say "family plan in ${place} without cuisine filter".`
      : (() => {
          const cuisines = listNearbyCuisines(
            mergedIntent.location,
            10000,
            mergedIntent.targetDistrict
          );
          return `I couldn't match every filter in ${place}, but you have: ${cuisines.slice(0, 6).join(", ")}. Try widening cuisine or distance.`;
        })();
    return {
      intent: mergedIntent,
      result,
      showPlans: false,
      usedLlm,
      assistantMessage: assistantMessage ?? fallback,
    };
  }

  if (context.oneStopAgent && result.plans.length > 0) {
    const best = result.plans[0];
    const restaurant = resolvePlanRestaurant(best);
    mergedIntent.oneStop = {
      reserve: Boolean(restaurant),
      partySize: mergedIntent.groupSize,
      reserveTime: mergedIntent.reserveTime,
      checkTraffic: true,
      remindMinutesBefore: 30,
    };
    const oneStop = {
      ...execute_one_stop({ ...mergedIntent, oneStop: mergedIntent.oneStop }, best, { previewOnly: true }),
      pendingReservation: Boolean(restaurant),
    };
    const place = areaLabel(mergedIntent);
    const name = best.summary ?? restaurant?.name ?? best.activity?.name ?? "your outing";
    setActiveOutingPlan(best);
    return {
      intent: mergedIntent,
      result: { ...result, intent: mergedIntent, plans: [best], oneStop },
      showPlans: true,
      oneStopAgent: true,
      usedLlm,
      assistantMessage:
        assistantMessage ??
        `One-Stop Agent picked the best match for ${place} (${result.timeLabel}): ${name}. Review below and confirm when ready.`,
    };
  }

  if (result.plans[0]) {
    setActiveOutingPlan(result.plans[0]);
  }

  const firstPlan = result.plans[0];
  const plansIntro = mergedIntent.wantsFullItinerary
    ? (firstPlan.summary ??
      `Here's your ${result.timeLabel} plan for ${place}. Swipe right to book · left for another option.`)
    : n === 1
      ? `Here's the best match in ${place} (${result.timeLabel}):`
      : `Here are ${n} options in ${place} (${result.timeLabel}):`;

  const addonNote =
    mergedIntent.deliveryAddonKinds?.length && firstPlan.deliveryAddons?.length
      ? `\n\n🎁 Included delivery: ${firstPlan.deliveryAddons.map((a) => a.label).join(", ")}.`
      : "";

  return {
    intent: mergedIntent,
    result,
    showPlans: true,
    usedLlm,
    assistantMessage: assistantMessage ?? `${plansIntro}${addonNote}`,
  };
}
