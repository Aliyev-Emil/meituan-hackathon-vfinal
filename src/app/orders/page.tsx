"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Activity, Plan, Restaurant } from "@/lib/types";
import SubpageLandingHero from "@/components/SubpageLandingHero";
import Toast from "@/components/Toast";
import OrderPlanDetails from "@/components/OrderPlanDetails";

interface OrderSummary {
  id: string;
  restaurantName: string;
  type: string;
  status: string;
  amount: number;
  createdAt: string;
  reservedTime?: string;
  partySize?: number;
  planDistrict?: string;
  splitStatus: string | null;
  canSplit: boolean;
}

interface OrderDetail extends OrderSummary {
  restaurantLat: number;
  restaurantLng: number;
  riderLat: number;
  riderLng: number;
  userLat: number;
  userLng: number;
  etaMinutes: number;
  progressPercent: number;
  planId?: string;
  plan?: Plan;
  messages: { role: string; text: string; at: string }[];
}

interface SplitBill {
  id: string;
  orderId: string;
  friendIds: string[];
  amount: number;
  status: string;
  accepted: Record<string, boolean>;
}

const STATUS_LABELS: Record<string, string> = {
  preparing: "Preparing",
  on_the_way: "On the way",
  arriving: "Arriving",
  delivered: "Delivered",
  reserved: "Reserved",
  active: "Active plan",
};

