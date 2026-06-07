"use client";

import { useCallback, useRef, useState } from "react";
import type { Plan } from "@/lib/types";
import MatchScoreBreakdown from "@/components/MatchScoreBreakdown";
import PlanCardHero from "@/components/PlanCardHero";
import { reservationLoadLabel } from "@/lib/utils/reservation_load";

const SWIPE_THRESHOLD = 90;

interface SwipePlanDeckProps {
  plans: Plan[];
  planIndex: number;
  onAccept: (plan: Plan) => void;
  onReject: () => void;
  onSplitBill?: (plan: Plan) => void;
  splitBusy?: boolean;
  busy?: boolean;
}

export default function SwipePlanDeck({
  plans,
  planIndex,
  onAccept,
  onReject,
  onSplitBill,
  splitBusy = false,
  busy = false,
}: SwipePlanDeckProps) {
  const plan = plans[planIndex];
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const active = useRef(false);

  const resetDrag = useCallback(() => {
    setOffsetX(0);
    setDragging(false);
    active.current = false;
  }, []);

  const commitSwipe = useCallback(
    (dx: number) => {
      if (busy || !plan) return;
      if (dx > SWIPE_THRESHOLD) {
        onAccept(plan);
        resetDrag();
        return;
      }
      if (dx < -SWIPE_THRESHOLD) {
        onReject();
        resetDrag();
        return;
      }
      resetDrag();
    },
    [busy, onAccept, onReject, plan, resetDrag]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    active.current = true;
    startX.current = e.clientX;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!active.current) return;
    setOffsetX(e.clientX - startX.current);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!active.current) return;
    commitSwipe(e.clientX - startX.current);
  };

  if (!plan) {
    return (
      <div className="card" style={{ padding: 24, textAlign: "center", color: "#666" }}>
        No more plan options. Try a different request in chat.
      </div>
    );
  }

  const rotate = offsetX * 0.04;
  const acceptOpacity = Math.min(1, Math.max(0, offsetX / SWIPE_THRESHOLD));
  const rejectOpacity = Math.min(1, Math.max(0, -offsetX / SWIPE_THRESHOLD));

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          fontSize: 13,
          color: "#666",
        }}
      >
        <span>
          Plan {planIndex + 1} of {plans.length}
        </span>
        <span>← pass · accept →</span>
      </div>

      <div
        className={`swipe-plan-card card ${dragging ? "swipe-plan-card--dragging" : ""}`}
        style={{
          transform: `translateX(${offsetX}px) rotate(${rotate}deg)`,
          touchAction: "pan-y",
          cursor: busy ? "wait" : "grab",
          opacity: busy ? 0.85 : 1,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={resetDrag}
      >
        <div
          className="swipe-hint swipe-hint--reject"
          style={{ opacity: rejectOpacity }}
          aria-hidden
        >
          PASS
        </div>
        <div
          className="swipe-hint swipe-hint--accept"
          style={{ opacity: acceptOpacity }}
          aria-hidden
        >
          BOOK
        </div>

        <PlanCardHero plan={plan} />

        <div style={{ padding: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <MatchScoreBreakdown plan={plan} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {plan.durationHours != null && (
              <span className="badge badge-gray">{plan.durationHours}h outing</span>
            )}
            {plan.planDistrict && (
              <span className="badge badge-gray">📍 {plan.planDistrict}</span>
            )}
            {plan.estimatedTotal != null && plan.estimatedTotal > 0 && (
              <span className="badge badge-gray">¥{plan.estimatedTotal} total</span>
            )}
            {plan.restaurant && (
              <span className="badge badge-gray">
                {reservationLoadLabel(plan.restaurant.reservationLoad)}
              </span>
            )}
            {plan.queue && (
              <span className="badge badge-gray">{plan.queue.badge}</span>
            )}
            <span className="badge badge-gray">{plan.cultureTag}</span>
          </div>

          {plan.paidStops && plan.paidStops.length > 0 && (
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
                {plan.paidStops.map((s) => (
                  <li key={`${s.kind}-${s.name}`}>
                    {s.name}: ¥{s.perPerson}/pp → ¥{s.subtotal}
                  </li>
                ))}
              </ul>
              {plan.splitBillEligible && plan.estimatedPerPerson != null && (
                <p style={{ margin: "8px 0 0", color: "#555" }}>
                  Split the whole outing: ~¥{plan.estimatedPerPerson}/person when everyone chips in.
                </p>
              )}
            </div>
          )}

          {plan.deliveryAddons && plan.deliveryAddons.length > 0 && (
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
                {plan.deliveryAddons.map((a) => (
                  <li key={a.id}>
                    {a.label} from {a.vendorName} → {a.deliverTo} · ¥{a.price} · ~{a.etaMinutes} min
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.summary && (
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                marginBottom: 16,
                whiteSpace: "pre-line",
                color: "#333",
              }}
            >
              {plan.summary.replace(/\n\nSwipe right.*$/s, "")}
            </p>
          )}

          {plan.itinerary && plan.itinerary.length > 0 && (
            <ol style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {plan.itinerary.map((step) => (
                <li
                  key={step.order}
                  style={{
                    display: "flex",
                    gap: 12,
                    marginBottom: 12,
                    paddingBottom: 12,
                    borderBottom:
                      step.order < plan.itinerary!.length ? "1px solid #f0f0f0" : "none",
                  }}
                >
                  <span
                    style={{
                      minWidth: 52,
                      fontSize: 12,
                      fontWeight: 700,
                      color: step.kind === "travel" ? "#999" : "#c99700",
                    }}
                  >
                    {step.timeStart}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: step.kind === "travel" ? 500 : 700, fontSize: 14 }}>
                      {step.kind === "activity" && "🎯 "}
                      {step.kind === "restaurant" && "🍽 "}
                      {step.kind === "travel" && "🚗 "}
                      {step.title}
                    </div>
                    {step.subtitle && (
                      <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{step.subtitle}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}

          <p style={{ fontSize: 13, fontStyle: "italic", color: "#555", marginTop: 8 }}>
            {plan.whyPicked}
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => onReject()}
          aria-label="Pass — show another plan"
        >
          ← Pass
        </button>
        {plan.splitBillEligible && onSplitBill && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || splitBusy}
            onClick={() => onSplitBill(plan)}
            aria-label="Split whole outing bill with friends"
          >
            Split bill ¥{plan.estimatedTotal}
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={busy || !plan.restaurant}
          onClick={() => onAccept(plan)}
          aria-label="Accept plan and reserve"
        >
          Book plan →
        </button>
      </div>
    </div>
  );
}
