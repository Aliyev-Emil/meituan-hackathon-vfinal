export type Scenario = "family" | "friends" | "solo";

/** Per-person price band when user asks for cheap / medium / expensive */
export type PriceTier = "cheap" | "medium" | "expensive";

export type ItineraryStopKind = "activity" | "restaurant";

export type ItineraryPattern =
  | "activity_first"
  | "restaurant_first"
  | "restaurant_activity_restaurant"
  | "activity_restaurant_activity"
  | "auto";

export type TimeOfDay = "morning" | "brunch" | "lunch" | "afternoon" | "dinner" | "evening" | "late_night";

export type DeliveryAddonKind = "cake" | "flowers" | "champagne" | "gift" | "balloons";

export type DeliveryAddonStatus = "scheduled" | "preparing" | "on_the_way" | "delivered";

export interface PlanDeliveryAddon {
  id: string;
  kind: DeliveryAddonKind;
  label: string;
  vendorName: string;
  price: number;
  etaMinutes: number;
  deliverTo: string;
  deliverToVenueId?: string;
  status: DeliveryAddonStatus;
}

export interface ParsedIntent {
  raw: string;
  keywords: string[];
  scenario: Scenario;
  groupSize: number;
  includeActivities: boolean;
  includeRestaurant: boolean;
  cuisines: string[];
  budgetMin: number;
  budgetMax: number;
  /** Set when user mentions cheap / medium / expensive — enables strict ¥/pp filtering */
  priceTier?: PriceTier | null;
  ratingMin: number;
  distanceMaxM: number;
  dietFriendly: boolean;
  quietAmbiance: boolean;
  familyFriendly: boolean;
  prepTimeMaxMin?: number;
  timeOfDay: TimeOfDay;
  location: { lat: number; lng: number; label: string };
  /** When user names a district (e.g. Futian), filter venues there */
  targetDistrict?: string;
  /** Prefer outdoor / indoor / mixed activities when planning */
  activitySettings?: ActivitySetting[];
  /** Prefer activity types (city_walk, exhibition, etc.) */
  activityTypes?: Activity["type"][];
  /** When true, outdoor/indoor filters exclude mixed venues */
  activitySettingStrict?: boolean;
  /** Rain or bad weather — exclude outdoor and weather-sensitive mixed venues */
  rainSafeActivities?: boolean;
  friendIds: string[];
  wantsReserve: boolean;
  wantsOrder: boolean;
  /** User asked to see options first */
  wantsPlansExplicit: boolean;
  /** User wants a full timed plan (not just a single venue) */
  wantsFullItinerary: boolean;
  /** Total outing length in hours */
  durationHours?: number;
  /** @deprecated Use itineraryPattern — kept for LLM/rules compat */
  itineraryOrder?: "activity_first" | "restaurant_first";
  /** Stop sequence for full plans (2- or 3-stop) */
  itineraryPattern?: ItineraryPattern;
  /** direct_action = order/reserve now; show_plans = cards; follow_up = act on prior plans */
  interactionMode: "show_plans" | "direct_action" | "follow_up";
  reserveTime?: string;
  wantsInviteFriends?: boolean;
  inviteFriendIds?: string[];
  inviteActivityId?: string;
  oneStop?: {
    reserve?: boolean;
    partySize?: number;
    reserveTime?: string;
    checkTraffic?: boolean;
    remindMinutesBefore?: number;
  };
  /** Cakes, flowers, gifts, etc. to deliver to the restaurant */
  deliveryAddonKinds?: DeliveryAddonKind[];
}

export interface Restaurant {
  id: string;
  name: string;
  nameZh: string;
  cuisine: string;
  cultureTag: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  pricePerPerson: number;
  dietScore: number;
  familyFriendly: boolean;
  parking: boolean;
  quiet: boolean;
  /** Share of tables already reserved for the current peak slot (0–100). Lower = quieter. */
  reservationLoad: number;
  reservable: boolean;
  avgPrepMin: number;
  menuTypes: TimeOfDay[];
  features: string[];
  imageUrl: string;
  description: string;
}

