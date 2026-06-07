import { Plan } from "../types";

export function send_plan_message(
  plan: Plan,
  recipients: string[],
  leaveTime = "2:00 PM"
): { message: string; recipients: string[]; sentAt: string } {
  if (plan.summary) {
    return {
      message: plan.summary.replace(/\n\nSwipe right.*$/s, "").trim(),
      recipients,
      sentAt: new Date().toISOString(),
    };
  }

  const parts: string[] = [`All set! Leave at ${leaveTime}.`];

  if (plan.itinerary?.length) {
    for (const step of plan.itinerary) {
      if (step.kind === "travel") continue;
      const when = step.timeEnd ? `${step.timeStart}–${step.timeEnd}` : step.timeStart;
      parts.push(`${when}: ${step.title}`);
    }
  } else {
    if (plan.activity) {
      parts.push(`First stop: ${plan.activity.name} (${plan.activity.district}).`);
    }
    if (plan.restaurant) {
      const queueNote = plan.queue?.waitMinutes
        ? `(~${plan.queue.waitMinutes} min queue — head over a bit early)`
        : "(seats available)";
      parts.push(`Then dinner at ${plan.restaurant.name} ${queueNote} 🍜`);
    }
  }
  if (plan.whyPicked) {
    parts.push(plan.whyPicked);
  }

  const message = parts.join(" ");
  return {
    message,
    recipients,
    sentAt: new Date().toISOString(),
  };
}
