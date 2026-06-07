import { NextResponse } from "next/server";
import { RESTAURANTS } from "@/lib/data/restaurants";
import { ACTIVITIES } from "@/lib/data/activities";

export async function GET() {
  return NextResponse.json({ restaurants: RESTAURANTS, activities: ACTIVITIES });
}
