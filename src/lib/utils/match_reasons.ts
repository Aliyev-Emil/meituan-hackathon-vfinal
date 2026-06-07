import type { ParsedIntent, Plan, QueueStatus } from "../types";
import { priceMatchesTier } from "./price_tier";
import { TIME_LABELS } from "./time";
import type { FriendHistory } from "../tools/fetch_friend_history";
import {
  quietScoreFromReservationLoad,
  reservationAvailabilityNote,
} from "./reservation_load";

function maxReservationLoadInPlan(plan: Plan): number | undefined {
  const loads: number[] = [];
  if (plan.restaurant) loads.push(plan.restaurant.reservationLoad);
  plan.itinerary?.forEach((step) => {
    if (step.restaurant) loads.push(step.restaurant.reservationLoad);
  });
  if (!loads.length) return undefined;
  return Math.max(...loads);
}

/** Human-readable bullets explaining why a plan earned its match score. */
export function buildMatchReasons(
  plan: Plan,
  intent: ParsedIntent,
  friendHistory: FriendHistory[],
  queue?: QueueStatus
): string[] {
  const reasons: string[] = [];

  if (plan.distanceScore >= 70) {
    reasons.push("Within preferred travel distance");
  } else if (plan.distanceScore >= 45) {
    reasons.push("Reasonable distance from you");
  }

  const q = queue ?? plan.queue;
  if (q) {
    if (q.waitMinutes === 0 && q.hasSeats) {
      reasons.push("Restaurant available immediately");
    } else if (q.waitMinutes <= 10) {
      reasons.push(`Short wait time (~${q.waitMinutes} min)`);
    } else if (q.waitMinutes <= 20) {
      reasons.push(`~${q.waitMinutes} min wait at the restaurant`);
    }
  }

  if (plan.estimatedPerPerson != null && intent.budgetMax > 0) {
    if (plan.estimatedPerPerson <= intent.budgetMax) {
      reasons.push("Fits estimated budget");
    }
  } else if (plan.restaurant && plan.restaurant.pricePerPerson <= intent.budgetMax) {
    reasons.push("Fits estimated budget");
  }

  if (intent.cuisines.length > 0 && plan.restaurant) {
    const matched = intent.cuisines.find(
      (c) => plan.restaurant!.cuisine.includes(c) || plan.cultureTag.includes(c)
    );
    if (matched) {
      reasons.push(`Matches your ${matched} preference`);
    }
  } else if (plan.restaurant?.cuisine) {
    reasons.push(`Great ${plan.restaurant.cuisine.toLowerCase()} fit`);
  }

  if (intent.dietFriendly && plan.dietFriendly) {
    reasons.push("Good diet-friendly options");
  }

  if (intent.quietAmbiance && plan.restaurant) {
    const load = maxReservationLoadInPlan(plan) ?? plan.restaurant.reservationLoad;
    const avail = reservationAvailabilityNote(load);
    if (avail) {
      reasons.push(avail.charAt(0).toUpperCase() + avail.slice(1));
    } else if (plan.restaurant.quiet || quietScoreFromReservationLoad(load) >= 60) {
      reasons.push("Quiet ambiance");
    }
  }

  if (intent.priceTier && plan.restaurant && priceMatchesTier(plan.restaurant.pricePerPerson, intent.priceTier)) {
    const tierLabel =
      intent.priceTier === "cheap" ? "budget-friendly" : intent.priceTier === "expensive" ? "premium" : "mid-range";
    reasons.push(`In your ${tierLabel} price range`);
  }

  if (plan.restaurant) {
    for (const fh of friendHistory) {
      if (fh.purchaseVenues.some((v) => v.id === plan.restaurant!.id)) {
        reasons.push(`${fh.friendName} orders here often`);
        break;
      }
    }
  }

  if (plan.activity) {
    for (const fh of friendHistory) {
      if (
        fh.checkedActivities.includes(plan.activity.id) ||
        fh.favorites.some((f) => f.id === plan.activity!.id)
      ) {
        reasons.push(`${fh.friendName} wants to go here`);
        break;
      }
    }
  }

  if (
    intent.scenario === "family" &&
    (plan.restaurant?.familyFriendly || plan.activity?.familyFriendly)
  ) {
    reasons.push("Good for families");
  }

  if (intent.targetDistrict && plan.planDistrict === intent.targetDistrict) {
    reasons.push(`All in ${intent.targetDistrict} as requested`);
  } else if (plan.planDistrict) {
    reasons.push(`Stays in ${plan.planDistrict}`);
  }

  if (plan.itinerary && plan.itinerary.length >= 2) {
    reasons.push("Full timed itinerary for your outing");
  }

  if (plan.activity && !plan.itinerary?.length) {
    reasons.push(`${plan.activity.name} fits your ${TIME_LABELS[intent.timeOfDay].toLowerCase()} window`);
  }

  if (plan.restaurant && plan.restaurant.rating >= 4.5) {
    reasons.push(`Highly rated (${plan.restaurant.rating}★)`);
  }

  const unique = [...new Set(reasons)];

  if (unique.length === 0) {
    if (plan.matchScore >= 70) unique.push("Strong overall fit for your request");
    else if (plan.distanceScore >= 50) unique.push("Within preferred travel distance");
    else unique.push("Best available option for your request");
  }

  return unique.slice(0, 5);
}
