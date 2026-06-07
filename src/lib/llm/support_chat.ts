import type { OrderRecord } from "../store";
import {
  getOrderById,
  getActiveOutingPlan,
  setActiveOutingPlan,
  syncOrderFromPlan,
  syncLinkedOrdersFromPlan,
  tryApplyDeliveryAddonsToOrder,
} from "../store";
import { applyPlanContingency, type ContingencyResult } from "../tools/plan_contingency";
import { USERS, CURRENT_USER_ID } from "../data/users";
import { ChatCompletionMessage, chatCompletionText, isLlmConfigured } from "./client";
import { formatDeliveryAddonList } from "../utils/delivery_addons";

function buildOrderContext(order: OrderRecord): string {
  const lines: string[] = [
    `Order id: ${order.id}`,
    `Type: ${order.type}`,
    `Status: ${order.status}`,
    `Title: ${order.displayTitle ?? order.restaurantName}`,
    `Amount: ¥${order.amount}`,
    `Party size: ${order.partySize ?? "unknown"}`,
  ];

  if (order.type === "reservation") {
    lines.push(`Reserved time: ${order.reservedTime ?? "TBD"}`);
    lines.push(`Restaurant: ${order.restaurantName} (${order.restaurantId})`);
  }

  if (order.type === "order") {
    lines.push(`Restaurant: ${order.restaurantName} (${order.restaurantId})`);
    lines.push(`ETA: ${order.etaMinutes} min`);
    lines.push(`Delivery progress: ${order.progressPercent}%`);
  }

  if (order.type === "outing" && order.plan) {
    const p = order.plan;
    lines.push(`Plan id: ${p.id}`);
    if (p.planDistrict) lines.push(`District: ${p.planDistrict}`);
    if (p.durationHours) lines.push(`Duration: ${p.durationHours}h`);
    if (p.estimatedTotal) lines.push(`Estimated total: ¥${p.estimatedTotal}`);
    if (p.splitBillEligible) lines.push(`Split bill eligible: yes (${p.paidStops?.length ?? 0} paid stops)`);

    if (p.itinerary?.length) {
      lines.push("Itinerary:");
      for (const step of p.itinerary) {
        if (step.kind === "travel") continue;
        const extra =
          step.kind === "activity" && step.activity
            ? ` [${step.activity.setting}, ${step.activity.district}]`
            : step.kind === "restaurant" && step.restaurant
              ? ` [${step.restaurant.cuisine}, ¥${step.restaurant.pricePerPerson}/pp, ${step.restaurant.district}]`
              : "";
        lines.push(`  - ${step.timeStart}: ${step.title}${extra}`);
      }
    }

    if (p.deliveryAddons?.length) {
      lines.push(`Delivery add-ons: ${formatDeliveryAddonList(p.deliveryAddons)}`);
    }
  }

  return lines.join("\n");
}

function applyContingencyToOrder(order: OrderRecord, contingency: ContingencyResult): void {
  const plan = contingency.plan;

  if (order.plan || order.type === "outing") {
    syncOrderFromPlan(order, plan);
    return;
  }

  setActiveOutingPlan(plan);

  if (contingency.swappedRestaurant) {
    const r = contingency.swappedRestaurant;
    order.restaurantId = r.id;
    order.restaurantName = r.name;
    order.restaurantLat = r.lat;
    order.restaurantLng = r.lng;
    order.displayTitle = r.name;
    const party = order.partySize ?? 1;
    order.amount = r.pricePerPerson * party;
  }

  if (order.type === "outing" && !order.plan) {
    syncOrderFromPlan(order, plan);
  }
}

function tryApplyContingency(order: OrderRecord, userMessage: string): string | null {
  const planForChat = order.plan ?? getActiveOutingPlan() ?? undefined;
  if (order.plan) setActiveOutingPlan(order.plan);

  const contingency = applyPlanContingency(userMessage, planForChat, {
    orderRestaurantId: order.restaurantId,
  });
  if (!contingency) return null;

  applyContingencyToOrder(order, contingency);
  return contingency.message;
}

