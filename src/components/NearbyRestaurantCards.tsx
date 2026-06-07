"use client";

import VenueImage from "@/components/VenueImage";

export interface NearbyRestaurantCard {
  id: string;
  name: string;
  distanceM: number;
  imageUrl: string;
  cuisine?: string;
  pricePerPerson?: number;
}

interface NearbyRestaurantCardsProps {
  restaurants: NearbyRestaurantCard[];
  onSelect: (restaurant: NearbyRestaurantCard) => void;
  emptyMessage?: string;
}

export default function NearbyRestaurantCards({
  restaurants,
  onSelect,
  emptyMessage = "No venues found nearby.",
}: NearbyRestaurantCardsProps) {
  if (restaurants.length === 0) {
    return <p className="planner-nearby-empty">{emptyMessage}</p>;
  }

  return (
    <div className="planner-nearby-scroll">
      {restaurants.map((r) => (
        <button
          key={r.id}
          type="button"
          className="planner-nearby-card"
          onClick={() => onSelect(r)}
        >
          <div className="planner-nearby-card__image">
            <VenueImage src={r.imageUrl} alt={r.name} fill />
          </div>
          <div className="planner-nearby-card__body">
            <div className="planner-nearby-card__name">{r.name}</div>
            <div className="planner-nearby-card__meta">
              {r.distanceM}m · ¥{r.pricePerPerson}/pp
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
