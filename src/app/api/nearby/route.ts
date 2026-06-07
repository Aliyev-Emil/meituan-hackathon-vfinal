import { NextResponse } from "next/server";
import { RESTAURANTS } from "@/lib/data/restaurants";
import { ACTIVITIES } from "@/lib/data/activities";
import { getCurrentUser } from "@/lib/store";
import { filterRestaurantsByNationality } from "@/lib/nationality_cuisine";
import { haversineM } from "@/lib/tools/parse_intent";

const NEARBY_M = 3500;
const LIST_SIZE = 3;

export async function GET() {
  const user = getCurrentUser();
  const nation = user.nation?.trim() || "Korean";

  const withDistance = RESTAURANTS.map((r) => ({
    ...r,
    distanceM: Math.round(haversineM(user.lat, user.lng, r.lat, r.lng)),
  }))
    .filter((r) => r.distanceM <= NEARBY_M || r.district === "Nanshan")
    .sort((a, b) => a.distanceM - b.distanceM);

  const nationalityRestaurants = filterRestaurantsByNationality(withDistance, nation).slice(
    0,
    LIST_SIZE
  );

  const nationalityIds = new Set(nationalityRestaurants.map((r) => r.id));
  const restaurants = withDistance
    .filter((r) => !nationalityIds.has(r.id))
    .slice(0, LIST_SIZE);

  const activities = ACTIVITIES.map((a) => ({
    ...a,
    distanceM: Math.round(haversineM(user.lat, user.lng, a.lat, a.lng)),
  }))
    .filter((a) => a.distanceM <= NEARBY_M || a.district === "Nanshan")
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 2);

  return NextResponse.json({
    locationLabel: user.locationLabel,
    nation,
    restaurants,
    nationalityRestaurants,
    activities,
  });
}
