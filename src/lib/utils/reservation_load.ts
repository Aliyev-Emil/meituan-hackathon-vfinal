/** 0 = empty, 100 = fully booked for the current dinner slot */
export function quietScoreFromReservationLoad(load: number): number {
  return Math.max(0, 100 - Math.min(100, load));
}

export function reservationLoadLabel(load: number): string {
  if (load <= 25) return "Plenty of tables · quiet";
  if (load <= 45) return "Light reservations";
  if (load <= 65) return "Moderately busy";
  if (load <= 80) return "Popular · book soon";
  return "Very busy tonight";
}

export function reservationAvailabilityNote(load: number): string | null {
  if (load <= 30) return `${load}% reserved — calm dining room`;
  if (load <= 50) return `${load}% reserved — good availability`;
  if (load >= 75) return `${load}% reserved — busy spot`;
  return null;
}