function MapView({ order }: { order: OrderDetail }) {
  const minLat = Math.min(order.restaurantLat, order.userLat, order.riderLat) - 0.008;
  const maxLat = Math.max(order.restaurantLat, order.userLat, order.riderLat) + 0.008;
  const minLng = Math.min(order.restaurantLng, order.userLng, order.riderLng) - 0.008;
  const maxLng = Math.max(order.restaurantLng, order.userLng, order.riderLng) + 0.008;
  const toX = (lng: number) => ((lng - minLng) / (maxLng - minLng)) * 100;
  const toY = (lat: number) => 100 - ((lat - minLat) / (maxLat - minLat)) * 100;

  return (
    <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
      <rect width="100" height="100" fill="#e8f4fc" rx="4" />
      <line
        x1={toX(order.restaurantLng)}
        y1={toY(order.restaurantLat)}
        x2={toX(order.riderLng)}
        y2={toY(order.riderLat)}
        stroke="#FFC300"
        strokeWidth="1.5"
      />
      <line
        x1={toX(order.riderLng)}
        y1={toY(order.riderLat)}
        x2={toX(order.userLng)}
        y2={toY(order.userLat)}
        stroke="#333"
        strokeWidth="1.8"
      />
      <circle cx={toX(order.userLng)} cy={toY(order.userLat)} r="4.5" fill="#FFC300" stroke="#333" />
      <circle cx={toX(order.riderLng)} cy={toY(order.riderLat)} r="5" fill="#333" stroke="#FFC300" strokeWidth="2" />
    </svg>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [splitBill, setSplitBill] = useState<SplitBill | null>(null);
  const [canSplit, setCanSplit] = useState(false);
  const [splitBlockReason, setSplitBlockReason] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [supportUsesLlm, setSupportUsesLlm] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<string[]>(["zhangwei", "lina"]);
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/order", { cache: "no-store" });
    const j = await res.json();
    setOrders(j.orders ?? []);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/order?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    const j = await res.json();
    if (j.order) {
      setDetail(j.order);
      setSplitBill(j.splitBill ?? null);
      setCanSplit(j.canSplit ?? false);
      setSplitBlockReason(j.splitBlockReason ?? null);
    }
  }, []);

  useEffect(() => {
    loadList();
    fetch("/api/restaurants", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        setRestaurants(j.restaurants ?? []);
        setActivities(j.activities ?? []);
      });
  }, [loadList]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else {
      setDetail(null);
      setSplitBill(null);
    }
  }, [selectedId, loadDetail]);

  async function tick() {
    if (!selectedId) return;
    await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "tick", orderId: selectedId }),
    });
    loadDetail(selectedId);
    loadList();
  }

  async function sendChat() {
    if (!chatInput.trim() || !selectedId || chatLoading) return;
    setChatLoading(true);
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "chat", orderId: selectedId, message: chatInput }),
      });
      const j = await res.json();
      if (j.order) {
        setDetail(j.order);
        loadList();
      }
      if (typeof j.usedLlm === "boolean") setSupportUsesLlm(j.usedLlm);
      setChatInput("");
    } finally {
      setChatLoading(false);
    }
  }

  async function startSplit() {
    if (!selectedId || !detail || !canSplit) return;
    const res = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "split_bill",
        orderId: selectedId,
        friendIds,
        amount: detail.amount,
        partySize: detail.partySize ?? 1,
      }),
    });
    const j = await res.json();
    if (j.error) {
      setToast(j.error);
      setTimeout(() => setToast(null), 3000);
      loadDetail(selectedId);
      return;
    }
    setSplitBill(j.bill);
    setCanSplit(false);
    setSplitBlockReason("Split in progress.");
    setToast("Split bill sent to friends");
    setTimeout(() => setToast(null), 2800);
    loadList();
  }

  async function acceptAllSplit() {
    if (!splitBill) return;
    for (const fid of splitBill.friendIds) {
      await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept_split", billId: splitBill.id, friendId: fid }),
      });
    }
    setToast("Bill split completed ✓");
    setTimeout(() => setToast(null), 2800);
    if (selectedId) loadDetail(selectedId);
    loadList();
  }

  const isReservation = detail?.type === "reservation";
  const isOuting = detail?.type === "outing";
  const splitDone = splitBill?.status === "completed" || detail?.splitStatus === "completed";
  const splitPending = splitBill?.status === "pending";
  const linkedRestaurant =
    detail?.plan?.restaurant ??
    restaurants.find((r) => r.id === detail?.restaurantId) ??
    null;
  const linkedActivity =
    detail?.plan?.activity ?? activities.find((a) => a.id === detail?.restaurantId) ?? null;

  return (
    <div>
      <Toast message={toast} />

      <SubpageLandingHero
        eyebrow="Orders"
        title="Track every reservation and delivery"
        description="Monitor live status, review completed plans, split bills with friends, and use support chat to handle backup options fast."
        chips={["Live progress", "Reservation view", "Split bill", "Support chat"]}
        ctaHref="/planner"
        ctaLabel="Create new plan"
      />

      <div style={{ display: "grid", gridTemplateColumns: selectedId ? "320px 1fr" : "1fr", gap: 24 }}>
        <section>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>History</h2>
          {orders.length === 0 ? (
            <p style={{ color: "#888" }}>
              No orders yet.{" "}
              <Link href="/planner" style={{ color: "#c99700", fontWeight: 600 }}>
                Plan something →
              </Link>
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className={`card ${selectedId === o.id ? "selected" : ""}`}
                  style={{
                    padding: 14,
                    textAlign: "left",
                    border: "none",
                    width: "100%",
                    cursor: "pointer",
                  }}
                  onClick={() => setSelectedId(o.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <strong>{o.restaurantName}</strong>
                      <p style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        {formatDate(o.createdAt)} · ¥{o.amount}
                      </p>
                    </div>
                    <span className="badge badge-yellow">
                      {o.type === "outing"
                        ? "Outing plan"
                        : o.type === "reservation"
                          ? "Reserved"
                          : STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </div>
                  {o.splitStatus === "completed" && (
                    <span className="badge badge-green" style={{ marginTop: 8 }}>
                      ✓ Bill split
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        {selectedId && detail ? (
          <section className="animate-in">
            <button
              type="button"
              className="btn-secondary"
              style={{ marginBottom: 12, fontSize: 13 }}
              onClick={() => setSelectedId(null)}
            >
              ← All orders
            </button>

            <h2 style={{ fontSize: 22, marginBottom: 8 }}>{detail.restaurantName}</h2>
            <p style={{ color: "#666", marginBottom: 16 }}>
              {isOuting ? (
                <>
                  {STATUS_LABELS[detail.status] ?? "Active"} · party of {detail.partySize ?? 1}
                  {detail.planDistrict ? ` · ${detail.planDistrict}` : ""}
                  {detail.plan?.estimatedTotal
                    ? ` · ~¥${detail.plan.estimatedTotal} estimated`
                    : ` · ¥${detail.amount}`}
                </>
              ) : isReservation ? (
                <>
                  Reserved for <strong>{detail.reservedTime}</strong> · party of {detail.partySize}
                </>
              ) : (
                <>
                  {STATUS_LABELS[detail.status]} ·{" "}
                  {detail.status !== "delivered" && detail.etaMinutes > 0
                    ? `ETA ${detail.etaMinutes} min`
                    : "Delivered"}
                </>
              )}
            </p>

            <OrderPlanDetails
              key={`${detail.id}-${detail.planUpdatedAt ?? detail.plan?.id ?? "plan"}`}
              plan={detail.plan}
              fallbackRestaurant={linkedRestaurant}
              fallbackActivity={linkedActivity}
              partySize={detail.partySize}
              reservedTime={detail.reservedTime}
            />

            {isReservation ? (
              <section className="card" style={{ padding: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 14, color: "#666" }}>
                  Table booking confirmed — no delivery tracking for dine-in reservations.
                </p>
              </section>
            ) : isOuting ? (
              <>
                {(canSplit || splitDone || splitPending) && (
                  <section className="card" style={{ padding: 16, marginBottom: 16 }}>
                    <h3 style={{ fontSize: 16, marginBottom: 8 }}>
                      Split the whole outing · ¥{detail.plan?.estimatedTotal ?? detail.amount}
                    </h3>
                    {splitDone ? (
                      <p style={{ color: "#2e7d32", fontWeight: 600 }}>✓ Outing bill already split.</p>
                    ) : splitPending ? (
                      <div>
                        <p style={{ marginBottom: 8 }}>Waiting for friends to accept…</p>
                        <button type="button" className="btn-secondary" onClick={acceptAllSplit}>
                          Simulate all accept (demo)
                        </button>
                      </div>
                    ) : canSplit ? (
                      <>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          {["zhangwei", "lina", "joshua", "haeun", "emil", "wangfang"].map((id) => (
                            <label key={id} style={{ display: "flex", gap: 6, cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={friendIds.includes(id)}
                                onChange={(e) =>
                                  setFriendIds((p) =>
                                    e.target.checked ? [...p, id] : p.filter((x) => x !== id)
                                  )
                                }
                              />
                              @{id}
                            </label>
                          ))}
                        </div>
                        <button type="button" className="btn-primary" onClick={startSplit}>
                          Split full outing with friends
                        </button>
                      </>
                    ) : (
                      <p style={{ color: "#888", fontSize: 14 }}>
                        {splitBlockReason ?? "Need 2+ paid stops in the plan to split."}
                      </p>
                    )}
                  </section>
                )}
              </>
            ) : (
              <>
                {detail.status !== "delivered" && (
                  <p style={{ fontWeight: 700, color: "#c99700", marginBottom: 12 }}>
                    Food ETA: {detail.etaMinutes} min
                  </p>
                )}
                <section className="card" style={{ padding: 16, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <h3 style={{ fontSize: 16 }}>Live map</h3>
                    {detail.status !== "delivered" && (
                      <button type="button" className="btn-secondary" style={{ fontSize: 12 }} onClick={tick}>
                        Advance (demo)
                      </button>
                    )}
                  </div>
                  <div style={{ height: 260, borderRadius: 10, overflow: "hidden", border: "1px solid #eee" }}>
                    <MapView order={detail} />
                  </div>
                  <div style={{ height: 6, background: "#eee", borderRadius: 3, marginTop: 10 }}>
                    <div
                      style={{
                        width: `${detail.progressPercent}%`,
                        height: "100%",
                        background: "var(--meituan-yellow)",
                        borderRadius: 3,
                        transition: "width 0.5s ease",
                      }}
                    />
                  </div>
                </section>

                <section className="card" style={{ padding: 16, marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, marginBottom: 8 }}>Split the bill · ¥{detail.amount}</h3>
                  {splitDone ? (
                    <p style={{ color: "#2e7d32", fontWeight: 600 }}>✓ Bill already split for this order.</p>
                  ) : splitPending ? (
                    <div>
                      <p style={{ marginBottom: 8 }}>Waiting for friends to accept…</p>
                      <button type="button" className="btn-secondary" onClick={acceptAllSplit}>
                        Simulate all accept (demo)
                      </button>
                    </div>
                  ) : canSplit ? (
                    <>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        {["zhangwei", "lina", "joshua", "haeun", "emil", "wangfang"].map((id) => (
                          <label key={id} style={{ display: "flex", gap: 6, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={friendIds.includes(id)}
                              onChange={(e) =>
                                setFriendIds((p) => (e.target.checked ? [...p, id] : p.filter((x) => x !== id)))
                              }
                            />
                            @{id}
                          </label>
                        ))}
                      </div>
                      <button type="button" className="btn-primary" onClick={startSplit}>
                        Request split with friends
                      </button>
                    </>
                  ) : (
                    <p style={{ color: "#888", fontSize: 14 }}>{splitBlockReason ?? "Cannot split this order."}</p>
                  )}
                </section>
              </>
            )}

            <section className="card" style={{ padding: 16 }}>
              <h3 style={{ fontSize: 16, marginBottom: 10 }}>
                Support chat{isOuting ? " · plan & backups" : ""}
                {supportUsesLlm === true && (
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#888", marginLeft: 8 }}>
                    AI
                  </span>
                )}
                {supportUsesLlm === false && (
                  <span style={{ fontSize: 11, fontWeight: 500, color: "#888", marginLeft: 8 }}>
                    basic mode
                  </span>
                )}
              </h3>
              <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 12 }}>
                {detail.messages.map((m, i) => (
                  <div key={i} style={{ textAlign: m.role === "user" ? "right" : "left", marginBottom: 6 }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "8px 12px",
                        borderRadius: 10,
                        background: m.role === "user" ? "var(--meituan-yellow)" : "#f5f5f5",
                        fontSize: 13,
                        maxWidth: "90%",
                      }}
                    >
                      {m.text}
                    </span>
                  </div>
                ))}
                {chatLoading && <p style={{ fontSize: 12, color: "#888" }} className="loading-dots">Typing</p>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  placeholder="Rain? Crowded? Dish sold out? Ask Cultra for a backup…"
                  style={{ flex: 1, padding: 10, borderRadius: 8, border: "2px solid #eee" }}
                />
                <button type="button" className="btn-primary" onClick={sendChat}>
                  Send
                </button>
              </div>
            </section>
          </section>
        ) : (
          <section
            className="card"
            style={{
              padding: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#888",
              minHeight: 200,
            }}
          >
            Select an order from the list
          </section>
        )}
      </div>
    </div>
  );
}
