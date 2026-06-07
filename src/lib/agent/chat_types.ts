import type { ActivityRoom, Plan } from "../types";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface ChatContext {
  hasPlans?: boolean;
  lastPlans?: Plan[];
  lastPlanIndex?: number;
  /** Plan the user swiped, confirmed, or reserved — used for "invite them there" */
  chosenPlan?: Plan;
  /** User accepted/saved a plan — enables post-plan delivery add-ons */
  planAccepted?: boolean;
  acceptedOrderId?: string;
  /** One-Stop Agent button — auto-pick top plan instead of showing alternatives */
  oneStopAgent?: boolean;
}
