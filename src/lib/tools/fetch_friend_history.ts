import { USERS, CURRENT_USER_ID } from "../data/users";
import { RESTAURANTS } from "../data/restaurants";
import { ACTIVITIES } from "../data/activities";

export interface FriendHistory {
  friendId: string;
  friendName: string;
  favorites: { id: string; name: string; type: "activity" }[];
  checkedActivities: string[];
  purchaseVenues: { id: string; name: string; cuisine: string }[];
  isFriend: boolean;
}

export function fetch_friend_history(friendIds: string[]): FriendHistory[] {
  const current = USERS[CURRENT_USER_ID];
  return friendIds.map((fid) => {
    const friend = USERS[fid];
    if (!friend) {
      return {
        friendId: fid,
        friendName: fid,
        favorites: [],
        checkedActivities: [],
        purchaseVenues: [],
        isFriend: false,
      };
    }
    const isFriend =
      current.friendIds.includes(fid) && friend.friendIds.includes(CURRENT_USER_ID);

    const purchaseVenues = isFriend
      ? friend.purchaseHistory.map((p) => {
          const r = RESTAURANTS.find((x) => x.id === p.venueId);
          return r
            ? { id: r.id, name: r.name, cuisine: r.cuisine }
            : { id: p.venueId, name: p.venueId, cuisine: "unknown" };
        })
      : [];

    const favorites = friend.favorites
      .map((aid) => ACTIVITIES.find((a) => a.id === aid))
      .filter(Boolean)
      .map((a) => ({ id: a!.id, name: a!.name, type: "activity" as const }));

    return {
      friendId: fid,
      friendName: friend.name,
      favorites,
      checkedActivities: friend.checkedActivities,
      purchaseVenues,
      isFriend,
    };
  });
}

export function getFriendsAlsoWant(activityId: string, friendIds: string[]): string[] {
  const names: string[] = [];
  for (const fid of friendIds) {
    const f = USERS[fid];
    if (f?.favorites.includes(activityId) || f?.checkedActivities.includes(activityId)) {
      names.push(f.name);
    }
  }
  return names;
}
