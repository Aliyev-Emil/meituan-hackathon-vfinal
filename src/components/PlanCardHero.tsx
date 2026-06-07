import type { Plan } from "@/lib/types";
import { visiblePlanPhotoStops } from "@/lib/utils/plan_hero";
import VenueImage from "@/components/VenueImage";

interface PlanCardHeroProps {
  plan: Plan;
}

/** Compact strip — one square-ish tile per stop, side by side. */
export default function PlanCardHero({ plan }: PlanCardHeroProps) {
  const { stops, overflowCount } = visiblePlanPhotoStops(plan);
  const totalStops = overflowCount > 0 ? stops.length + overflowCount : stops.length;

  if (stops.length === 0) {
    return <div className="plan-card-photos plan-card-photos--empty" aria-hidden />;
  }

  return (
    <div className="plan-card-photos" aria-label={`${totalStops} stops in plan`}>
      {stops.map((stop) => (
        <div key={stop.id} className="plan-card-photos__tile">
          <VenueImage src={stop.src} alt={stop.name} fill />
          <span className="plan-card-photos__label">
            {stop.emoji} {stop.name}
          </span>
        </div>
      ))}
      {overflowCount > 0 && (
        <div className="plan-card-photos__tile plan-card-photos__overflow" aria-label={`${overflowCount} more stops`}>
          +{overflowCount}
        </div>
      )}
    </div>
  );
}
