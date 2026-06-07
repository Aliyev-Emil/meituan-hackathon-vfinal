import { ACTIVITIES } from "../data/activities";
import { RESTAURANTS } from "../data/restaurants";
import { CURRENT_USER_ID, USERS } from "../data/users";
import { Activity, ActivityRoom, Plan, Restaurant } from "../types";
import { extractFriendIdsFromText, isInviteRequest } from "../utils/friend_ids";
import { createInviteRoom } from "../store";

export interface InviteTarget {
  activityId?: string;
  activity?: Activity;
  restaurantId?: string;
  restaurant?: Restaurant;
  planId?: string;
}

function refersToChosenVenue(text: string): boolean {
  return (
    isInviteRequest(text) ||
    /there|too|also|it\b|this\s+one|that\s+one|第一个|上面|那个|just\s+(booked|reserved|picked|chose)|my\s+(plan|reservation|table)/i.test(
      text
    )
  );
}

export function resolveInviteTarget(
  text: string,
  chosenPlan?: Plan,
  lastPlans?: Plan[]
): InviteTarget {
  const explicitActivity = text.match(/\b(a\d+)\b/i);
  if (explicitActivity) {
    const a = ACTIVITIES.find((x) => x.id === explicitActivity[1].toLowerCase());
    if (a) return { activityId: a.id, activity: a };
  }

  const explicitRestaurant = text.match(/\b(r\d+)\b/i);
  if (explicitRestaurant) {
    const r = RESTAURANTS.find((x) => x.id === explicitRestaurant[1].toLowerCase());
    if (r) return { restaurantId: r.id, restaurant: r };
  }

  for (const a of ACTIVITIES) {
    if (text.toLowerCase().includes(a.name.toLowerCase())) {
      return { activityId: a.id, activity: a, planId: chosenPlan?.id };
    }
  }

  for (const r of RESTAURANTS) {
    if (text.toLowerCase().includes(r.name.toLowerCase())) {
      return { restaurantId: r.id, restaurant: r, planId: chosenPlan?.id };
    }
  }

  const plan = chosenPlan ?? lastPlans?.[0];
  if (plan && refersToChosenVenue(text)) {
    const actFromItinerary = plan.itinerary?.find((s) => s.activity)?.activity;
    const restFromItinerary = plan.itinerary?.find((s) => s.restaurant)?.restaurant;

    if (plan.activity || actFromItinerary) {
      const activity = plan.activity ?? actFromItinerary!;
      const restaurant = plan.restaurant ?? restFromItinerary;
      return {
        activityId: activity.id,
        activity,
        restaurantId: restaurant?.id,
        restaurant,
        planId: plan.id,
      };
    }

    if (plan.restaurant || restFromItinerary) {
      const restaurant = plan.restaurant ?? restFromItinerary!;
      return { restaurantId: restaurant.id, restaurant, planId: plan.id };
    }
  }

  return {};
}

export function inviteFriendsToVenue(params: {
  friendIds: string[];
  activityId?: string;
  restaurantId?: string;
  message?: string;
  planId?: string;
}): { room: ActivityRoom; invalidIds: string[] } {
  const valid = params.friendIds.filter((id) => USERS[id] && id !== CURRENT_USER_ID);
  const invalidIds = params.friendIds.filter((id) => !valid.includes(id));

  const room = createInviteRoom({
    activityId: params.activityId,
    restaurantId: params.restaurantId,
    friendIds: valid,
    message: params.message,
    planId: params.planId,
  });

  return { room, invalidIds };
}

export function formatInviteSuccessMessage(
  room: ActivityRoom,
  friendIds: string[],
  invalidIds: string[]
): string {
  const names = friendIds.map((id) => USERS[id]?.name ?? `@${id}`).join(", ");
  const venueLabel =
    room.venueKind === "restaurant"
      ? `dinner at ${room.restaurantName ?? room.activityName}`
      : room.restaurantName
        ? `${room.activityName} (then ${room.restaurantName})`
        : room.activityName;
  let msg = `Created a room for ${venueLabel} and invited ${names}.`;
  msg += `\n\nView the room on Friends → Rooms (ID: ${room.id}).`;
  if (invalidIds.length) {
    msg += `\n(Couldn't find: ${invalidIds.join(", ")})`;
  }
  return msg;
}

export function parseInviteFromConversation(
  text: string,
  chosenPlan?: Plan,
  lastPlans?: Plan[]
): {
  friendIds: string[];
  target: InviteTarget;
} {
  return {
    friendIds: extractFriendIdsFromText(text),
    target: resolveInviteTarget(text, chosenPlan, lastPlans),
  };
}
