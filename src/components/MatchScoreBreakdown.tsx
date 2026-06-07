import type { Plan } from "@/lib/types";

interface MatchScoreBreakdownProps {
  plan: Plan;
  /** Tighter spacing for grid cards */
  compact?: boolean;
}

export default function MatchScoreBreakdown({ plan, compact = false }: MatchScoreBreakdownProps) {
  const reasons = plan.matchReasons ?? [];

  if (plan.matchScore == null) return null;

  return (
    <div className={`match-score-breakdown${compact ? " match-score-breakdown--compact" : ""}`}>
      <span className="badge badge-yellow">{plan.matchScore}% match</span>
      {reasons.length > 0 && (
        <ul className="match-reasons">
          {reasons.map((reason) => (
            <li key={reason}>
              <span className="match-reason-check" aria-hidden>
                ✓
              </span>
              {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
