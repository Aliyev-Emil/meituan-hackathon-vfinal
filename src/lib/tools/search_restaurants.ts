import { RESTAURANTS } from "../data/restaurants";
import { PriceTier, Restaurant, TimeOfDay } from "../types";
import { priceMatchesTier } from "../utils/price_tier";
import { haversineM } from "./parse_intent";

export interface RestaurantSearchParams {
  location: { lat: number; lng: number };
  district?: string;
  cuisines: string[];
  dietScoreMin: number;
  budgetMin: number;
  budgetMax: number;
  priceTier?: PriceTier | null;
  ratingMin: number;
  distanceMaxM: number;
  timeOfDay: TimeOfDay;
  familyFriendly?: boolean;
  quiet?: boolean;
  prepTimeMaxMin?: number;
}

function cuisineMatches(r: Restaurant, cuisines: string[]): boolean {
  if (cuisines.length === 0) return true;
  return cuisines.some(
    (c) =>
      r.cuisine.toLowerCase() === c.toLowerCase() ||
      r.cuisine.toLowerCase().includes(c.toLowerCase()) ||
      c.toLowerCase().includes(r.cuisine.toLowerCase()) ||
      r.cultureTag.includes(c) ||
      c.includes(r.cultureTag)
  );
}

function menuMatches(timeOfDay: TimeOfDay, menuTypes: TimeOfDay[]): boolean {
  if (menuTypes.includes(timeOfDay)) return true;
  if (timeOfDay === "late_night") {
    return menuTypes.some((m) => ["dinner", "evening", "late_night", "lunch", "brunch"].includes(m));
  }
  if (timeOfDay === "evening") {
    return menuTypes.some((m) => ["dinner", "evening", "lunch", "late_night"].includes(m));
  }
  if (timeOfDay === "afternoon") {
    return menuTypes.some((m) => ["lunch", "afternoon", "brunch", "dinner"].includes(m));
  }
  return menuTypes.length > 0;
}

function filterRestaurants(params: RestaurantSearchParams, strictCuisine: boolean): Restaurant[] {
  const {
    location,
    cuisines,
    dietScoreMin,
    budgetMin,
    budgetMax,
    priceTier,
    ratingMin,
    distanceMaxM,
    timeOfDay,
    familyFriendly,
    quiet,
    prepTimeMaxMin,
  } = params;

  return RESTAURANTS.filter((r) => {
    if (params.district && r.district !== params.district) return false;
    if (r.rating < ratingMin) return false;
    if (priceTier) {
      if (!priceMatchesTier(r.pricePerPerson, priceTier)) return false;
    } else {
      if (r.pricePerPerson > budgetMax * 2) return false;
      if (r.pricePerPerson < budgetMin * 0.3) return false;
    }
    if (dietScoreMin > 0 && r.dietScore < dietScoreMin - 0.05) return false;
    if (!menuMatches(timeOfDay, r.menuTypes)) return false;
    if (familyFriendly && !r.familyFriendly) return false;
    if (quiet && r.reservationLoad > 55) return false;
    if (prepTimeMaxMin && r.avgPrepMin > prepTimeMaxMin) return false;
    if (haversineM(location.lat, location.lng, r.lat, r.lng) > distanceMaxM) return false;
    if (strictCuisine && cuisines.length > 0 && !cuisineMatches(r, cuisines)) return false;
    return true;
  })
    .map((r) => ({
      restaurant: r,
      distance: haversineM(location.lat, location.lng, r.lat, r.lng),
    }))
    .sort((a, b) => {
      if (quiet) {
        const loadDiff = a.restaurant.reservationLoad - b.restaurant.reservationLoad;
        if (loadDiff !== 0) return loadDiff;
      }
      return a.distance - b.distance;
    })
    .map((x) => x.restaurant);
}

export function search_restaurants(params: RestaurantSearchParams): Restaurant[] {
  let results = filterRestaurants(params, true);
  if (results.length > 0) return results;

  results = filterRestaurants({ ...params, cuisines: [] }, false);
  if (results.length > 0) return results;

  return filterRestaurants(
    {
      ...params,
      cuisines: [],
      dietScoreMin: 0,
      familyFriendly: false,
      quiet: false,
      ratingMin: 3.5,
      distanceMaxM: params.distanceMaxM * 1.5,
    },
    false
  );
}

export function listNearbyCuisines(
  location: { lat: number; lng: number },
  maxM = 10000,
  district?: string
): string[] {
  const cuisines = new Set<string>();
  for (const r of RESTAURANTS) {
    if (district) {
      if (r.district !== district) continue;
    } else if (haversineM(location.lat, location.lng, r.lat, r.lng) > maxM) {
      continue;
    }
    cuisines.add(`${r.cuisine} (${r.cultureTag})`);
  }
  return [...cuisines].sort();
}
