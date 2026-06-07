import { ACTIVITIES } from "./data/activities";
import { RESTAURANTS } from "./data/restaurants";
import {
  FriendRequest,
  Plan,
  SplitBillRequest,
  UserProfile,
  ActivityRoom,
  ActivityInvitation,
} from "./types";
import { USERS, CURRENT_USER_ID } from "./data/users";
import {
  attachDeliveryAddonsToPlan,
  applyDeliveryAddonsFromMessage,
  extractDeliveryAddonKinds,
  formatDeliveryAddonList,
  isDeliveryAddonRequest,
} from "./utils/delivery_addons";
import { enrichPlanCosts } from "./utils/plan_cost";
import type { DeliveryAddonKind } from "./types";

export type OrderStatus =
  | "preparing"
  | "on_the_way"
  | "arriving"
  | "delivered"
  | "reserved"
  | "active";

export type OrderType = "order" | "reservation" | "outing";

export interface OrderRecord {
  id: string;
  restaurantId: string;
  restaurantName: string;
  /** Shorter label for list (outing plans) */
  displayTitle?: string;
  type: OrderType;
  status: OrderStatus;
  planId?: string;
  plan?: Plan;
  /** Bumps when plan/restaurants/activities are swapped via support chat */
  planUpdatedAt?: string;
  restaurantLat: number;
  restaurantLng: number;
  riderLat: number;
  riderLng: number;
  userLat: number;
  userLng: number;
  etaMinutes: number;
  progressPercent: number;
  amount: number;
  reservedTime?: string;
  partySize?: number;
  messages: { role: "user" | "agent"; text: string; at: string }[];
  createdAt: string;
}

type StoreData = {
  users: Record<string, UserProfile>;
  friendRequests: FriendRequest[];
  splitBills: SplitBillRequest[];
  orders: OrderRecord[];
  activeOrderId: string | null;
  invitations: ActivityInvitation[];
  rooms: ActivityRoom[];
  /** Latest outing plan (for backup swaps in support chat) */
  activeOutingPlan: Plan | null;
};

const g = globalThis as typeof globalThis & { __cultraStore?: StoreData };

function seedOrders(): OrderRecord[] {
  const user = USERS[CURRENT_USER_ID];
  return [
    {
      id: "ord-demo-1",
      restaurantId: "r1",
      restaurantName: "Din Tai Fung",
      type: "order",
      status: "delivered",
      restaurantLat: 22.517,
      restaurantLng: 113.934,
      riderLat: user.lat,
      riderLng: user.lng,
      userLat: user.lat,
      userLng: user.lng,
      etaMinutes: 0,
      progressPercent: 100,
      amount: 360,
      messages: [{ role: "agent", text: "Delivered. Hope you enjoyed!", at: "2026-05-18T14:00:00Z" }],
      createdAt: "2026-05-18T14:00:00Z",
    },
    {
      id: "res-demo-1",
      restaurantId: "r3",
      restaurantName: "Cantonese Garden",
      type: "reservation",
      status: "reserved",
      restaurantLat: 22.545,
      restaurantLng: 114.118,
      riderLat: 22.545,
      riderLng: 114.118,
      userLat: user.lat,
      userLng: user.lng,
      etaMinutes: 0,
      progressPercent: 100,
      amount: 720,
      reservedTime: "May 10, 7:00 PM",
      partySize: 4,
      messages: [{ role: "agent", text: "Reservation completed.", at: "2026-05-10T19:00:00Z" }],
      createdAt: "2026-05-10T12:00:00Z",
    },
  ];
}

function initStore(): StoreData {
  return {
    users: { ...USERS },
    friendRequests: [{ from: "wangfang", to: CURRENT_USER_ID, status: "pending" }],
    splitBills: [],
    orders: seedOrders(),
    activeOrderId: null,
    invitations: [],
    rooms: [],
    activeOutingPlan: null,
  };
}

