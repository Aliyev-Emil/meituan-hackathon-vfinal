import { Plan, ParsedIntent } from "../types";
import { priceMatchesTier } from "../utils/price_tier";
import { buildMatchReasons } from "../utils/match_reasons";
import { FriendHistory } from "./fetch_friend_history";
import { haversineM } from "./parse_intent";
import {
  check_queue_status,
  queueScoreFromStatus,
} from "./check_queue_status";
import {
  quietScoreFromReservationLoad,
} from "../utils/reservation_load";
import type { QueueStatus } from "../types";

function restaurantIdsInPlan(plan: Plan): string[] {
  const ids = new Set<string>();
  if (plan.restaurant) ids.add(plan.restaurant.id);
  plan.itinerary?.forEach((step) => {
    if (step.restaurant) ids.add(step.restaurant.id);
  });
  return [...ids];
}

function maxReservationLoadInPlan(plan: Plan): number | undefined {
  const loads: number[] = [];
  if (plan.restaurant) loads.push(plan.restaurant.reservationLoad);
  plan.itinerary?.forEach((step) => {
    if (step.restaurant) loads.push(step.restaurant.reservationLoad);
  });
  if (!loads.length) return undefined;
  return Math.max(...loads);
}

/** Use the longest wait among all restaurant stops — worst case for the outing. */
function worstQueueInPlan(plan: Plan): QueueStatus | undefined {
  const ids = restaurantIdsInPlan(plan);
  if (!ids.length) return plan.queue;

  let worst: QueueStatus | undefined;
  for (const id of ids) {
    const q = check_queue_status(id);
    if (!worst || q.waitMinutes > worst.waitMinutes) worst = q;
  }
  return worst;
}

export function rank_plans(plans: Plan[], intent: ParsedIntent, friendHistory: FriendHistory[]): Plan[] {
  return plans
    .map((plan) => {
      let preferenceMatch = 50;

      if (plan.restaurant) {
        const dist = haversineM(
          intent.location.lat,
          intent.location.lng,
          plan.restaurant.lat,
          plan.restaurant.lng
        );
        const distanceScore = Math.max(0, 100 - (dist / intent.distanceMaxM) * 100);
        plan.distanceScore = Math.round(distanceScore);

        if (intent.dietFriendly && plan.restaurant.dietScore >= 0.8) {
          preferenceMatch += 15;
        }
        if (intent.quietAmbiance && plan.restaurant) {
          const load = maxReservationLoadInPlan(plan) ?? plan.restaurant.reservationLoad;
          const quietScore = quietScoreFromReservationLoad(load);
          preferenceMatch += Math.round(quietScore * 0.22);
        } else if (intent.quietAmbiance && plan.restaurant?.quiet) {
          preferenceMatch += 10;
        }
        for (const fh of friendHistory) {
          if (fh.purchaseVenues.some((v) => v.id === plan.restaurant!.id)) {
            preferenceMatch += 12;
          }
        }
        if (
          intent.cuisines.length > 0 &&
          intent.cuisines.some((c) => plan.restaurant!.cuisine.includes(c) || plan.cultureTag.includes(c))
        ) {
          preferenceMatch += 15;
        }
        if (intent.priceTier && priceMatchesTier(plan.restaurant.pricePerPerson, intent.priceTier)) {
          preferenceMatch += 12;
        }
      }

      if (plan.activity) {
        for (const fh of friendHistory) {
          if (
            fh.checkedActivities.includes(plan.activity.id) ||
            fh.favorites.some((f) => f.id === plan.activity!.id)
          ) {
            preferenceMatch += 15;
          }
        }
      }

      preferenceMatch = Math.min(98, preferenceMatch + Math.floor(plan.distanceScore * 0.2));

      const queue = worstQueueInPlan(plan);
      let queueScore = 70;
      if (queue) {
        queueScore = queueScoreFromStatus(queue);
        plan.queue = queue;
      }

      plan.preferenceMatch = preferenceMatch;
      // Distance 30%, preferences 55%, queue 15% — long waits push plans down
      plan.matchScore = Math.round(
        plan.distanceScore * 0.3 + preferenceMatch * 0.55 + queueScore * 0.15
      );

      plan.matchReasons = buildMatchReasons(plan, intent, friendHistory, queue);

      if (!plan.whyPicked && plan.matchReasons.length > 0) {
        plan.whyPicked = `Picked because: ${plan.matchReasons.join(", ")}.`;
      } else if (plan.whyPicked && queue && queue.waitMinutes >= 20) {
        plan.whyPicked = `${plan.whyPicked} Note: ${queue.badge} at ${plan.restaurant?.name ?? "a restaurant stop"}.`;
      }
      return plan;
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}
