import { describe, expect, it } from 'vitest';
import {
  STREAK_AT_RISK_WINDOW_MS,
  buildFriendshipOverview,
  formatFriendshipBadge,
  friendshipBadgeAccessibilityLabel,
  nextFriendshipBadgeChangeAt,
  parseFriendStreakRows,
  rankBestFriends,
  resolveStreakState,
  resolveTopBestFriend,
  type FriendStreakSnapshot,
} from './friendStreaks';

const HOUR = 60 * 60_000;
// 2026-10-13 00:00 Europe/Warsaw (CEST, UTC+2).
const DAY_END = Date.parse('2026-10-12T22:00:00Z');
const NOON = DAY_END - 12 * HOUR;
const EVENING = DAY_END - 2.5 * HOUR;

function snapshot(overrides: Partial<FriendStreakSnapshot> & { peerId: string }): FriendStreakSnapshot {
  return {
    streakDays: 0,
    lastExchangeDay: null,
    todayComplete: false,
    meSentToday: false,
    peerSentToday: false,
    dayEndsAt: DAY_END,
    exchangeCount30d: 0,
    exchangeCount7d: 0,
    exchangeCountPrev7d: 0,
    ...overrides,
  };
}

describe('parseFriendStreakRows', () => {
  it('maps RPC rows and drops malformed ones', () => {
    const rows = parseFriendStreakRows([
      {
        peer_id: 'a',
        streak_days: 5,
        at_risk: false,
        last_exchange_day: '2026-10-11',
        today_complete: false,
        me_sent_today: true,
        peer_sent_today: false,
        day_ends_at: '2026-10-12T22:00:00+00:00',
        exchange_count_30d: 12,
        exchange_count_7d: '4',
        exchange_count_prev_7d: null,
      },
      { peer_id: '', day_ends_at: '2026-10-12T22:00:00Z' },
      { peer_id: 'b', day_ends_at: 'not a date' },
      null,
    ]);
    expect(rows).toEqual([
      {
        peerId: 'a',
        streakDays: 5,
        lastExchangeDay: '2026-10-11',
        todayComplete: false,
        meSentToday: true,
        peerSentToday: false,
        dayEndsAt: DAY_END,
        exchangeCount30d: 12,
        exchangeCount7d: 4,
        exchangeCountPrev7d: 0,
      },
    ]);
  });

  it('reads anything that is not an array as no data', () => {
    expect(parseFriendStreakRows(null)).toEqual([]);
    expect(parseFriendStreakRows({})).toEqual([]);
  });
});

describe('resolveStreakState', () => {
  it('is not at risk during the day', () => {
    expect(resolveStreakState(snapshot({ peerId: 'a', streakDays: 4 }), NOON)).toEqual({
      days: 4,
      atRisk: false,
      dayEndsAt: DAY_END,
    });
  });

  it('is at risk in the last 4 hours while today is incomplete', () => {
    expect(resolveStreakState(snapshot({ peerId: 'a', streakDays: 4 }), EVENING).atRisk).toBe(true);
    expect(
      resolveStreakState(snapshot({ peerId: 'a', streakDays: 4 }), DAY_END - STREAK_AT_RISK_WINDOW_MS)
        .atRisk,
    ).toBe(true);
  });

  it('is never at risk once both sent today', () => {
    expect(
      resolveStreakState(snapshot({ peerId: 'a', streakDays: 5, todayComplete: true }), EVENING).atRisk,
    ).toBe(false);
  });

  it('drops the streak when the day ended incomplete', () => {
    expect(resolveStreakState(snapshot({ peerId: 'a', streakDays: 4 }), DAY_END + HOUR).days).toBe(0);
  });

  it('carries a complete day into the next one, at risk again that evening', () => {
    const complete = snapshot({ peerId: 'a', streakDays: 5, todayComplete: true });
    expect(resolveStreakState(complete, DAY_END + HOUR)).toEqual({
      days: 5,
      atRisk: false,
      dayEndsAt: DAY_END + 24 * HOUR,
    });
    expect(resolveStreakState(complete, DAY_END + 21 * HOUR).atRisk).toBe(true);
  });

  it('drops even a complete streak when a whole day was skipped', () => {
    const complete = snapshot({ peerId: 'a', streakDays: 5, todayComplete: true });
    expect(resolveStreakState(complete, DAY_END + 25 * HOUR).days).toBe(0);
  });
});

