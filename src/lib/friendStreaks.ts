/**
 * Friend streaks and best friends — pure logic (parsing, clock-aware streak state, ranking, badge
 * selection and labels). Data comes from the `get_friend_streaks` RPC
 * (supabase/migrations/20261012120000_friend_streaks.sql).
 *
 * Rules (also summarised for users in the footnote on the friend detail screen):
 * - 🔥 N — streak: N consecutive calendar days (Europe/Warsaw, computed by the server) on which
 *   both of you sent each other at least one NiX (photo/video). Text messages do not count.
 *   Shown from STREAK_MIN_VISIBLE_DAYS days, like Snapchat.
 * - ⌛ — the streak is at risk: today is not complete yet and less than 4 h of the day remain.
 * - 😊 — best friend: one of your top BEST_FRIENDS_LIMIT friends by NiX + messages exchanged in
 *   the last 30 days (at least BEST_FRIEND_MIN_EXCHANGES_30D).
 * - 💛 — #1 best friend for two weeks in a row: the clear leader of both the last 7 days and the
 *   7 days before that.
 *
 * The snapshot can be minutes or hours old (cache), so the streak state is recomputed against the
 * current time: a day that ended without both sides sending drops the streak, a complete day
 * carries it into the next one (where it can become at risk in the evening).
 */

export const STREAK_MIN_VISIBLE_DAYS = 3;
export const STREAK_AT_RISK_WINDOW_MS = 4 * 60 * 60_000;
export const BEST_FRIENDS_LIMIT = 5;
export const BEST_FRIEND_MIN_EXCHANGES_30D = 3;
export const TOP_BEST_FRIEND_MIN_WEEKLY_EXCHANGES = 2;

const DAY_MS = 24 * 60 * 60_000;

/** Language-neutral glyphs; labels for VoiceOver come from i18n (`friendship.*`). */
export const FRIENDSHIP_EMOJI = {
  topBestFriend: '💛',
  bestFriend: '😊',
  streak: '🔥',
  atRisk: '⌛',
} as const;

export type FriendStreakSnapshot = {
  peerId: string;
  /** Streak at fetch time: through today when today is complete, else through yesterday. */
  streakDays: number;
  /** Last day (YYYY-MM-DD, Warsaw) on which both sent a NiX. */
  lastExchangeDay: string | null;
  todayComplete: boolean;
  meSentToday: boolean;
  peerSentToday: boolean;
  /** End of the server's "today" (epoch ms). */
  dayEndsAt: number;
  exchangeCount30d: number;
  exchangeCount7d: number;
  exchangeCountPrev7d: number;
};

function toCount(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/** Validates RPC rows; malformed rows are dropped instead of failing the whole list. */
export function parseFriendStreakRows(data: unknown): FriendStreakSnapshot[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row): FriendStreakSnapshot[] => {
    if (!row || typeof row !== 'object') return [];
    const value = row as Record<string, unknown>;
    const peerId = typeof value.peer_id === 'string' ? value.peer_id : '';
    const dayEndsAt = typeof value.day_ends_at === 'string' ? Date.parse(value.day_ends_at) : NaN;
    if (!peerId || !Number.isFinite(dayEndsAt)) return [];
    return [
      {
        peerId,
        streakDays: toCount(value.streak_days),
        lastExchangeDay: typeof value.last_exchange_day === 'string' ? value.last_exchange_day : null,
        todayComplete: value.today_complete === true,
        meSentToday: value.me_sent_today === true,
        peerSentToday: value.peer_sent_today === true,
        dayEndsAt,
        exchangeCount30d: toCount(value.exchange_count_30d),
        exchangeCount7d: toCount(value.exchange_count_7d),
        exchangeCountPrev7d: toCount(value.exchange_count_prev_7d),
      },
    ];
  });
}

export type StreakState = { days: number; atRisk: boolean; dayEndsAt: number };

/** The streak as of `now`, rolling the snapshot forward when its day has already ended. */
export function resolveStreakState(snapshot: FriendStreakSnapshot, now: number): StreakState {
  if (now < snapshot.dayEndsAt) {
    const days = snapshot.streakDays;
    return {
      days,
      atRisk:
        days > 0 &&
        !snapshot.todayComplete &&
        snapshot.dayEndsAt - now <= STREAK_AT_RISK_WINDOW_MS,
      dayEndsAt: snapshot.dayEndsAt,
    };
  }
  const daysLater = 1 + Math.floor((now - snapshot.dayEndsAt) / DAY_MS);
  const dayEndsAt = snapshot.dayEndsAt + daysLater * DAY_MS;
  // Only a complete day carries the streak into the next one; a later day starts empty.
  if (daysLater !== 1 || !snapshot.todayComplete || snapshot.streakDays === 0) {
    return { days: 0, atRisk: false, dayEndsAt };
  }
  return {
    days: snapshot.streakDays,
    atRisk: dayEndsAt - now <= STREAK_AT_RISK_WINDOW_MS,
    dayEndsAt,
  };
}