/** Rule-based fallback when LLM is unavailable */
export function getOrderChatReplyRules(order: OrderRecord, userMessage: string): string {
  const o = order;
  const lower = userMessage.toLowerCase();

  if (o.type === "outing") {
    const plan = o.plan;

    if (/itinerary|schedule|timeline|plan|行程|安排/i.test(lower) && plan?.itinerary?.length) {
      const lines = plan.itinerary
        .filter((s) => s.kind !== "travel")
        .map((s) => `${s.timeStart}: ${s.title}${s.subtitle ? ` (${s.subtitle})` : ""}`);
      return `Here's your saved plan:\n${lines.join("\n")}`;
    }

    if (/reserve|book|订|预约|table/i.test(lower) && plan?.restaurant) {
      return `Main restaurant on your plan: ${plan.restaurant.name}. Say "reserve for 7pm" and I'll update the booking note.`;
    }

    if (/change|swap|similar cuisine|replace|换个|换一家/i.test(lower)) {
      return 'Say e.g. "change the restaurant with a similar cuisine" or "swap the activity" and I\'ll pick a nearby backup.';
    }

    if (/rain|backup|crowd|sold out|busy/i.test(lower)) {
      return 'Tell me what\'s wrong (e.g. "it\'s raining" or "restaurant is crowded") and I\'ll swap in a backup from your plan\'s area.';
    }

    if (/split|bill|AA|分摊/i.test(lower) && plan?.splitBillEligible) {
      return `This outing is about ¥${plan.estimatedTotal} total across ${plan.paidStops?.length ?? "several"} paid stops — use Split bill on this page.`;
    }

    return `I'm here for your ${o.displayTitle ?? "outing"} — rain backups, restaurant swaps, reservations, or plan tweaks. What do you need?`;
  }

  if (o.type === "reservation") {
    if (/when|time|几点|什么时候/.test(lower)) {
      return `Your table is reserved for ${o.reservedTime ?? "the booked time"} at ${o.restaurantName}.`;
    }
    if (/cancel|取消/i.test(lower)) return "Reservation can be changed up to 2 hours before.";
    return `Reservation at ${o.restaurantName} for ${o.reservedTime}, party of ${o.partySize}.`;
  }

  if (o.status === "delivered") {
    return `Your order from ${o.restaurantName} was delivered. Enjoy!`;
  }

  if (/where|在哪|位置|location/i.test(lower)) {
    const dist =
      o.status === "preparing"
        ? "still at the restaurant"
        : o.status === "on_the_way"
          ? "en route"
          : "almost at your door";
    return `Rider is ${dist}.`;
  }

  if (/eta|多久|when|什么时候|min/i.test(lower)) {
    if (o.etaMinutes <= 0) return "Food has arrived!";
    return `Estimated ${o.etaMinutes} minutes remaining. Status: ${o.status.replace(/_/g, " ")}.`;
  }

  if (/late|delay|慢/i.test(lower)) {
    return o.etaMinutes > 15 ? "Delay noted — rider notified." : "On track — rider is close.";
  }

  if (/cancel|取消/i.test(lower)) {
    return o.status === "preparing"
      ? "Cancel within 3 minutes at no charge."
      : "Order is on the way — contact support.";
  }

  const defaults: Record<string, string> = {
    preparing: `Kitchen preparing. ~${o.etaMinutes} min until pickup.`,
    on_the_way: `Rider heading to you — ~${o.etaMinutes} min.`,
    arriving: `Rider nearby — ~${o.etaMinutes} min.`,
    delivered: "Delivered!",
  };
  return defaults[o.status] ?? "Checking status…";
}

function buildSupportSystemPrompt(order: OrderRecord, contingencyNote?: string): string {
  const user = USERS[CURRENT_USER_ID];
  return `You are Cultra, Meituan's AI support agent for Shenzhen. You are helping ${user.name} with ONE active order/outing in the support chat.

Capabilities you can explain (backups are applied automatically when they ask to change/swap restaurants or activities, mention similar cuisine, rain, crowds, or sold-out dishes):
- Outing plans: itinerary, reservations, restaurant swap (similar cuisine nearby), activity swap, rain → indoor backup, bill splitting
- Delivery add-ons to the restaurant: cake, flowers, champagne, gifts, balloons (applied automatically when they ask)
- Reservations: time, party size, changes
- Delivery orders: ETA, rider status (use only the facts below)

Rules:
- Reply in the same language the user uses (English or Chinese).
- Be warm, concise, and specific. Use the order facts below — do not invent venues or times not listed.
- If a backup was just applied, confirm it clearly and mention the new stop.
- For split bill, tell them to use the "Split bill" button on this page when eligible.
${contingencyNote ? `\n[System: A backup was just applied — incorporate this in your reply]\n${contingencyNote}` : ""}

--- Order context ---
${buildOrderContext(order)}
---`;
}

async function replyWithLlm(
  order: OrderRecord,
  userMessage: string,
  contingencyNote?: string
): Promise<string> {
  const system = buildSupportSystemPrompt(order, contingencyNote);
  const history: ChatCompletionMessage[] = [{ role: "system", content: system }];

  const recent = order.messages.slice(-12);
  for (const m of recent) {
    history.push({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    });
  }

  if (!recent.length || recent[recent.length - 1]?.text !== userMessage) {
    history.push({ role: "user", content: userMessage });
  }

  return chatCompletionText(history, { temperature: 0.45 });
}

export async function replyToOrderSupport(
  orderId: string,
  userMessage: string
): Promise<{ reply: string; usedLlm: boolean }> {
  const order = getOrderById(orderId);
  if (!order) return { reply: "Order not found.", usedLlm: false };

  const deliveryReply = tryApplyDeliveryAddonsToOrder(order, userMessage);
  if (deliveryReply) {
    const followUp =
      "\n\nAnything else for this outing? I can add more delivery items or help with backups.";
    return { reply: `${deliveryReply.reply}${followUp}`, usedLlm: false };
  }

  const contingencyReply = tryApplyContingency(order, userMessage);
  if (contingencyReply) {
    return { reply: contingencyReply, usedLlm: false };
  }

  if (isLlmConfigured()) {
    try {
      const reply = await replyWithLlm(order, userMessage);
      return { reply, usedLlm: true };
    } catch {
      return { reply: getOrderChatReplyRules(order, userMessage), usedLlm: false };
    }
  }
  return { reply: getOrderChatReplyRules(order, userMessage), usedLlm: false };
}