/** Whether the activity is mainly indoors, outdoors, or both */
export type ActivitySetting = "indoor" | "outdoor" | "mixed";

export interface Activity {
  id: string;
  name: string;
  nameZh: string;
  type: "kids_park" | "exhibition" | "city_walk" | "food_street" | "mall";
  setting: ActivitySetting;
  district: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  durationHours: number;
  scenarios: Scenario[];
  timeSlots: TimeOfDay[];
  familyFriendly: boolean;
  /** Ticket / admission per person (0 = free to enter) */
  admissionPerPerson: number;
  imageUrl: string;
  description: string;
}

export interface QueueStatus {
  venueId: string;
  waitMinutes: number;
  hasSeats: boolean;
  badge: string;
  /** Tables already reserved for the peak slot (0–100) */
  reservationLoad?: number;
}

export type ItineraryStepKind = "activity" | "restaurant" | "travel";

export interface ItineraryStep {
  order: number;
  kind: ItineraryStepKind;
  timeStart: string;
  timeEnd?: string;
  title: string;
  subtitle?: string;
  activity?: Activity;
  restaurant?: Restaurant;
  travelMinutes?: number;
}

export interface Plan {
  id: string;
  activity?: Activity;
  restaurant?: Restaurant;
  queue?: QueueStatus;
  matchScore: number;
  distanceScore: number;
  preferenceMatch: number;
  /** Short bullets explaining the match score (distance, budget, queue, etc.) */
  matchReasons?: string[];
  cultureTag: string;
  dietFriendly: boolean;
  whyPicked: string;
  /** Full timed itinerary (create-a-plan flow) */
  itinerary?: ItineraryStep[];
  summary?: string;
  durationHours?: number;
  /** All stops in one district when set */
  planDistrict?: string;
  paidStops?: { kind: "activity" | "restaurant"; name: string; perPerson: number; subtotal: number }[];
  estimatedTotal?: number;
  estimatedPerPerson?: number;
  /** True when 2+ paid stops (meals + ticketed activities) */
  splitBillEligible?: boolean;
  /** Cakes, flowers, gifts delivered to restaurant stops */
  deliveryAddons?: PlanDeliveryAddon[];
}

export interface UserProfile {
  id: string;
  name: string;
  avatarUrl: string;
  bio: string;
  /** Nationality for cuisine recommendations (e.g. Korean, Chinese) */
  nation?: string;
  lat: number;
  lng: number;
  locationLabel: string;
  friendIds: string[];
  favorites: string[];
  checkedActivities: string[];
  purchaseHistory: { venueId: string; amount: number; scenario: Scenario; date: string }[];
  pastOrders: { id: string; restaurantId: string; status: string; lat: number; lng: number }[];
}

export interface FriendRequest {
  from: string;
  to: string;
  status: "pending" | "accepted";
}

export interface SplitBillRequest {
  id: string;
  orderId: string;
  planId?: string;
  payerId: string;
  friendIds: string[];
  amount: number;
  accepted: Record<string, boolean>;
  status: "pending" | "completed";
}

export type InviteVenueKind = "activity" | "restaurant" | "plan";

/** Group invite room for an activity, restaurant, or full plan */
export interface ActivityRoom {
  id: string;
  venueKind: InviteVenueKind;
  /** Display title (activity name, restaurant name, or plan label) */
  activityName: string;
  activityId?: string;
  restaurantId?: string;
  restaurantName?: string;
  hostId: string;
  memberIds: string[];
  invitedIds: string[];
  planId?: string;
  message: string;
  status: "open" | "confirmed";
  createdAt: string;
}

export interface ActivityInvitation {
  id: string;
  roomId: string;
  venueKind: InviteVenueKind;
  activityId?: string;
  restaurantId?: string;
  from: string;
  to: string;
  message: string;
}
