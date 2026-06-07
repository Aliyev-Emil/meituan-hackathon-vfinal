import type { Activity } from "../types";

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "shenzhen",
  "futian",
  "nanshan",
  "day",
  "city",
  "park",
  "center",
  "centre",
]);

/** Partial names & keywords → activity id */
const ACTIVITY_ALIASES: Record<string, string[]> = {
  a25: ["mangrove", "boardwalk", "红树林", "栈道", "mangroves"],
  a6: ["lianhuashan", "lotus", "莲花山"],
  a4: ["shenzhen bay", "bay walk", "深圳湾"],
  a22: ["qianhai", "前海", "promenade"],
  a2: ["museum", "博物馆", "citizen center"],
  a19: ["mixc", "万象城"],
};

function significantTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s·\-_,，、/]+/)
    .map((t) => t.replace(/[^a-z0-9\u4e00-\u9fff]/g, ""))
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function scoreActivityMention(text: string, activity: Activity): number {
  const lower = text.toLowerCase();
  let score = 0;

  const fullName = activity.name.toLowerCase();
  if (lower.includes(fullName)) score += 120;
  if (activity.nameZh && lower.includes(activity.nameZh)) score += 120;

  const nameTokens = significantTokens(activity.name);
  const matched = nameTokens.filter((t) => lower.includes(t));
  if (matched.length >= 2) score += 55 + matched.length * 12;
  else if (matched.length === 1 && matched[0].length >= 5) score += 45;

  const descTokens = significantTokens(activity.description).slice(0, 6);
  const descMatched = descTokens.filter((t) => lower.includes(t));
  score += Math.min(descMatched.length * 8, 24);

  const aliases = ACTIVITY_ALIASES[activity.id] ?? [];
  for (const alias of aliases) {
    if (lower.includes(alias.toLowerCase())) score += 35;
  }

  if (/mangrove|红树林/i.test(lower) && /boardwalk|栈道|walk/i.test(lower) && activity.id === "a25") {
    score += 90;
  }

  return score;
}

/** Pick the plan activity the user referred to by name or keywords */
export function findActivityMentionedInText(text: string, candidates: Activity[]): Activity | null {
  if (!candidates.length) return null;

  let best: { activity: Activity; score: number } | null = null;
  for (const a of candidates) {
    const score = scoreActivityMention(text, a);
    if (!best || score > best.score) best = { activity: a, score };
  }

  return best && best.score >= 42 ? best.activity : null;
}