function migrateStore(data: StoreData & { activeOrder?: OrderRecord | null }): StoreData {
  if (!data.orders?.length && data.activeOrder) {
    data.orders = [data.activeOrder];
    data.activeOrderId = data.activeOrder.id;
  }
  delete (data as { activeOrder?: OrderRecord }).activeOrder;
  if (!data.orders) data.orders = seedOrders();
  if (!data.rooms) data.rooms = [];
  if (!data.invitations) data.invitations = [];
  for (const room of data.rooms) {
    if (!room.venueKind) room.venueKind = room.restaurantId ? "restaurant" : "activity";
    if (!room.activityName) {
      room.activityName =
        room.restaurantName ??
        ACTIVITIES.find((a) => a.id === room.activityId)?.name ??
        "Outing";
    }
  }
  if (data.invitations.length && !("roomId" in data.invitations[0])) {
    data.invitations = (data.invitations as { id: string; activityId: string; from: string; to: string; message: string }[]).map(
      (inv) => ({ ...inv, roomId: `room-legacy-${inv.id}`, venueKind: "activity" as const })
    );
  }
  if (data.activeOrderId === undefined) data.activeOrderId = data.orders[0]?.id ?? null;
  if (data.activeOutingPlan === undefined) data.activeOutingPlan = null;
  const seedUser = USERS[CURRENT_USER_ID];
  const me = data.users[CURRENT_USER_ID];
  if (me && seedUser) {
    for (const fid of seedUser.friendIds) {
      if (!me.friendIds.includes(fid)) me.friendIds.push(fid);
    }
    if (seedUser.nation && !me.nation) me.nation = seedUser.nation;
    for (const [id, profile] of Object.entries(USERS)) {
      if (!data.users[id]) data.users[id] = { ...profile };
      else if (profile.nation && !data.users[id].nation) data.users[id].nation = profile.nation;
    }
  }
  return data;
}

export const demoStore: StoreData = migrateStore(
  (g.__cultraStore as StoreData & { activeOrder?: OrderRecord | null }) ?? (g.__cultraStore = initStore())
);

export function getCurrentUser() {
  return demoStore.users[CURRENT_USER_ID];
}

export function getActiveOutingPlan(): Plan | null {
  return demoStore.activeOutingPlan;
}

export function setActiveOutingPlan(plan: Plan | null): void {
  demoStore.activeOutingPlan = plan;
}

