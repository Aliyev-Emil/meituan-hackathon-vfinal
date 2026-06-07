"use client";

import type { Activity, Plan, Restaurant } from "@/lib/types";
import VenueCard from "@/components/VenueCard";
import MatchScoreBreakdown from "@/components/MatchScoreBreakdown";
import ShareMessageBlock from "@/components/ShareMessageBlock";
import { send_plan_message } from "@/lib/tools/send_plan_message";
import { collectVenuesFromPlan, OrderVenueItem, venueMeta } from "@/lib/utils/order_venues";

interface OrderPlanDetailsProps {
  plan?: Plan;
  fallbackRestaurant?: Restaurant | null;
  fallbackActivity?: Activity | null;
  partySize?: number;
  reservedTime?: string;
}

function VenueBlock({ item, reservedTime }: { item: OrderVenueItem; reservedTime?: string }) {
  const { subtitle, meta, badges } = venueMeta(item.kind, item.venue);
  const timeLabel =
    item.timeStart && item.timeEnd
      ? `${item.timeStart} – ${item.timeEnd}`
      : item.timeStart
        ? item.timeStart
        : undefined;

  return (
    <div>
      {(timeLabel || (item.kind === "restaurant" && reservedTime)) && (
        <p style={{ fontSize: 12, fontWeight: 700, color: "#c99700", marginBottom: 8 }}>
          {timeLabel}
          {timeLabel && item.kind === "restaurant" && reservedTime ? " · " : ""}
          {item.kind === "restaurant" && reservedTime ? `Reserved ${reservedTime}` : ""}
        </p>
      )}
      <VenueCard
        name={item.venue.name}
        subtitle={subtitle}
        imageUrl={item.venue.imageUrl}
        description={item.venue.description}
        meta={meta}
        badges={badges}
      />
    </div>
  );
}

export default function OrderPlanDetails({
  plan,
  fallbackRestaurant,
  fallbackActivity,
  partySize,
  reservedTime,
}: OrderPlanDetailsProps) {
  const venues = plan ? collectVenuesFromPlan(plan) : [];
  const fallbackItems: OrderVenueItem[] = [];

  if (!venues.length && fallbackRestaurant) {
    fallbackItems.push({ kind: "restaurant", venue: fallbackRestaurant });
  }
  if (!venues.length && fallbackActivity) {
    fallbackItems.push({ kind: "activity", venue: fallbackActivity });
  }

  const stops = venues.length ? venues : fallbackItems;
  if (!plan && stops.length === 0) return null;

  const shareMessage = plan ? send_plan_message(plan, ["wife", "friends"]).message : "";

  return (
    <section className="card" style={{ padding: 16, marginBottom: 16, background: "#fffde7" }}>
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>Plan details</h3>

      {plan && (
        <div style={{ marginBottom: 12 }}>
          <MatchScoreBreakdown plan={plan} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {plan.planDistrict && <span className="badge badge-gray">📍 {plan.planDistrict}</span>}
          {plan.durationHours != null && (
            <span className="badge badge-gray">{plan.durationHours}h outing</span>
          )}
          {partySize != null && partySize > 0 && (
            <span className="badge badge-gray">Party of {partySize}</span>
          )}
          {plan.estimatedTotal != null && plan.estimatedTotal > 0 && (
            <span className="badge badge-gray">~¥{plan.estimatedTotal} total</span>
          )}
          {plan.cultureTag && <span className="badge badge-gray">{plan.cultureTag}</span>}
          </div>
        </div>
      )}

      {shareMessage && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#666", marginBottom: 8 }}>Share message</p>
          <ShareMessageBlock message={shareMessage} />
        </div>
      )}

      {plan?.whyPicked && (
        <p style={{ fontSize: 13, color: "#555", marginBottom: 12, lineHeight: 1.5 }}>
          <strong>Why this plan:</strong> {plan.whyPicked}
        </p>
      )}

      {plan?.paidStops && plan.paidStops.length > 0 && (
        <div
          style={{
            fontSize: 13,
            background: "#fff",
            borderRadius: 8,
            padding: 12,
            marginBottom: 12,
            border: "1px solid #f0e6a0",
          }}
        >
          <strong>Estimated costs</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {plan.paidStops.map((s) => (
              <li key={`${s.kind}-${s.name}`}>
                {s.kind === "restaurant" ? "🍽" : "🎯"} {s.name}: ¥{s.perPerson}/pp → ¥{s.subtotal}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan?.deliveryAddons && plan.deliveryAddons.length > 0 && (
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
                {a.label} from {a.vendorName} → {a.deliverTo} · ¥{a.price} · ~{a.etaMinutes} min ·{" "}
                {a.status.replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {stops.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {stops.map((item) => (
            <VenueBlock
              key={item.venue.id}
              item={item}
              reservedTime={item.kind === "restaurant" ? reservedTime : undefined}
            />
          ))}
        </div>
      )}

      {plan?.itinerary && plan.itinerary.some((s) => s.kind === "travel") && (
        <div style={{ marginTop: 14, fontSize: 13, color: "#666" }}>
          <strong>Travel between stops</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {plan.itinerary
              .filter((s) => s.kind === "travel")
              .map((s) => (
                <li key={`travel-${s.order}`}>
                  {s.timeStart}: {s.title}
                  {s.travelMinutes ? ` (~${s.travelMinutes} min)` : ""}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