/** Top friends by 30-day exchanges (ties: more recent streak day, then id for stability). */
export function rankBestFriends(
  snapshots: readonly FriendStreakSnapshot[],
  limit = BEST_FRIENDS_LIMIT,
): string[] {
  if (limit <= 0) return [];
  return snapshots
    .filter((snapshot) => snapshot.exchangeCount30d >= BEST_FRIEND_MIN_EXCHANGES_30D)
    .sort(
      (left, right) =>
        right.exchangeCount30d - left.exchangeCount30d ||
        (right.lastExchangeDay ?? '').localeCompare(left.lastExchangeDay ?? '') ||
        left.peerId.localeCompare(right.peerId),
    )
    .slice(0, limit)
    .map((snapshot) => snapshot.peerId);
}

function soleLeader(
  snapshots: readonly FriendStreakSnapshot[],
  count: (snapshot: FriendStreakSnapshot) => number,
): string | null {
  let leader: FriendStreakSnapshot | null = null;
  let tie = false;
  for (const snapshot of snapshots) {
    const value = count(snapshot);
    if (value < TOP_BEST_FRIEND_MIN_WEEKLY_EXCHANGES) continue;
    if (!leader || value > count(leader)) {
      leader = snapshot;
      tie = false;
    } else if (value === count(leader)) {
      tie = true;
    }
  }
  return leader && !tie ? leader.peerId : null;
}

/** 💛: the same friend clearly leads both of the last two weeks. */
export function resolveTopBestFriend(snapshots: readonly FriendStreakSnapshot[]): string | null {
  const thisWeek = soleLeader(snapshots, (snapshot) => snapshot.exchangeCount7d);
  if (!thisWeek) return null;
  return soleLeader(snapshots, (snapshot) => snapshot.exchangeCountPrev7d) === thisWeek
    ? thisWeek
    : null;
}

export type FriendshipLevel = 'topBestFriend' | 'bestFriend';

export type FriendshipBadge = {
  level: FriendshipLevel | null;
  /** Visible streak (0 when below STREAK_MIN_VISIBLE_DAYS or broken). */
  streakDays: number;
  atRisk: boolean;
};

export type FriendshipOverview = {
  /** Only friends with something to show. */
  badges: ReadonlyMap<string, FriendshipBadge>;
  bestFriendIds: readonly string[];
};

export const EMPTY_FRIENDSHIP_OVERVIEW: FriendshipOverview = {
  badges: new Map(),
  bestFriendIds: [],
};

export function buildFriendshipOverview(
  snapshots: readonly FriendStreakSnapshot[],
  now: number,
): FriendshipOverview {
  if (snapshots.length === 0) return EMPTY_FRIENDSHIP_OVERVIEW;
  const bestFriendIds = rankBestFriends(snapshots);
  const best = new Set(bestFriendIds);
  const top = resolveTopBestFriend(snapshots);
  const badges = new Map<string, FriendshipBadge>();
  for (const snapshot of snapshots) {
    const streak = resolveStreakState(snapshot, now);
    const streakDays = streak.days >= STREAK_MIN_VISIBLE_DAYS ? streak.days : 0;
    const level: FriendshipLevel | null =
      snapshot.peerId === top ? 'topBestFriend' : best.has(snapshot.peerId) ? 'bestFriend' : null;
    if (!level && streakDays === 0) continue;
    badges.set(snapshot.peerId, {
      level,
      streakDays,
      atRisk: streakDays > 0 && streak.atRisk,
    });
  }
  return { badges, bestFriendIds };
}

/** „💛 🔥 12 ⌛” — the hourglass sits next to the number while the streak is at risk. */
export function formatFriendshipBadge(badge: FriendshipBadge | null | undefined): string {
  if (!badge) return '';
  const parts: string[] = [];
  if (badge.level) parts.push(FRIENDSHIP_EMOJI[badge.level]);
  if (badge.streakDays > 0) {
    parts.push(`${FRIENDSHIP_EMOJI.streak} ${badge.streakDays}`);
    if (badge.atRisk) parts.push(FRIENDSHIP_EMOJI.atRisk);
  }
  return parts.join(' ');
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** VoiceOver text instead of emoji names: „Najlepszy przyjaciel, seria 12 dni, seria się kończy”. */
export function friendshipBadgeAccessibilityLabel(
  badge: FriendshipBadge | null | undefined,
  t: Translate,
): string {
  if (!badge) return '';
  const parts: string[] = [];
  if (badge.level === 'topBestFriend') parts.push(t('friendship.topBestFriendA11y'));
  if (badge.level === 'bestFriend') parts.push(t('friendship.bestFriendA11y'));
  if (badge.streakDays > 0) {
    parts.push(t('friendship.streakA11y', { count: badge.streakDays }));
    if (badge.atRisk) parts.push(t('friendship.atRiskA11y'));
  }
  return parts.join(', ');
}

/**
 * Next moment a badge can change without new data (a streak enters the at-risk window, or a day
 * ends), so the UI can re-evaluate exactly then instead of polling. `null` when nothing is pending.
 */
export function nextFriendshipBadgeChangeAt(
  snapshots: readonly FriendStreakSnapshot[],
  now: number,
): number | null {
  let next: number | null = null;
  const consider = (time: number) => {
    if (time > now && (next === null || time < next)) next = time;
  };
  for (const snapshot of snapshots) {
    const state = resolveStreakState(snapshot, now);
    if (state.days === 0) continue;
    consider(state.dayEndsAt - STREAK_AT_RISK_WINDOW_MS);
    consider(state.dayEndsAt);
  }
  return next;
}
