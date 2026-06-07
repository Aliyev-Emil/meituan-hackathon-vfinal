import { NextRequest, NextResponse } from "next/server";
import { send_plan_message } from "@/lib/tools/send_plan_message";
import { execute_one_stop } from "@/lib/tools/one_stop_agent";
import { USERS, CURRENT_USER_ID } from "@/lib/data/users";
import { ParsedIntent, Plan } from "@/lib/types";
import { acceptPlan } from "@/lib/store";
import { resolveRestaurantReserveTime } from "@/lib/utils/reserve_time";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { plan, recipients, action, reserveTime, partySize, oneStop: oneStopFlags, userText } = body;
  const p = plan as Plan;
  const share = send_plan_message(p, recipients ?? ["wife", "friends"]);

  const execAction = (action ?? "share_only") as "order" | "reserve" | "share_only";
  const conversationText = (userText as string) ?? "";
  const resolvedReserveTime =
    execAction === "reserve"
      ? resolveRestaurantReserveTime({ userText: conversationText, reserveTime })
      : undefined;

  const order = acceptPlan(p, execAction, {
    reserveTime: resolvedReserveTime,
    partySize: partySize ?? 1,
  });

  const user = USERS[CURRENT_USER_ID];
  const wantsReserve = execAction === "reserve";
  const intent: ParsedIntent = {
    raw: conversationText,
    keywords: [],
    scenario: "solo",
    groupSize: partySize ?? 1,
    includeActivities: Boolean(p.activity || p.itinerary?.some((s) => s.kind === "activity")),
    includeRestaurant: Boolean(p.restaurant || p.itinerary?.some((s) => s.kind === "restaurant")),
    cuisines: [],
    budgetMin: 50,
    budgetMax: 280,
    ratingMin: 3.8,
    distanceMaxM: 8000,
    dietFriendly: false,
    quietAmbiance: false,
    familyFriendly: false,
    timeOfDay: "afternoon",
    location: { lat: user.lat, lng: user.lng, label: user.locationLabel },
    friendIds: user.friendIds,
    wantsReserve,
    wantsOrder: execAction === "order",
    wantsPlansExplicit: false,
    wantsFullItinerary: Boolean(p.itinerary?.length),
    interactionMode: "direct_action",
    reserveTime: resolvedReserveTime,
    oneStop: {
      reserve: wantsReserve || Boolean(oneStopFlags?.reserve),
      partySize: partySize ?? 1,
      reserveTime: resolvedReserveTime,
      checkTraffic: Boolean(oneStopFlags?.checkTraffic),
      remindMinutesBefore: oneStopFlags?.remindMinutesBefore,
    },
  };

  const oneStop = execute_one_stop(intent, p);

  return NextResponse.json({
    share,
    order,
    action: execAction,
    oneStop,
    reserveTime: resolvedReserveTime,
  });
}
