import { describe, it, expect } from 'vitest';
import { createCheckinsRepo } from './checkins';
import { createMockSupabase } from '../../test/mockSupabase';

const checkinRow = {
  id: 'c1',
  review_week: 3,
  target_week: 4,
  status: 'pending',
  recap: { headline: 'Solid week', wins: ['Bench PR'], watch: [], tone: 'normal' },
  changes: [{ id: 'c1', day: 'Friday', summary: 'Drop a set', reason: 'Fatigue', before: null, after: { exercises: [] } }],
  result: null,
  expires_at: '2026-11-03T04:59:59Z',
  decided_at: null,
  created_at: '2026-11-02T00:00:00Z',
};

describe('checkinsRepo', () => {
  it('getRecentCheckins reads the user\'s rows newest first and parses them', async () => {
    const sb = createMockSupabase();
    sb.respond('chad_checkins', 'list', { data: [checkinRow], error: null });
    const rows = await createCheckinsRepo(sb).getRecentCheckins('u1', 3);
    expect(rows).toHaveLength(1);
    expect(rows[0].recap.headline).toBe('Solid week');
    expect(sb.calls).toContainEqual(['chad_checkins', 'eq', ['user_id', 'u1']]);
    expect(sb.calls).toContainEqual(['chad_checkins', 'order', ['created_at', { ascending: false }]]);
    expect(sb.calls).toContainEqual(['chad_checkins', 'limit', [3]]);
  });

  it('fills defaults for a sparse row and drops a malformed one', async () => {
    const sb = createMockSupabase();
    sb.respond('chad_checkins', 'list', {
      data: [
        { id: 'c2', review_week: 1, target_week: 2, status: 'declined' },
        { id: 'bad', review_week: 1, target_week: 2, status: 'not-a-status' },
      ],
      error: null,
    });
    const rows = await createCheckinsRepo(sb).getRecentCheckins('u1');
    expect(rows).toHaveLength(1);
    expect(rows[0].changes).toEqual([]);
    expect(rows[0].recap.tone).toBe('normal');
    expect(rows[0].result).toBeNull();
  });

  it('returns null, not an empty list, when the read fails', async () => {
    const sb = createMockSupabase();
    sb.respond('chad_checkins', 'list', { data: null, error: { message: 'boom' } });
    expect(await createCheckinsRepo(sb).getRecentCheckins('u1')).toBeNull();
    expect(await createCheckinsRepo(null).getRecentCheckins('u1')).toBeNull();
    expect(await createCheckinsRepo(sb).getRecentCheckins(null)).toBeNull();
  });

  it('getRecentMissedOffers parses offers and returns null on error', async () => {
    const sb = createMockSupabase();
    sb.respond('chad_missed_offers', 'list', {
      data: [{ id: 'o1', week: 3, from_day: 'Tuesday', to_day: 'Saturday', status: 'pending', expires_at: null, created_at: null }],
      error: null,
    });
    const repo = createCheckinsRepo(sb);
    expect(await repo.getRecentMissedOffers('u1')).toEqual([
      { id: 'o1', week: 3, from_day: 'Tuesday', to_day: 'Saturday', status: 'pending', expires_at: null, created_at: null },
    ]);
    sb.respond('chad_missed_offers', 'list', { data: null, error: { message: 'boom' } });
    expect(await repo.getRecentMissedOffers('u1')).toBeNull();
  });

  it('getWeeklyCheckinSetting is false with no row, the value with one, null on error', async () => {
    const sb = createMockSupabase();
    const repo = createCheckinsRepo(sb);
    sb.respond('chad_coach_settings', 'maybeSingle', { data: null, error: null });
    expect(await repo.getWeeklyCheckinSetting('u1')).toBe(false);
    sb.respond('chad_coach_settings', 'maybeSingle', { data: { weekly_checkin: true }, error: null });
    expect(await repo.getWeeklyCheckinSetting('u1')).toBe(true);
    sb.respond('chad_coach_settings', 'maybeSingle', { data: null, error: { message: 'boom' } });
    expect(await repo.getWeeklyCheckinSetting('u1')).toBeNull();
  });
});
