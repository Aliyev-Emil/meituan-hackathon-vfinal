import { NextRequest, NextResponse } from "next/server";
import { RESTAURANTS } from "@/lib/data/restaurants";
import {
  advanceOrderStatus,
  canSplitOrder,
  canSplitPlan,
  createOrder,
  createPlanSplitBill,
  createReservation,
  demoStore,
  getAllOrders,
  getOrderById,
  getSplitBillForOrder,
  getSplitBillForPlan,
  getCurrentUser,
} from "@/lib/store";
import { Plan } from "@/lib/types";
import { replyToOrderSupport } from "@/lib/llm/support_chat";
import { resolveRestaurantReserveTime } from "@/lib/utils/reserve_time";

function orderSummary(o: ReturnType<typeof getOrderById>) {
  if (!o) return null;
  const split = getSplitBillForOrder(o.id);
  const planSplit = o.planId ? getSplitBillForPlan(o.planId) : undefined;
  const splitStatus = split?.status ?? planSplit?.status ?? null;
  const canSplitOuting =
    o.type === "outing" && o.plan?.splitBillEligible && o.planId
      ? canSplitPlan(o.planId).allowed
      : false;

  return {
    id: o.id,
    restaurantName: o.displayTitle ?? o.restaurantName,
    type: o.type,
    status: o.status,
    amount: o.amount,
    createdAt: o.createdAt,
    reservedTime: o.reservedTime,
    partySize: o.partySize,
    planDistrict: o.plan?.planDistrict,
    splitStatus,
    canSplit: (canSplitOrder(o.id).allowed && o.type === "order") || canSplitOuting,
  };
}

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("id");

  if (orderId) {
    const order = getOrderById(orderId);
    if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
    const split = getSplitBillForOrder(orderId);
    const planSplit = order.planId ? getSplitBillForPlan(order.planId) : undefined;
    const check =
      order.type === "outing" && order.planId
        ? canSplitPlan(order.planId)
        : canSplitOrder(orderId);
    const canSplitOuting =
      order.type === "outing" && order.plan?.splitBillEligible && order.planId
        ? canSplitPlan(order.planId).allowed
        : false;
    return NextResponse.json({
      order,
      splitBill: split ?? planSplit ?? null,
      canSplit: (canSplitOrder(orderId).allowed && order.type === "order") || canSplitOuting,
      splitBlockReason: check.allowed ? null : check.reason ?? null,
    });
  }

  const orders = getAllOrders().map((o) => orderSummary(o));
  return NextResponse.json({ orders });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (body.action === "place") {
    const r = RESTAURANTS.find((x) => x.id === body.restaurantId);
    if (!r) return NextResponse.json({ error: "restaurant not found" }, { status: 404 });
    const reservedTime = resolveRestaurantReserveTime({
      userText: body.userText ?? body.message ?? "",
      reserveTime: body.reserveTime,
    });
    const order =
      body.type === "reservation"
        ? createReservation(r.id, r.name, r.lat, r.lng, reservedTime, body.partySize ?? 1)
        : createOrder(r.id, r.name, r.lat, r.lng);
    return NextResponse.json({ order });
  }

  const orderId = body.orderId as string | undefined;

  if (body.action === "tick") {
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
    const order = advanceOrderStatus(orderId);
    return NextResponse.json({ order });
  }

  if (body.action === "chat") {
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
    const order = getOrderById(orderId);
    if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
    const text = body.message as string;
    order.messages.push({ role: "user", text, at: new Date().toISOString() });
    const { reply, usedLlm } = await replyToOrderSupport(orderId, text);
    order.messages.push({ role: "agent", text: reply, at: new Date().toISOString() });
    const fresh = getOrderById(orderId);
    return NextResponse.json({ order: fresh ?? order, usedLlm });
  }

  if (body.action === "split_bill") {
    if (!orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
    const o = getOrderById(orderId);
    if (!o) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (o.type === "outing" && o.plan) {
      try {
        const bill = createPlanSplitBill(
          o.plan as Plan,
          body.friendIds ?? [],
          body.partySize ?? o.partySize ?? 1
        );
        return NextResponse.json({ bill });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Split failed" },
          { status: 400 }
        );
      }
    }

    const check = canSplitOrder(orderId);
    if (!check.allowed) {
      return NextResponse.json({ error: check.reason, bill: check.existing }, { status: 400 });
    }
    if (o.type !== "order") {
      return NextResponse.json({ error: "Only delivery orders can be split this way" }, { status: 400 });
    }
    const bill = {
      id: `split-${Date.now()}`,
      orderId,
      payerId: getCurrentUser().id,
      friendIds: body.friendIds ?? [],
      amount: body.amount ?? o.amount,
      accepted: Object.fromEntries((body.friendIds ?? []).map((id: string) => [id, false])),
      status: "pending" as const,
    };
    demoStore.splitBills.push(bill);
    return NextResponse.json({ bill });
  }

  if (body.action === "accept_split") {
    const bill = demoStore.splitBills.find((b) => b.id === body.billId);
    if (bill) {
      bill.accepted[body.friendId] = true;
      if (bill.friendIds.every((id) => bill.accepted[id])) bill.status = "completed";
    }
    return NextResponse.json({ bill });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
