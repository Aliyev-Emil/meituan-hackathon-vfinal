import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, demoStore } from "@/lib/store";
import { CURRENT_USER_ID } from "@/lib/data/users";
import { getNationalityOptions, isValidNationality } from "@/lib/nationality_cuisine";

export async function GET() {
  const user = getCurrentUser();
  return NextResponse.json({
    id: user.id,
    displayId: CURRENT_USER_ID,
    name: user.name,
    nation: user.nation ?? "Korean",
    nationalityOptions: getNationalityOptions(),
    region: "Guangdong",
    locationLabel: user.locationLabel,
    lat: user.lat,
    lng: user.lng,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    timezone: "Asia/Shanghai",
    locale: "zh-CN, en",
    friendCount: user.friendIds.length,
    favoritesCount: user.favorites.length,
    checkedActivitiesCount: user.checkedActivities.length,
    ordersCount: user.pastOrders.length,
  });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const me = demoStore.users[CURRENT_USER_ID];
  if (!me) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (typeof body.nation === "string" && body.nation.trim()) {
    const nation = body.nation.trim();
    if (!isValidNationality(nation)) {
      return NextResponse.json({ error: "Invalid nationality" }, { status: 400 });
    }
    me.nation = nation;
  }

  return NextResponse.json({
    ok: true,
    nation: me.nation ?? "Korean",
  });
}