export function getAllOrders(): OrderRecord[] {
  return [...demoStore.orders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getOrderById(id: string): OrderRecord | undefined {
  return demoStore.orders.find((o) => o.id === id);
}

export function getActiveOrder(): OrderRecord | null {
  if (demoStore.activeOrderId) {
    return getOrderById(demoStore.activeOrderId) ?? null;
  }
  return demoStore.orders[0] ?? null;
}

function pushOrder(order: OrderRecord) {
  demoStore.orders.unshift(order);
  demoStore.activeOrderId = order.id;
  return order;
}

export function getSplitBillForOrder(orderId: string): SplitBillRequest | undefined {
  return demoStore.splitBills.find((b) => b.orderId === orderId);
}

export function getSplitBillForPlan(planId: string): SplitBillRequest | undefined {
  return demoStore.splitBills.find((b) => b.planId === planId);
}

export function canSplitPlan(planId: string): {
  allowed: boolean;
  reason?: string;
  existing?: SplitBillRequest;
} {
  const bill = getSplitBillForPlan(planId);
  if (!bill) return { allowed: true };
  if (bill.status === "completed") {
    return { allowed: false, reason: "Bill already split for this outing plan.", existing: bill };
  }
  if (bill.status === "pending") {
    return { allowed: false, reason: "Split request already pending for this plan.", existing: bill };
  }
  return { allowed: true };
}

export function createPlanSplitBill(
  plan: Plan,
  friendIds: string[],
  _groupSize: number
): SplitBillRequest {
  if (!plan.splitBillEligible || !plan.estimatedTotal) {
    throw new Error("This plan does not have multiple paid stops to split.");
  }
  const check = canSplitPlan(plan.id);
  if (!check.allowed) {
    throw new Error(check.reason ?? "Cannot split");
  }
  const bill: SplitBillRequest = {
    id: `split-plan-${Date.now()}`,
    orderId: `plan-${plan.id}`,
    planId: plan.id,
    payerId: CURRENT_USER_ID,
    friendIds,
    amount: plan.estimatedTotal,
    accepted: Object.fromEntries(friendIds.map((id) => [id, false])),
    status: "pending",
  };
  demoStore.splitBills.push(bill);
  return bill;
}

/** Cannot split again if this order already has a completed (or pending) split */
export function canSplitOrder(orderId: string): { allowed: boolean; reason?: string; existing?: SplitBillRequest } {
  const bill = getSplitBillForOrder(orderId);
  if (!bill) return { allowed: true };
  if (bill.status === "completed") {
    return { allowed: false, reason: "Bill already split for this order.", existing: bill };
  }
  if (bill.status === "pending") {
    return { allowed: false, reason: "Split request already pending for this order.", existing: bill };
  }
  return { allowed: true };
}

export function addFriendRequest(toId: string) {
  if (!USERS[toId]) return;
  const exists = demoStore.friendRequests.find(
    (r) => r.from === CURRENT_USER_ID && r.to === toId && r.status === "pending"
  );
  if (!exists) {
    demoStore.friendRequests.push({ from: CURRENT_USER_ID, to: toId, status: "pending" });
  }
}

export function getRoomsForUser(userId: string = CURRENT_USER_ID): ActivityRoom[] {
  return demoStore.rooms.filter(
    (r) => r.hostId === userId || r.memberIds.includes(userId) || r.invitedIds.includes(userId)
  );
}

export function getRoomById(roomId: string): ActivityRoom | undefined {
  return demoStore.rooms.find((r) => r.id === roomId);
}

function pushRoomInvitations(
  room: ActivityRoom,
  invited: string[],
  message: string,
  venue: { venueKind: ActivityRoom["venueKind"]; activityId?: string; restaurantId?: string }
) {
  for (const fid of invited) {
    const already = demoStore.invitations.some(
      (inv) =>
        inv.roomId === room.id &&
        inv.to === fid &&
        inv.activityId === venue.activityId &&
        inv.restaurantId === venue.restaurantId
    );
    if (already) continue;
    demoStore.invitations.push({
      id: `inv-${Date.now()}-${fid}`,
      roomId: room.id,
      venueKind: venue.venueKind,
      activityId: venue.activityId,
      restaurantId: venue.restaurantId,
      from: CURRENT_USER_ID,
      to: fid,
      message,
    });
  }
}

export function createActivityRoom(params: {
  activityId: string;
  friendIds: string[];
  message?: string;
  planId?: string;
}): ActivityRoom {
  const activity = ACTIVITIES.find((a) => a.id === params.activityId);
  if (!activity) throw new Error(`Unknown activity: ${params.activityId}`);

  const invited = [...new Set(params.friendIds.filter((id) => id !== CURRENT_USER_ID))];
  const defaultMessage =
    params.message ?? `Join me at ${activity.name} (${activity.district}) — let's go together!`;

  const existing = demoStore.rooms.find(
    (r) =>
      r.activityId === params.activityId &&
      r.hostId === CURRENT_USER_ID &&
      r.status === "open" &&
      Date.now() - new Date(r.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000
  );

  let room: ActivityRoom;
  if (existing) {
    room = existing;
    for (const fid of invited) {
      if (!room.invitedIds.includes(fid) && !room.memberIds.includes(fid)) {
        room.invitedIds.push(fid);
      }
    }
    room.message = defaultMessage;
  } else {
    room = {
      id: `room-${Date.now()}`,
      venueKind: "activity",
      activityId: activity.id,
      activityName: activity.name,
      hostId: CURRENT_USER_ID,
      memberIds: [CURRENT_USER_ID],
      invitedIds: invited,
      planId: params.planId,
      message: defaultMessage,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    demoStore.rooms.push(room);
  }

  pushRoomInvitations(room, invited, defaultMessage, {
    venueKind: "activity",
    activityId: activity.id,
  });

  return room;
}

export function createRestaurantRoom(params: {
  restaurantId: string;
  friendIds: string[];
  message?: string;
  planId?: string;
}): ActivityRoom {
  const restaurant = RESTAURANTS.find((r) => r.id === params.restaurantId);
  if (!restaurant) throw new Error(`Unknown restaurant: ${params.restaurantId}`);

  const invited = [...new Set(params.friendIds.filter((id) => id !== CURRENT_USER_ID))];
  const defaultMessage =
    params.message ??
    `Join me for a meal at ${restaurant.name} (${restaurant.cuisine}, ${restaurant.district})!`;

  const existing = demoStore.rooms.find(
    (r) =>
      r.restaurantId === params.restaurantId &&
      r.hostId === CURRENT_USER_ID &&
      r.status === "open" &&
      Date.now() - new Date(r.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000
  );

  let room: ActivityRoom;
  if (existing) {
    room = existing;
    for (const fid of invited) {
      if (!room.invitedIds.includes(fid) && !room.memberIds.includes(fid)) {
        room.invitedIds.push(fid);
      }
    }
    room.message = defaultMessage;
  } else {
    room = {
      id: `room-${Date.now()}`,
      venueKind: "restaurant",
      activityName: restaurant.name,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      hostId: CURRENT_USER_ID,
      memberIds: [CURRENT_USER_ID],
      invitedIds: invited,
      planId: params.planId,
      message: defaultMessage,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    demoStore.rooms.push(room);
  }

  pushRoomInvitations(room, invited, defaultMessage, {
    venueKind: "restaurant",
    restaurantId: restaurant.id,
  });

  return room;
}

/** Invite friends to activity, restaurant, or both (plan → activity room + restaurant in message) */
export function createInviteRoom(params: {
  activityId?: string;
  restaurantId?: string;
  friendIds: string[];
  message?: string;
  planId?: string;
}): ActivityRoom {
  if (params.activityId) {
    let msg = params.message;
    if (params.restaurantId && !msg) {
      const r = RESTAURANTS.find((x) => x.id === params.restaurantId);
      if (r) msg = `Join our outing — then dinner at ${r.name}!`;
    }
    return createActivityRoom({
      activityId: params.activityId,
      friendIds: params.friendIds,
      message: msg,
      planId: params.planId,
    });
  }
  if (params.restaurantId) {
    return createRestaurantRoom({
      restaurantId: params.restaurantId,
      friendIds: params.friendIds,
      message: params.message,
      planId: params.planId,
    });
  }
  throw new Error("activityId or restaurantId required");
}

export function acceptFriendRequest(fromId: string) {
  const req = demoStore.friendRequests.find((r) => r.from === fromId && r.to === CURRENT_USER_ID);
  if (req) req.status = "accepted";
  const me = demoStore.users[CURRENT_USER_ID];
  const other = demoStore.users[fromId];
  if (me && other) {
    if (!me.friendIds.includes(fromId)) me.friendIds.push(fromId);
    if (!other.friendIds.includes(CURRENT_USER_ID)) other.friendIds.push(CURRENT_USER_ID);
  }
}

const ETA: Record<string, number> = {
  preparing: 28,
  on_the_way: 14,
  arriving: 4,
  delivered: 0,
};

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function createReservation(
  restaurantId: string,
  restaurantName: string,
  restaurantLat: number,
  restaurantLng: number,
  reservedTime: string,
  partySize: number
) {
  const r = RESTAURANTS.find((x) => x.id === restaurantId);
  const user = getCurrentUser();
  return pushOrder({
    id: `res-${Date.now()}`,
    restaurantId,
    restaurantName,
    type: "reservation",
    status: "reserved",
    restaurantLat,
    restaurantLng,
    riderLat: restaurantLat,
    riderLng: restaurantLng,
    userLat: user.lat,
    userLng: user.lng,
    etaMinutes: 0,
    progressPercent: 100,
    amount: (r?.pricePerPerson ?? 100) * partySize,
    reservedTime,
    partySize,
    messages: [
      {
        role: "agent",
        text: `Table reserved at ${restaurantName} for ${reservedTime}, party of ${partySize}.`,
        at: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  });
}

function outingDisplayTitle(plan: Plan): string {
  if (plan.planDistrict) {
    return `${plan.planDistrict} day outing`;
  }
  const stops = plan.itinerary?.filter((s) => s.kind !== "travel") ?? [];
  if (stops.length >= 2) {
    return stops
      .slice(0, 2)
      .map((s) => s.title)
      .join(" → ");
  }
  return plan.restaurant?.name ?? plan.activity?.name ?? "Your outing plan";
}

/** Save accepted plan to order history with support chat context */
export function createOutingOrder(
  plan: Plan,
  options?: { partySize?: number; reserveTime?: string }
): OrderRecord {
  const user = getCurrentUser();
  setActiveOutingPlan(plan);
  const partySize = options?.partySize ?? 1;
  const anchor = plan.restaurant ?? plan.activity;
  const lat = anchor?.lat ?? user.lat;
  const lng = anchor?.lng ?? user.lng;
  const title = outingDisplayTitle(plan);
  const amount =
    plan.estimatedTotal ??
    ((plan.restaurant?.pricePerPerson ?? 0) + (plan.activity?.admissionPerPerson ?? 0)) * partySize;

  const stopPreview =
    plan.itinerary
      ?.filter((s) => s.kind !== "travel")
      .map((s) => `• ${s.timeStart} ${s.title}`)
      .join("\n") ?? "";
  const deliveryPreview = plan.deliveryAddons?.length
    ? `\n\n🎁 Delivery: ${formatDeliveryAddonList(plan.deliveryAddons)}`
    : "";

  return pushOrder({
    id: `out-${Date.now()}`,
    restaurantId: plan.restaurant?.id ?? plan.activity?.id ?? "outing",
    restaurantName: title,
    displayTitle: title,
    type: "outing",
    status: "active",
    planId: plan.id,
    plan: { ...plan },
    restaurantLat: lat,
    restaurantLng: lng,
    riderLat: lat,
    riderLng: lng,
    userLat: user.lat,
    userLng: user.lng,
    etaMinutes: 0,
    progressPercent: 100,
    amount: Math.max(amount, plan.restaurant?.pricePerPerson ?? 0),
    reservedTime: options?.reserveTime,
    partySize,
    messages: [
      {
        role: "agent",
        text: `Your outing plan is saved here — party of ${partySize}${plan.planDistrict ? ` in ${plan.planDistrict}` : ""}.\n\n${stopPreview ? `${stopPreview}\n\n` : ""}${deliveryPreview ? `${deliveryPreview}\n\n` : ""}Chat anytime: rain backup for outdoor stops, swap a crowded restaurant, sold-out dishes, reservation changes, or add cake/flowers delivery.`,
        at: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  });
}

/** Accept plan from home screen — one history entry + optional reserve/order note */
export function acceptPlan(
  plan: Plan,
  action: "order" | "reserve" | "share_only",
  options?: { reserveTime?: string; partySize?: number }
): OrderRecord {
  const partySize = options?.partySize ?? 1;
  const order = createOutingOrder(plan, {
    partySize,
    reserveTime: options?.reserveTime,
  });

  if (action === "reserve" && plan.restaurant) {
    order.messages.push({
      role: "agent",
      text: `Table reserved at ${plan.restaurant.name} for ${options?.reserveTime ?? "TBD"}, party of ${partySize}.`,
      at: new Date().toISOString(),
    });
  } else if (action === "order" && plan.restaurant) {
    order.messages.push({
      role: "agent",
      text: `Food order started at ${plan.restaurant.name} — track delivery below or ask me for status.`,
      at: new Date().toISOString(),
    });
    order.status = "preparing";
    order.etaMinutes = ETA.preparing;
    order.progressPercent = 8;
  }

  return order;
}

export function createOrder(
  restaurantId: string,
  restaurantName: string,
  restaurantLat: number,
  restaurantLng: number,
  amount?: number
) {
  const user = getCurrentUser();
  const r = RESTAURANTS.find((x) => x.id === restaurantId);
  return pushOrder({
    id: `ord-${Date.now()}`,
    restaurantId,
    restaurantName,
    type: "order",
    status: "preparing",
    restaurantLat,
    restaurantLng,
    riderLat: restaurantLat,
    riderLng: restaurantLng,
    userLat: user.lat,
    userLng: user.lng,
    etaMinutes: ETA.preparing,
    progressPercent: 8,
    amount: amount ?? (r?.pricePerPerson ?? 100) * 3,
    messages: [
      {
        role: "agent",
        text: `Order confirmed at ${restaurantName}. Chef is preparing — ETA ~${ETA.preparing} min.`,
        at: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
  });
}

export function advanceOrderStatus(orderId: string) {
  const o = getOrderById(orderId);
  if (!o || o.type === "reservation" || o.type === "outing") return o;

  if (o.status === "preparing") o.status = "on_the_way";
  else if (o.status === "on_the_way") o.status = "arriving";
  else if (o.status === "arriving") o.status = "delivered";
  else return o;

  o.etaMinutes = ETA[o.status] ?? 0;
  if (o.status === "on_the_way") {
    o.progressPercent = 45;
    o.riderLat = lerp(o.restaurantLat, o.userLat, 0.35);
    o.riderLng = lerp(o.restaurantLng, o.userLng, 0.35);
    o.messages.push({
      role: "agent",
      text: `Rider picked up — ~${o.etaMinutes} min away.`,
      at: new Date().toISOString(),
    });
  } else if (o.status === "arriving") {
    o.progressPercent = 82;
    o.riderLat = lerp(o.restaurantLat, o.userLat, 0.85);
    o.riderLng = lerp(o.restaurantLng, o.userLng, 0.85);
    o.messages.push({
      role: "agent",
      text: `Rider is almost there — ~${o.etaMinutes} min.`,
      at: new Date().toISOString(),
    });
  } else if (o.status === "delivered") {
    o.progressPercent = 100;
    o.riderLat = o.userLat;
    o.riderLng = o.userLng;
    o.etaMinutes = 0;
    o.messages.push({
      role: "agent",
      text: `Delivered! Enjoy your meal from ${o.restaurantName}.`,
      at: new Date().toISOString(),
    });
  }
  return o;
}

export function getOrderByPlanId(planId: string): OrderRecord | undefined {
  return demoStore.orders.find((o) => o.planId === planId || o.plan?.id === planId);
}

function primaryRestaurantInPlan(plan: Plan) {
  return plan.restaurant ?? plan.itinerary?.find((s) => s.restaurant)?.restaurant;
}

function primaryActivityInPlan(plan: Plan) {
  return plan.activity ?? plan.itinerary?.find((s) => s.activity)?.activity;
}

/** Persist an updated plan onto a saved order (history + detail views). */
export function syncOrderFromPlan(
  order: OrderRecord,
  plan: Plan,
  options?: { pushMessage?: string }
): OrderRecord {
  const partySize = Math.max(1, order.partySize ?? 1);
  const nextPlan = enrichPlanCosts({ ...plan }, partySize);

  order.plan = nextPlan;
  order.planId = nextPlan.id;
  order.planUpdatedAt = new Date().toISOString();
  setActiveOutingPlan(nextPlan);

  const restaurant = primaryRestaurantInPlan(nextPlan);
  const activity = primaryActivityInPlan(nextPlan);
  const anchor = restaurant ?? activity;

  if (restaurant) {
    order.restaurantId = restaurant.id;
    order.restaurantLat = restaurant.lat;
    order.restaurantLng = restaurant.lng;
  } else if (activity) {
    order.restaurantId = activity.id;
    order.restaurantLat = activity.lat;
    order.restaurantLng = activity.lng;
  }

  if (anchor) {
    order.riderLat = anchor.lat;
    order.riderLng = anchor.lng;
  }

  order.restaurantName = outingDisplayTitle(nextPlan);
  order.displayTitle = order.restaurantName;
  order.amount = nextPlan.estimatedTotal ?? order.amount;

  if (options?.pushMessage) {
    order.messages.push({
      role: "agent",
      text: options.pushMessage.replace(/\*\*/g, ""),
      at: new Date().toISOString(),
    });
  }

  return order;
}

/** Sync every saved order linked to this plan (or one explicit order id). */
export function syncLinkedOrdersFromPlan(
  plan: Plan,
  options?: { orderId?: string; changeNote?: string; pushMessage?: boolean }
): OrderRecord[] {
  const targets = options?.orderId
    ? [getOrderById(options.orderId)].filter((o): o is OrderRecord => Boolean(o))
    : demoStore.orders.filter(
        (o) =>
          o.type === "outing" && (o.planId === plan.id || o.plan?.id === plan.id)
      );

  return targets.map((order) =>
    syncOrderFromPlan(order, plan, {
      pushMessage: options?.pushMessage ? options.changeNote : undefined,
    })
  );
}

export function addDeliveryAddonsToOrder(
  orderId: string,
  kinds: DeliveryAddonKind[],
  options?: { pushMessage?: boolean }
): OrderRecord | undefined {
  const order = getOrderById(orderId);
  if (!order?.plan || kinds.length === 0) return order;

  const restaurant = order.plan.restaurant ?? order.plan.itinerary?.find((s) => s.restaurant)?.restaurant;
  if (!restaurant) return order;

  const beforeKinds = new Set((order.plan.deliveryAddons ?? []).map((a) => a.kind));
  if (kinds.every((k) => beforeKinds.has(k))) return order;

  const updatedPlan = attachDeliveryAddonsToPlan(order.plan, kinds);

  syncOrderFromPlan(order, updatedPlan);

  if (options?.pushMessage !== false) {
    const addedKinds = new Set(kinds);
    const added = updatedPlan.deliveryAddons?.filter((a) => addedKinds.has(a.kind)) ?? [];
    const addedLabels = added.map((a) => a.label).join(", ");
    order.messages.push({
      role: "agent",
      text: `Delivery scheduled — ${addedLabels} → ${restaurant.name}. ${formatDeliveryAddonList(updatedPlan.deliveryAddons)}`,
      at: new Date().toISOString(),
    });
  }

  return order;
}

/** Apply cake/flowers/etc. from support or planner chat onto a saved order's plan. */
export function tryApplyDeliveryAddonsToOrder(
  order: OrderRecord,
  userMessage: string
): { reply: string; updatedPlan?: Plan } | null {
  if (!isDeliveryAddonRequest(userMessage)) return null;

  const plan = order.plan ?? getActiveOutingPlan();
  if (!plan) {
    return {
      reply:
        "I can arrange cake, flowers, champagne, or gifts delivered to your restaurant — save a plan with a dining stop first.",
    };
  }

  const applied = applyDeliveryAddonsFromMessage(plan, userMessage);
  if (!applied) {
    return {
      reply:
        "I can deliver add-ons to a restaurant on your plan — save a plan with a dining stop first.",
      updatedPlan: plan,
    };
  }

  if (order.plan) {
    addDeliveryAddonsToOrder(order.id, extractDeliveryAddonKinds(userMessage), { pushMessage: false });
  } else {
    syncOrderFromPlan(order, applied.updatedPlan);
  }

  return { reply: applied.message, updatedPlan: order.plan ?? applied.updatedPlan };
}

