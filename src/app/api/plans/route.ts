import { NextRequest, NextResponse } from "next/server";
import { handle_chat, ChatMessage } from "@/lib/agent/handle_chat";
import { acceptPlan, createPlanSplitBill } from "@/lib/store";
import { Plan } from "@/lib/types";
import { plansFromRestaurantIds } from "@/lib/tools/plan_from_restaurant";
import { resolveRestaurantReserveTime } from "@/lib/utils/reserve_time";

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "show_restaurants") {
    const ids = (body.restaurantIds as string[]) ?? [];
    const result = plansFromRestaurantIds(ids);
    if (!result) {
      return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
    }
    return NextResponse.json({ result });
  }

  if (body.action === "split_plan_bill") {
    try {
      const plan = body.plan as Plan;
      const friendIds = (body.friendIds as string[]) ?? [];
      const groupSize = (body.groupSize as number) ?? 1;
      const bill = createPlanSplitBill(plan, friendIds, groupSize);
      const perPerson = Math.round(bill.amount / Math.max(1, 1 + friendIds.length));
      return NextResponse.json({
        bill,
        message: `Split ¥${bill.amount} outing bill with ${friendIds.map((id) => `@${id}`).join(", ")} — about ¥${perPerson} each.`,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Split failed" },
        { status: 400 }
      );
    }
  }

  const messages: ChatMessage[] = body.messages ?? [{ role: "user", text: body.message ?? "" }];
  const context = body.context ?? {};

  const chat = await handle_chat(messages, context);

  let order = null;
  if (chat.autoExecuted && chat.executedPlan) {
    const p = chat.executedPlan;
    const execAction: "order" | "reserve" | "share_only" =
      chat.executedAction === "reserve"
        ? "reserve"
        : chat.executedAction === "share_only"
          ? "share_only"
          : "order";
    const userText = messages.filter((m) => m.role === "user").map((m) => m.text).join("\n");
    const reserveTime =
      execAction === "reserve"
        ? resolveRestaurantReserveTime({ userText, reserveTime: chat.intent.reserveTime })
        : undefined;
    order = acceptPlan(p, p.restaurant ? execAction : "share_only", {
      reserveTime,
      partySize: chat.intent.groupSize ?? 1,
    });
  }

  return NextResponse.json({ ...chat, order });
}
