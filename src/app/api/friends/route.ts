import { NextRequest, NextResponse } from "next/server";
import { ACTIVITIES } from "@/lib/data/activities";
import { RESTAURANTS } from "@/lib/data/restaurants";
import { USERS, CURRENT_USER_ID } from "@/lib/data/users";
import { getFriendsAlsoWant } from "@/lib/tools/fetch_friend_history";
import { fetch_friend_history } from "@/lib/tools/fetch_friend_history";
import { haversineM } from "@/lib/tools/parse_intent";
import {
  acceptFriendRequest,
  addFriendRequest,
  demoStore,
  getCurrentUser,
  getRoomsForUser,
  createInviteRoom,
} from "@/lib/store";

const NEARBY_M = 4000;

export async function GET(req: NextRequest) {
  const profileId = req.nextUrl.searchParams.get("profile");
  if (profileId && USERS[profileId]) {
    const u = demoStore.users[profileId] ?? USERS[profileId];
    const wantToGo = u.favorites
      .map((aid) => ACTIVITIES.find((a) => a.id === aid))
      .filter(Boolean);
    return NextResponse.json({ profile: u, wantToGo });
  }

  const user = getCurrentUser();
  const isFriendWithAnyone = user.friendIds.length > 0;

  const activities = ACTIVITIES.map((a) => ({
    ...a,
    friendsAlsoWant: getFriendsAlsoWant(a.id, user.friendIds),
    inMyFavorites: user.favorites.includes(a.id),
    inMyChecked: user.checkedActivities.includes(a.id),
  }));

  const friendProfiles = user.friendIds.map((fid) => {
    const f = demoStore.users[fid];
    return f
      ? {
          id: f.id,
          name: f.name,
          avatarUrl: f.avatarUrl,
          bio: f.bio,
          locationLabel: f.locationLabel,
          favoritesCount: f.favorites.length,
        }
      : null;
  }).filter(Boolean);

  const circlePopular = isFriendWithAnyone
    ? ACTIVITIES.filter((a) =>
        user.friendIds.some(
          (fid) =>
            USERS[fid]?.favorites.includes(a.id) || USERS[fid]?.checkedActivities.includes(a.id)
        )
      ).map((a) => a.id)
    : [];

  return NextResponse.json({
    user,
    activities,
    friendProfiles,
    friendHistory: fetch_friend_history(user.friendIds),
    circlePopular,
    friendRequests: demoStore.friendRequests,
    invitations: demoStore.invitations,
    rooms: getRoomsForUser().map((room) => {
      const activity = room.activityId ? ACTIVITIES.find((a) => a.id === room.activityId) : undefined;
      const restaurant = room.restaurantId
        ? RESTAURANTS.find((r) => r.id === room.restaurantId)
        : undefined;
      return {
        ...room,
        activityImageUrl: activity?.imageUrl ?? restaurant?.imageUrl,
        activityDistrict: activity?.district ?? restaurant?.district,
      };
    }),
    allUserIds: Object.keys(USERS).filter((id) => id !== CURRENT_USER_ID),
    hasFriends: isFriendWithAnyone,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const user = getCurrentUser();

  if (body.action === "add_friend") {
    addFriendRequest(body.friendId);
    return NextResponse.json({ ok: true, message: "friend_request_sent" });
  }
  if (body.action === "accept_friend") {
    acceptFriendRequest(body.friendId);
    return NextResponse.json({ ok: true, message: "confirmed" });
  }
  if (body.action === "toggle_favorite") {
    const idx = user.favorites.indexOf(body.activityId);
    if (idx >= 0) user.favorites.splice(idx, 1);
    else user.favorites.push(body.activityId);
    return NextResponse.json({ favorites: user.favorites });
  }
  if (body.action === "check_activity") {
    if (!user.checkedActivities.includes(body.activityId)) {
      user.checkedActivities.push(body.activityId);
    }
    return NextResponse.json({ checked: user.checkedActivities });
  }
  if (body.action === "invite") {
    const room = createInviteRoom({
      activityId: body.activityId,
      friendIds: [body.friendId],
      message:
        body.message ??
        `Want to go to ${ACTIVITIES.find((a) => a.id === body.activityId)?.name ?? "this activity"} together?`,
    });
    const inv = demoStore.invitations.find(
      (i) => i.roomId === room.id && i.to === body.friendId
    );
    return NextResponse.json({ room, invitation: inv });
  }

  if (body.action === "friend_recommendations") {
    const near = (lat: number, lng: number, district: string) =>
      haversineM(user.lat, user.lng, lat, lng) <= NEARBY_M || district === "Nanshan";

    const recommendations: {
      id: string;
      name: string;
      cuisine?: string;
      cultureTag?: string;
      district?: string;
      pricePerPerson?: number;
      rating?: number;
      imageUrl: string;
      description: string;
      distanceM: number;
      type: "restaurant" | "activity";
      recommendedBy: string[];
    }[] = [];

    for (const fid of user.friendIds) {
      const friend = USERS[fid];
      if (!friend || !friend.friendIds.includes(CURRENT_USER_ID)) continue;

      for (const p of friend.purchaseHistory) {
        const r = RESTAURANTS.find((x) => x.id === p.venueId);
        if (!r || !near(r.lat, r.lng, r.district)) continue;
        const existing = recommendations.find((x) => x.id === r.id && x.type === "restaurant");
        if (existing) {
          if (!existing.recommendedBy.includes(friend.name)) existing.recommendedBy.push(friend.name);
        } else {
          recommendations.push({
            id: r.id,
            name: r.name,
            cuisine: r.cuisine,
            cultureTag: r.cultureTag,
            district: r.district,
            pricePerPerson: r.pricePerPerson,
            rating: r.rating,
            imageUrl: r.imageUrl,
            description: r.description,
            distanceM: Math.round(haversineM(user.lat, user.lng, r.lat, r.lng)),
            type: "restaurant",
            recommendedBy: [friend.name],
          });
        }
      }

      for (const aid of friend.favorites) {
        const a = ACTIVITIES.find((x) => x.id === aid);
        if (!a || !near(a.lat, a.lng, a.district)) continue;
        const existing = recommendations.find((x) => x.id === a.id && x.type === "activity");
        if (existing) {
          if (!existing.recommendedBy.includes(friend.name)) existing.recommendedBy.push(friend.name);
        } else {
          recommendations.push({
            id: a.id,
            name: a.name,
            district: a.district,
            rating: a.rating,
            imageUrl: a.imageUrl,
            description: a.description,
            distanceM: Math.round(haversineM(user.lat, user.lng, a.lat, a.lng)),
            type: "activity",
            recommendedBy: [friend.name],
          });
        }
      }
    }

    recommendations.sort((a, b) => a.distanceM - b.distanceM);

    return NextResponse.json({
      recommendations,
      basedOn: "friends' orders & favorites near Nanshan (≤4 km)",
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
