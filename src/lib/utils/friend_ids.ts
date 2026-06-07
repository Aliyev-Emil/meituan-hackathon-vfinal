import { USERS, CURRENT_USER_ID } from "../data/users";

/** Extract friend user ids mentioned in natural language */
export function extractFriendIdsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  const mentions = text.match(/@(zhangwei|lina|wangfang|xiaoming|joshua|haeun|emil)/gi);
  if (mentions) {
    for (const m of mentions) found.add(m.replace("@", "").toLowerCase());
  }

  for (const id of Object.keys(USERS)) {
    if (id === CURRENT_USER_ID) continue;
    const profile = USERS[id];
    if (lower.includes(id)) found.add(id);
    if (profile.name && lower.includes(profile.name.toLowerCase())) found.add(id);
  }

  return [...found];
}

export function isInviteRequest(text: string): boolean {
  return /invite|邀请|叫上|拉上|带上|ask\s+.*\s+to\s+join|come\s+with|一起|join\s+us|there\s+too|也来|也叫/i.test(
    text
  );
}
