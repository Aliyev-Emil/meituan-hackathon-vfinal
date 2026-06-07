import { ParsedIntent, Plan, Restaurant } from "../types";
import { resolveRestaurantReserveTime } from "../utils/reserve_time";
import { USERS, CURRENT_USER_ID } from "../data/users";

export interface OneStopResult {
  reservation?: {
    venue: string;
    venueId?: string;
    time: string;
    partySize: number;
    confirmed: boolean;
  };
  traffic?: { route: string; etaMinutes: number; congestion: string };
  reminder?: { minutesBefore: number; message: string; scheduled: boolean };
}

export function resolvePlanRestaurant(plan?: Plan): Restaurant | undefined {
  if (!plan) return undefined;
  if (plan.restaurant) return plan.restaurant;
  return plan.itinerary?.find((s) => s.kind === "restaurant")?.restaurant;
}

function trafficRoute(intent: ParsedIntent, restaurant?: Restaurant): string {
  const from = intent.location.label.split(",")[0]?.trim() || "Home";
  const to = restaurant?.district ?? intent.targetDistrict ?? "destination";
  return `${from} → ${to}`;
}

function estimateTrafficMinutes(intent: ParsedIntent, restaurant?: Restaurant): number {
  if (!restaurant) return 22;
  const user = USERS[CURRENT_USER_ID];
  const dLat = Math.abs(user.lat - restaurant.lat);
  const dLng = Math.abs(user.lng - restaurant.lng);
  const roughKm = Math.sqrt(dLat * dLat + dLng * dLng) * 111;
  return Math.max(12, Math.min(45, Math.round(roughKm * 8 + 10)));
}

export function execute_one_stop(
  intent: ParsedIntent,
  plan?: Plan,
  options?: { previewOnly?: boolean }
): OneStopResult {
  const result: OneStopResult = {};
  const os = intent.oneStop;
  const shouldReserve = Boolean(os?.reserve || intent.wantsReserve);
  if (!os && !shouldReserve) return result;

  const restaurant = resolvePlanRestaurant(plan);

  if (shouldReserve && restaurant) {
    result.reservation = {
      venue: restaurant.name,
      venueId: restaurant.id,
      time: resolveRestaurantReserveTime({
        userText: intent.raw,
        reserveTime: os?.reserveTime ?? intent.reserveTime,
      }),
      partySize: os?.partySize ?? intent.groupSize,
      confirmed: !options?.previewOnly,
    };
  }

  if (os?.checkTraffic) {
    const eta = estimateTrafficMinutes(intent, restaurant);
    result.traffic = {
      route: trafficRoute(intent, restaurant),
      etaMinutes: eta,
      congestion: eta >= 30 ? "Moderate — leave 10 min early" : "Light — on time if you leave as planned",
    };
  }

  if (os?.remindMinutesBefore) {
    const venue = restaurant?.name ?? "your reservation";
    result.reminder = {
      minutesBefore: os.remindMinutesBefore,
      message: `Reminder: leave in ${os.remindMinutesBefore} minutes for ${venue}.`,
      scheduled: true,
    };
  }

  return result;
}
