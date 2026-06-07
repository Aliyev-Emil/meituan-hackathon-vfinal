import { QueueStatus } from "../types";
import { RESTAURANTS } from "../data/restaurants";

const MOCK_QUEUES: Record<string, { wait: number; seats: boolean }> = {
  r1: { wait: 15, seats: false },
  r2: { wait: 25, seats: false },
  r3: { wait: 5, seats: true },
  r4: { wait: 10, seats: true },
  r5: { wait: 20, seats: false },
  r6: { wait: 0, seats: true },
  r7: { wait: 12, seats: true },
  r8: { wait: 0, seats: true },
  r9: { wait: 18, seats: false },
  r10: { wait: 8, seats: true },
};

export function check_queue_status(venueId: string): QueueStatus {
  const q = MOCK_QUEUES[venueId] ?? { wait: 10, seats: true };
  const restaurant = RESTAURANTS.find((r) => r.id === venueId);
  const reservationLoad = restaurant?.reservationLoad;
  const badge =
    q.wait === 0
      ? "✓ Seats available"
      : q.seats
        ? `🕐 ~${q.wait} min wait`
        : `🕐 ~${q.wait} min queue`;
  return {
    venueId,
    waitMinutes: q.wait,
    hasSeats: q.seats,
    badge,
    reservationLoad,
  };
}

/** Score 0–100 for ranking — higher is better (shorter wait / seats available). */
export function queueScoreFromStatus(queue: QueueStatus): number {
  if (queue.waitMinutes === 0 && queue.hasSeats) return 100;
  if (queue.waitMinutes <= 5) return 92;
  if (queue.waitMinutes <= 10) return 78;
  if (queue.waitMinutes <= 15) return 62;
  if (queue.waitMinutes <= 20) return 45;
  if (queue.waitMinutes <= 25) return 28;
  if (!queue.hasSeats) return Math.max(8, 22 - queue.waitMinutes / 2);
  return 18;
}

export function queueRankingNote(queue: QueueStatus): string | null {
  if (queue.waitMinutes === 0 && queue.hasSeats) return "seats available now";
  if (queue.waitMinutes <= 10) return `~${queue.waitMinutes} min wait`;
  if (queue.waitMinutes >= 25) return `long queue (~${queue.waitMinutes} min)`;
  if (queue.waitMinutes >= 15) return `~${queue.waitMinutes} min wait`;
  return null;
}
