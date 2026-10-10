import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContextTools } from '../tools/context.js';
import { createQueryTools } from '../tools/queries.js';
import { createContextModules } from '../context-modules.js';
import { createMcpMockSupabase } from './mockSupabase.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('user clock regressions', () => {
  it('get_streak counts back from the real current week, not week 1', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T18:00:00Z'));
    const sb = createMcpMockSupabase();
    sb.respond('gym_members.list', {
      data: [{ gym_id: 'g1', role: 'owner', gyms: { id: 'g1', name: 'Home' } }],
      error: null,
    });
    sb.respond('profiles.single', {
      data: { program_start_date: '2026-06-01', timezone: null },
      error: null,
    });
    sb.respond('workout_completions.list', {
      data: [{ week_number: 17 }, { week_number: 18 }, { week_number: 19 }],
      error: null,
    });

    const queries = createQueryTools(sb, 'u1');
    const tools = createContextTools(sb, 'u1', queries);
    const result = await tools.get_streak();

    expect((result.data as { current_streak_weeks: number }).current_streak_weeks).toBe(3);
    expect((result.data as { longest_streak_weeks: number }).longest_streak_weeks).toBe(3);
  });

  it('context streak module uses the same user-zone week', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T18:00:00Z'));
    const sb = createMcpMockSupabase();
    sb.respond('gym_members.list', { data: [{ gym_id: 'g1' }], error: null });
    sb.respond('profiles.single', {
      data: { program_start_date: '2026-06-01', timezone: null },
      error: null,
    });
    sb.respond('workout_completions.list', {
      data: [{ week_number: 17 }, { week_number: 18 }, { week_number: 19 }],
      error: null,
    });

    const mod = createContextModules().find((m) => m.key === 'streak')!;
    const data = await mod.load({ supabase: sb as any, userId: 'u1' });
    expect((data as { current: number }).current).toBe(3);
  });

  it('an invalid profile timezone falls back to America/Denver', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T04:30:00Z'));
    const sb = createMcpMockSupabase();
    sb.respond('gym_members.list', {
      data: [{ gym_id: 'g1', role: 'owner', gyms: { id: 'g1', name: 'Home' } }],
      error: null,
    });
    sb.respond('profiles.single', {
      data: { program_start_date: '2026-06-01', timezone: 'Not/AZone' },
      error: null,
    });
    const queries = createQueryTools(sb, 'u1');
    const result = await queries.get_todays_workout();
    expect((result.data as { current_week: number }).current_week).toBe(18);
    expect((result.data as { day_name: string }).day_name).toBe('Sunday');
  });
});