describe('best friends', () => {
  const friends = [
    snapshot({ peerId: 'a', exchangeCount30d: 40, exchangeCount7d: 10, exchangeCountPrev7d: 9 }),
    snapshot({ peerId: 'b', exchangeCount30d: 25, exchangeCount7d: 4, exchangeCountPrev7d: 3 }),
    snapshot({ peerId: 'c', exchangeCount30d: 25, lastExchangeDay: '2026-10-12' }),
    snapshot({ peerId: 'd', exchangeCount30d: 2 }),
    snapshot({ peerId: 'e', exchangeCount30d: 9 }),
    snapshot({ peerId: 'f', exchangeCount30d: 8 }),
    snapshot({ peerId: 'g', exchangeCount30d: 7 }),
  ];

  it('ranks the top five by 30-day exchanges above the minimum', () => {
    expect(rankBestFriends(friends)).toEqual(['a', 'c', 'b', 'e', 'f']);
    expect(rankBestFriends(friends, 0)).toEqual([]);
  });

  it('crowns 💛 only for a clear leader of both weeks', () => {
    expect(resolveTopBestFriend(friends)).toBe('a');
    const tiedThisWeek = [
      ...friends,
      snapshot({ peerId: 'h', exchangeCount30d: 10, exchangeCount7d: 10 }),
    ];
    expect(resolveTopBestFriend(tiedThisWeek)).toBeNull();
    const otherLeaderLastWeek = [
      ...friends,
      snapshot({ peerId: 'h', exchangeCount30d: 12, exchangeCountPrev7d: 11 }),
    ];
    expect(resolveTopBestFriend(otherLeaderLastWeek)).toBeNull();
    expect(
      resolveTopBestFriend([snapshot({ peerId: 'x', exchangeCount7d: 1, exchangeCountPrev7d: 1 })]),
    ).toBeNull();
  });
});

describe('buildFriendshipOverview', () => {
  it('selects level and visible streak per friend', () => {
    const overview = buildFriendshipOverview(
      [
        snapshot({ peerId: 'top', streakDays: 12, exchangeCount30d: 50, exchangeCount7d: 9, exchangeCountPrev7d: 8 }),
        snapshot({ peerId: 'best', streakDays: 2, exchangeCount30d: 10 }),
        snapshot({ peerId: 'streak', streakDays: 3, exchangeCount30d: 1 }),
        snapshot({ peerId: 'nothing', streakDays: 2, exchangeCount30d: 1 }),
      ],
      EVENING,
    );
    expect(overview.bestFriendIds).toEqual(['top', 'best']);
    expect(Object.fromEntries(overview.badges)).toEqual({
      top: { level: 'topBestFriend', streakDays: 12, atRisk: true },
      best: { level: 'bestFriend', streakDays: 0, atRisk: false },
      streak: { level: null, streakDays: 3, atRisk: true },
    });
  });

  it('returns the shared empty overview without data', () => {
    expect(buildFriendshipOverview([], NOON).badges.size).toBe(0);
  });
});

describe('badge text', () => {
  it('formats emoji with the hourglass next to the number', () => {
    expect(formatFriendshipBadge({ level: 'topBestFriend', streakDays: 12, atRisk: true })).toBe(
      '💛 🔥 12 ⌛',
    );
    expect(formatFriendshipBadge({ level: 'bestFriend', streakDays: 0, atRisk: false })).toBe('😊');
    expect(formatFriendshipBadge({ level: null, streakDays: 4, atRisk: false })).toBe('🔥 4');
    expect(formatFriendshipBadge(null)).toBe('');
  });

  it('builds a spoken label instead of emoji names', () => {
    const t = (key: string, options?: Record<string, unknown>) =>
      options?.count !== undefined ? `${key}:${String(options.count)}` : key;
    expect(
      friendshipBadgeAccessibilityLabel({ level: 'bestFriend', streakDays: 7, atRisk: true }, t),
    ).toBe('friendship.bestFriendA11y, friendship.streakA11y:7, friendship.atRiskA11y');
    expect(friendshipBadgeAccessibilityLabel(undefined, t)).toBe('');
  });
});

describe('nextFriendshipBadgeChangeAt', () => {
  it('wakes up when a streak enters the risk window, then at the end of the day', () => {
    const snapshots = [snapshot({ peerId: 'a', streakDays: 4 })];
    expect(nextFriendshipBadgeChangeAt(snapshots, NOON)).toBe(DAY_END - STREAK_AT_RISK_WINDOW_MS);
    expect(nextFriendshipBadgeChangeAt(snapshots, EVENING)).toBe(DAY_END);
  });

  it('has nothing to wait for without a running streak', () => {
    expect(nextFriendshipBadgeChangeAt([snapshot({ peerId: 'a' })], NOON)).toBeNull();
  });
});
