"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GeneratePlansResult } from "@/lib/agent/generate_plans";
import type { Plan } from "@/lib/types";
import Toast from "@/components/Toast";
import SwipePlanDeck from "@/components/SwipePlanDeck";
import NearbyRestaurantCards, {
  type NearbyRestaurantCard,
} from "@/components/NearbyRestaurantCards";
import SubpageLandingHero from "@/components/SubpageLandingHero";
import MatchScoreBreakdown from "@/components/MatchScoreBreakdown";
import PlanCardHero from "@/components/PlanCardHero";
import ShareMessageBlock from "@/components/ShareMessageBlock";
import { POST_PLAN_FOLLOWUP_MESSAGE } from "@/lib/utils/delivery_addons";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

interface NearbyItem extends NearbyRestaurantCard {
  district: string;
}

interface NearbyResponse {
  restaurants: NearbyItem[];
  nationalityRestaurants: NearbyItem[];
  activities: NearbyItem[];
  nation?: string;
}

const QUICK_PROMPTS = [
  "I'm free today, make some arrangements for me, and my wife on a diet.",
  "Create an afternoon plan with cantonese cuisine + quiet place for parents.",
  "4 friends want to go to Futian today, make some arrangements for us. It's raining right now.",
];

export default function PlannerPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hi XiaoMing! I'm Cultra — how can I help you?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratePlansResult | null>(null);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [phase, setPhase] = useState<"plans" | "confirm" | "done" | "idle">("idle");
  const [shareText, setShareText] = useState("");
  const [oneStopResult, setOneStopResult] = useState<GeneratePlansResult["oneStop"] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState("");
  const [nearby, setNearby] = useState<NearbyResponse | null>(null);
  const [planIndex, setPlanIndex] = useState(0);
  const [swipeBusy, setSwipeBusy] = useState(false);
  const [splitBillBusy, setSplitBillBusy] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [planAccepted, setPlanAccepted] = useState(false);
  const [acceptedOrderId, setAcceptedOrderId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const plansSectionRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadNearby = useCallback(() => {
    fetch("/api/nearby", { cache: "no-store" })
      .then((r) => r.json())
      .then(setNearby);
  }, []);

  const chosenPlan =
    selected ?? result?.plans?.[planIndex] ?? result?.plans?.[0] ?? null;
  const hasPlans = (result != null && result.plans.length > 0) || chosenPlan != null;
  const showQuickPrompts = !messages.some((m) => m.role === "user");
  const isItineraryMode =
    Boolean(result?.intent.wantsFullItinerary && result.plans.some((p) => p.itinerary?.length));

  useEffect(() => {
    loadNearby();
    window.addEventListener("focus", loadNearby);
    return () => window.removeEventListener("focus", loadNearby);
  }, [loadNearby]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, result, loading]);

  useEffect(() => {
    setPlanIndex(0);
  }, [result?.plans]);

  function showToastMsg(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }

  const sendMessage = useCallback(async (opts?: { oneStopAgent?: boolean }) => {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          context: {
            hasPlans,
            lastPlans: result?.plans,
            lastPlanIndex: planIndex,
            chosenPlan: chosenPlan ?? undefined,
            planAccepted,
            acceptedOrderId: acceptedOrderId ?? undefined,
            oneStopAgent: opts?.oneStopAgent ?? false,
          },
        }),
      });
      const data = await res.json();

      setMessages((m) => [...m, { role: "assistant", text: data.assistantMessage }]);

      if (data.updatedPlan) {
        setResult((prev) => {
          if (!prev) {
            return {
              intent: data.intent,
              plans: [data.updatedPlan],
              currentTime: new Date().toLocaleString(),
              timeLabel: "Today",
            };
          }
          const plans = prev.plans?.length
            ? prev.plans.map((p) => (p.id === data.updatedPlan.id ? data.updatedPlan : p))
            : [data.updatedPlan];
          return { ...prev, ...(data.result ?? {}), plans };
        });
        setSelected((s) =>
          s?.id === data.updatedPlan.id || !s ? data.updatedPlan : s
        );
        if (planAccepted) setPhase("done");
        showToastMsg("Delivery added to your plan");
      } else if (data.result?.plans) {
        setResult(data.result);
      }

      if (data.room) {
        const label =
          data.room.venueKind === "restaurant"
            ? data.room.restaurantName ?? data.room.activityName
            : data.room.activityName;
        showToastMsg(`Room created — ${label}`);
      }

      if (data.autoExecuted) {
        setResult(data.result ?? null);
        setPhase("done");
        setShareText(data.assistantMessage);
        setLastAction(data.executedAction ?? "");
        showToastMsg(
          data.executedAction === "reserve"
            ? "Table reserved ✓"
            : data.executedAction === "share_only"
              ? "Activity booked ✓"
              : "Order placed ✓"
        );
      } else if (data.planContingency && data.result?.plans?.length) {
        setResult(data.result);
        setSelected(data.result.plans[0]);
        if (planAccepted) setPhase("done");
        else setPhase("plans");
        showToastMsg(
          planAccepted ? "Plan updated in Orders too" : "Plan updated with backup"
        );
      } else if (data.oneStopAgent && data.result?.plans?.length) {
        setResult(data.result);
        setSelected(data.result.plans[0]);
        setPhase("confirm");
        setShareText("");
        setPlanAccepted(false);
        setAcceptedOrderId(null);
        if (data.result.oneStop) setOneStopResult(data.result.oneStop);
        showToastMsg("One-Stop Agent picked your best plan");
      } else if (data.showPlans && data.result?.plans?.length) {
        setResult(data.result);
        setPhase("plans");
        setSelected(null);
        setShareText("");
        setPlanAccepted(false);
        setAcceptedOrderId(null);
      } else if (!data.updatedPlan) {
        setResult(data.result ?? null);
        if (!planAccepted) setPhase("idle");
      }
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, hasPlans, result?.plans, planIndex, chosenPlan, planAccepted, acceptedOrderId]);

  async function handleExecute(plan: Plan, action: "order" | "reserve" | "share_only") {
    setSelected(plan);
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          recipients: ["wife", "zhangwei", "lina"],
          action,
          reserveTime: result?.intent.reserveTime,
          partySize: result?.intent.groupSize,
          oneStop: result?.intent.oneStop,
          userText: messages.filter((m) => m.role === "user").map((m) => m.text).join("\n"),
        }),
      });
    const data = await res.json();
    setShareText(data.share.message);
    if (data.oneStop) setOneStopResult(data.oneStop);
    setLastAction(action);
    setPhase("done");
    setPlanAccepted(true);
    setAcceptedOrderId(data.order?.id ?? null);
    const reservedFor =
      action === "reserve"
        ? (data.reserveTime ?? data.order?.reservedTime ?? "TBD")
        : null;
    const baseDone =
      action === "reserve"
        ? `Plan saved — reserved ${plan.restaurant?.name} for ${reservedFor}. Open **Orders** for your itinerary and support chat.`
        : action === "order"
          ? `Plan saved with order at ${plan.restaurant?.name}. Track everything on **Orders**.`
          : `Plan saved. Open **Orders** to view your itinerary and chat for backups anytime.\n\n${data.share.message}`;
    const addonNote =
      plan.deliveryAddons?.length
        ? `\n\n🎁 Delivery included: ${plan.deliveryAddons.map((a) => a.label).join(", ")}.`
        : "";
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        text: `${baseDone}${addonNote}\n\n${POST_PLAN_FOLLOWUP_MESSAGE}`,
      },
    ]);
    if (action === "order") showToastMsg("Plan saved · see Orders");
    else if (action === "reserve") showToastMsg("Plan saved · see Orders");
    else showToastMsg("Plan saved · see Orders");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleQuickPrompt(text: string) {
    if (loading) return;
    setInput(text);
    inputRef.current?.focus();
  }

  async function handleSwipeAccept(plan: Plan) {
    setSwipeBusy(true);
    try {
      await handleExecute(plan, plan.restaurant ? "reserve" : "share_only");
    } finally {
      setSwipeBusy(false);
    }
  }

  function handleSwipeReject() {
    if (!result?.plans.length) return;
    if (planIndex < result.plans.length - 1) {
      setPlanIndex((i) => i + 1);
      showToastMsg("Showing another plan");
    } else {
      showToastMsg("No more plans — try a different request");
    }
  }

  async function handleSplitPlanBill(plan: Plan) {
    if (!result || splitBillBusy) return;
    const groupSize = result.intent.groupSize ?? 1;
    const friendIds = (result.intent.friendIds ?? ["zhangwei", "lina", "joshua"]).slice(
      0,
      Math.max(1, groupSize - 1)
    );
    setSplitBillBusy(true);
    try {
      const res = await fetch("/api/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "split_plan_bill",
          plan,
          friendIds,
          groupSize,
        }),
      });
      const data = await res.json();
      if (data.error) {
        showToastMsg(data.error);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", text: data.message }]);
      showToastMsg("Outing bill split sent ✓");
    } finally {
      setSplitBillBusy(false);
    }
  }

  const showCards = (phase === "plans" || phase === "confirm") && hasPlans && !loading;
  const nationality = nearby?.nation ?? "Korean";

  function onNearbyRestaurantSelect(
    restaurant: NearbyRestaurantCard,
    source: "nearby" | "nationality"
  ) {
    if (!nearby || nearbyLoading) return;

    const column =
      source === "nearby" ? nearby.restaurants : nearby.nationalityRestaurants;
    const restaurantIds = [
      restaurant.id,
      ...column.filter((r) => r.id !== restaurant.id).map((r) => r.id),
    ];

    setNearbyLoading(true);
    setSelected(null);
    setPhase("plans");
    setShareText("");

    fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "show_restaurants", restaurantIds }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error || !data.result?.plans?.length) {
          showToastMsg(data.error ?? "Could not load restaurant");
          return;
        }
        setResult(data.result);
        setPlanIndex(0);
        setPhase("plans");
        requestAnimationFrame(() => {
          plansSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      })
      .catch(() => showToastMsg("Could not load restaurant"))
      .finally(() => setNearbyLoading(false));
  }

  return (
    <div>
      <Toast message={toast} />

      <SubpageLandingHero
        eyebrow="Planner"
        title="Plan dinners & activities in one chat"
        description="Tell Cultra your mood, cuisine, group size, and timing. We rank options, then let you reserve, order, or share in one flow."
        chips={["AI-ranked plans", "Culture tags"]}
        ctaHref="/orders"
        ctaLabel="See current orders"
        compact
      />
      {result && (
        <p style={{ marginBottom: 16 }}>
          <span className="badge badge-yellow">🕐 {result.currentTime} · {result.timeLabel}</span>
        </p>
      )}

      {nearby &&
        (nearby.restaurants.length > 0 || nearby.nationalityRestaurants.length > 0) && (
        <section className="card animate-in" style={{ padding: 16, marginBottom: 20 }}>
          <div className="planner-nearby-layout">
            <div className="planner-nearby-column">
              <h2 className="planner-nearby-column__title">📍 Near you in Nanshan</h2>
              <NearbyRestaurantCards
                restaurants={nearby.restaurants}
                onSelect={(r) => onNearbyRestaurantSelect(r, "nearby")}
                emptyMessage="No nearby venues right now."
              />
            </div>

            <div className="planner-nearby-column">
              <h2 className="planner-nearby-column__title">
              🌍 Recommended based on {nationality} cuisine
              </h2>
              <NearbyRestaurantCards
                restaurants={nearby.nationalityRestaurants}
                onSelect={(r) => onNearbyRestaurantSelect(r, "nationality")}
                emptyMessage={`No ${nationality} restaurants found nearby yet.`}
              />
            </div>
          </div>
        </section>
      )}

      <section className="card animate-in" style={{ padding: 0, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ maxHeight: 360, overflowY: "auto", padding: 16, background: "#fafafa" }}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  maxWidth: "85%",
                  padding: "10px 14px",
                  borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  background: m.role === "user" ? "var(--meituan-yellow)" : "#fff",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                  fontSize: 14,
                  lineHeight: 1.5,
                }}
              >
                {m.text}
              </span>
            </div>
          ))}
          {loading && (
            <p style={{ fontSize: 13, color: "#888", fontStyle: "italic" }} className="loading-dots">
              Thinking
            </p>
          )}
          <div ref={chatEndRef} />
        </div>
        <div style={{ borderTop: "1px solid #eee" }}>
          {showQuickPrompts && (
            <div style={{ padding: "8px 12px 0" }}>
              <div className="planner-quick-prompts">
                <p className="planner-quick-prompts__label">Try asking</p>
                <div className="planner-quick-prompts__list">
                  {QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="planner-quick-prompts__chip"
                      onClick={() => handleQuickPrompt(prompt)}
                      disabled={loading}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div style={{ padding: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message… (Enter to send)"
              style={{
                flex: "1 1 200px",
                minWidth: 0,
                padding: "12px 14px",
                borderRadius: 24,
                border: "2px solid #eee",
                fontSize: 15,
              }}
            />
            <button
              type="button"
              className="btn-one-stop"
              onClick={() => sendMessage({ oneStopAgent: true })}
              disabled={!input.trim() || loading}
              title="Auto-pick the best plan — no browsing alternatives"
            >
              One-Stop Agent
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
            >
              Send
            </button>
          </div>
        </div>
      </section>

      {result?.intent.keywords && result.intent.keywords.length > 0 && showCards && (
        <section className="animate-fade" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: "#666", marginBottom: 8 }}>Keywords</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {result.intent.keywords.map((kw) => (
              <span key={kw} className="badge badge-yellow">
                {kw}
              </span>
            ))}
          </div>
        </section>
      )}

      {result?.oneStop && showCards && (
        <section className="card animate-in" style={{ padding: 16, marginBottom: 20, background: "#fffbeb" }}>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>One-stop setup</h3>
          {result.oneStop.reservation && (
            <p style={{ fontSize: 14, marginBottom: 6 }}>
              🍽 Table at <strong>{result.oneStop.reservation.venue}</strong> · {result.oneStop.reservation.time} · party of {result.oneStop.reservation.partySize}
              {result.oneStop.pendingReservation ? " (confirm when you accept a plan)" : ""}
            </p>
          )}
          {result.oneStop.traffic && (
            <p style={{ fontSize: 14, marginBottom: 6 }}>
              🚗 {result.oneStop.traffic.route} · ~{result.oneStop.traffic.etaMinutes} min · {result.oneStop.traffic.congestion}
            </p>
          )}
          {result.oneStop.reminder && (
            <p style={{ fontSize: 14 }}>
              ⏰ {result.oneStop.reminder.message}
            </p>
          )}
        </section>
      )}

      {showCards && isItineraryMode && (
        <section ref={plansSectionRef} className="animate-in" style={{ marginBottom: 24 }}>
          <h2 style={{ marginBottom: 16 }}>Your plan</h2>
          <SwipePlanDeck
            plans={result!.plans}
            planIndex={planIndex}
            onAccept={handleSwipeAccept}
            onReject={handleSwipeReject}
            onSplitBill={handleSplitPlanBill}
            splitBusy={splitBillBusy}
            busy={swipeBusy}
          />
        </section>
      )}

      {showCards && !isItineraryMode && (
        <section ref={plansSectionRef} className="animate-in">
          <h2 style={{ marginBottom: 16 }}>
            {result!.plans.length} plan{result!.plans.length > 1 ? "s" : ""} for you
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {result!.plans.map((plan, i) => (
              <div
                key={plan.id}
                className={`card ${selected?.id === plan.id ? "selected" : ""} animate-in-delay-${Math.min(i + 1, 3)}`}
                style={{ padding: 0, overflow: "hidden", cursor: "pointer" }}
                onClick={() => {
                  setSelected(plan);
                  setPhase("confirm");
                }}
              >
                <PlanCardHero plan={plan} />
                <div style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                    <MatchScoreBreakdown plan={plan} compact />
                    <span className="badge badge-gray">{plan.cultureTag}</span>
                  </div>
                  {plan.activity && (
                    <p style={{ marginBottom: 8 }}>
                      <strong>🎯 {plan.activity.name}</strong>
                      <br />
                      <span style={{ fontSize: 13, color: "#666" }}>
                        {plan.activity.district}
                        {plan.activity.admissionPerPerson > 0
                          ? ` · Ticket ¥${plan.activity.admissionPerPerson}/pp`
                          : " · Free entry"}
                      </span>
                    </p>
                  )}
                  {plan.restaurant && (
                    <p style={{ marginBottom: 8 }}>
                      <strong>🍽 {plan.restaurant.name}</strong>
                      <br />
                      <span style={{ fontSize: 13 }}>
                        {plan.restaurant.cuisine} · ¥{plan.restaurant.pricePerPerson}/pp
                      </span>
                      {plan.dietFriendly && (
                        <span className="badge badge-green" style={{ marginLeft: 6 }}>
                          ✓ Diet-friendly
                        </span>
                      )}
                      {plan.queue && (
                        <span className="badge badge-gray" style={{ marginLeft: 6 }}>
                          {plan.queue.badge}
                        </span>
                      )}
                    </p>
                  )}
                  <p style={{ fontSize: 13, fontStyle: "italic", color: "#555" }}>{plan.whyPicked}</p>
                  {plan.deliveryAddons && plan.deliveryAddons.length > 0 && (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: 12,
                        background: "#f3f8ff",
                        borderRadius: 8,
                        padding: 10,
                        border: "1px solid #d6e8ff",
                      }}
                    >
                      <strong>🎁 Delivery</strong>
                      <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
                        {plan.deliveryAddons.map((a) => (
                          <li key={a.id}>
                            {a.label} → {a.deliverTo} · ¥{a.price}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {phase === "confirm" && selected && (
            <div className="card animate-scale" style={{ padding: 24, marginTop: 24 }}>
              <h3>Confirm your choice</h3>
              <p style={{ margin: "12px 0", color: "#666" }}>
                {selected.restaurant?.name}
                {selected.activity ? ` + ${selected.activity.name}` : ""}
              </p>
              {selected.paidStops && selected.paidStops.length > 0 && (
                <div
                  style={{
                    fontSize: 13,
                    background: "#fffde7",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 12,
                  }}
                >
                  <strong>Estimated costs</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {selected.paidStops.map((s) => (
                      <li key={`${s.kind}-${s.name}`}>
                        {s.kind === "activity" ? "🎯" : "🍽"} {s.name}: ¥{s.perPerson}/pp → ¥{s.subtotal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selected.deliveryAddons && selected.deliveryAddons.length > 0 && (
                <div
                  style={{
                    fontSize: 13,
                    background: "#f3f8ff",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 12,
                    border: "1px solid #d6e8ff",
                  }}
                >
                  <strong>🎁 Delivery to restaurant</strong>
                  <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                    {selected.deliveryAddons.map((a) => (
                      <li key={a.id}>
                        {a.label} from {a.vendorName} → {a.deliverTo} · ¥{a.price}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button type="button" className="btn-secondary" onClick={() => setPhase("plans")}>
                  ← Back
                </button>
                {selected.restaurant ? (
                  <>
                    <button type="button" className="btn-primary" onClick={() => handleExecute(selected, "order")}>
                      Place order
                    </button>
                    <button type="button" className="btn-primary" onClick={() => handleExecute(selected, "reserve")}>
                      Reserve table
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-primary" onClick={() => handleExecute(selected, "share_only")}>
                    Save plan
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {phase === "done" && (
        <section className="card animate-scale" style={{ padding: 24, marginTop: 24, background: "#fffde7" }}>
          <h2>✅ All set</h2>
          <div style={{ marginTop: 12 }}>
            <ShareMessageBlock message={shareText} />
          </div>
          {chosenPlan?.deliveryAddons && chosenPlan.deliveryAddons.length > 0 && (
            <div
              style={{
                marginTop: 16,
                fontSize: 14,
                background: "#f3f8ff",
                borderRadius: 8,
                padding: 14,
                border: "1px solid #d6e8ff",
              }}
            >
              <strong>🎁 Delivery to restaurant</strong>
              <ul style={{ margin: "10px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
                {chosenPlan.deliveryAddons.map((a) => (
                  <li key={a.id}>
                    {a.label} from {a.vendorName} → {a.deliverTo} · ¥{a.price} · ~{a.etaMinutes} min
                  </li>
                ))}
              </ul>
            </div>
          )}
          <a href="/orders" style={{ display: "inline-block", marginTop: 16, fontWeight: 700, color: "#c99700" }}>
            View on Orders →
          </a>
        </section>
      )}
    </div>
  );
}
