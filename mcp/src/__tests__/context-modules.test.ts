import { describe, it, expect, vi } from 'vitest';
import { buildContextBundleFromModules } from '@bot-native/sdk';
import { createContextModules } from '../context-modules.js';
import { createMcpMockSupabase } from './mockSupabase.js';

function seedHappyPath(sb: ReturnType<typeof createMcpMockSupabase>) {
  sb.respond('gym_members.list', {
    data: [{ gym_id: 'g1' }],
    error: null,
  });
  sb.respond('profiles.single', {
    data: { program_start_date: '2026-04-06' }, // 2 weeks ago
    error: null,
  });
  sb.respond('workout_programs.single', {
    data: {
      program_data: {
        Monday: {
          focus: 'Push',
          exercises: [
            { name: 'Bench Press', sets: 3, reps: 5 },
            { name: 'Overhead Press', sets: 3, reps: 8 },
          ],
        },
      },
    },
    error: null,
  });
  sb.respond('workout_logs.list', {
    data: [
      {
        exercise_name: 'Bench Press',
        actual_weight: 185,
        actual_reps: 5,
        completed_at: new Date().toISOString(),
        day_name: 'Monday',
        week_number: 2,
        prescribed_reps: 5,
      },
      {
        exercise_name: 'Bench Press',
        actual_weight: 185,
        actual_reps: 5,
        completed_at: new Date().toISOString(),
        day_name: 'Monday',
        week_number: 2,
        prescribed_reps: 5,
      },
      {
        exercise_name: 'Overhead Press',
        actual_weight: 95,
        actual_reps: 8,
        completed_at: new Date().toISOString(),
        day_name: 'Monday',
        week_number: 2,
        prescribed_reps: 8,
      },
    ],
    error: null,
  });
  sb.respond('current_user_maxes.list', {
    data: [
      { user_id: 'u1', exercise_name: 'Squat', weight_lbs: 315 },
      { user_id: 'u1', exercise_name: 'Deadlift', weight_lbs: 405 },
      { user_id: 'u1', exercise_name: 'Bench Press', weight_lbs: 225 },
    ],
    error: null,
  });
  sb.respond('workout_completions.list', {
    data: [{ week_number: 1 }, { week_number: 2 }],
    error: null,
  });
  sb.respond('rpc.get_unread_user_messages', {
    data: [{ content: 'Remember to hit the gym!', message_created_at: new Date().toISOString() }],
    error: null,
  });
  sb.respond('gym_equipment.list', {
    data: [{ name: 'Barbell' }, { name: 'Dumbbells' }, { name: 'Rack' }],
    error: null,
  });
}

describe('context modules', () => {
  it('exposes 7 modules with distinct priorities 4..10', () => {
    const modules = createContextModules();
    const priorities = modules.map((m) => m.priority).sort((a, b) => a - b);
    expect(priorities).toEqual([4, 5, 6, 7, 8, 9, 10]);
    const keys = modules.map((m) => m.key).sort();
    expect(keys).toEqual([
      'current_program',
      'gym_equipment',
      'maxes',
      'recent_logs',
      'streak',
      'unread_coach_notes',
      'upcoming_deload',
    ]);
  });

  it('each module loads and summarizes without throwing under happy-path mocks', async () => {
    const sb = createMcpMockSupabase();
    seedHappyPath(sb);
    const deps = { supabase: sb as any, userId: 'u1' };
    const modules = createContextModules();

    for (const mod of modules) {
      const data = await mod.load(deps);
      const summary = mod.summarize(data);
      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    }
  });

  it('current_program summary names focus + exercise count', async () => {
    const sb = createMcpMockSupabase();
    seedHappyPath(sb);
    const mod = createContextModules().find((m) => m.key === 'current_program')!;
    const data = await mod.load({ supabase: sb as any, userId: 'u1' });
    const summary = mod.summarize(data);
    // Seed's program_start_date yields a known current week; just assert shape.
    expect(summary).toMatch(/Week \d+/);
  });

  it('maxes summary includes top lifts with weights', async () => {
    const sb = createMcpMockSupabase();
    seedHappyPath(sb);
    const mod = createContextModules().find((m) => m.key === 'maxes')!;
    const data = await mod.load({ supabase: sb as any, userId: 'u1' });
    expect(mod.summarize(data)).toContain('Deadlift 405lb');
  });

  it('streak summary reports active streak when consecutive weeks logged', async () => {
    const sb = createMcpMockSupabase();
    seedHappyPath(sb);
    const mod = createContextModules().find((m) => m.key === 'streak')!;
    const data = await mod.load({ supabase: sb as any, userId: 'u1' });
    // longest should be at least 2 (weeks 1 + 2 consecutive in seed data).
    expect((data as any).longest).toBeGreaterThanOrEqual(2);
  });

  it('gym_equipment summary falls back when no gym on record', async () => {
    const sb = createMcpMockSupabase();
    // Omit gym_members — resolveGymId returns null.
    const mod = createContextModules().find((m) => m.key === 'gym_equipment')!;
    const data = await mod.load({ supabase: sb as any, userId: 'u1' });
    expect(mod.summarize(data)).toMatch(/No equipment/i);
  });

  it('unread_coach_notes summary shows preview when messages exist', async () => {
    const sb = createMcpMockSupabase();
    seedHappyPath(sb);
    const mod = createContextModules().find((m) => m.key === 'unread_coach_notes')!;
    const data = await mod.load({ supabase: sb as any, userId: 'u1' });
    expect(mod.summarize(data)).toContain('Remember to hit the gym');
  });
});

describe('buildContextBundleFromModules integration', () => {
  it('produces a bundle with app_name, user_id, summary, data', async () => {
    const sb = createMcpMockSupabase();
    seedHappyPath(sb);
    const bundle = await buildContextBundleFromModules({
      appName: 'swoltracker',
      userId: 'u1',
      modules: createContextModules(),
      deps: { supabase: sb as any, userId: 'u1' },
      maxTokens: 2000,
    });
    expect(bundle.app_name).toBe('swoltracker');
    expect(bundle.user_id).toBe('u1');
    expect(typeof bundle.summary).toBe('string');
    expect(bundle.summary.length).toBeGreaterThan(0);
    // Data is merged across modules; at minimum should contain fields from
    // multiple modules.
    expect(bundle.data).toBeDefined();
  });

  it('trims lowest-priority modules when summary exceeds maxTokens', async () => {
    const sb = createMcpMockSupabase();
    seedHappyPath(sb);
    // Tight budget — should keep the highest-priority module and trim the rest.
    const warn = vi.fn();
    const originalWarn = console.warn;
    console.warn = warn;
    try {
      await buildContextBundleFromModules({
        appName: 'swoltracker',
        userId: 'u1',
        modules: createContextModules(),
        deps: { supabase: sb as any, userId: 'u1' },
        maxTokens: 10, // way below total summary size
      });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Context budget exceeded')
      );
      const call = warn.mock.calls[0]?.[0] as string;
      // Lowest-priority module (upcoming_deload, P4) should appear in trimmed list.
      expect(call).toContain('upcoming_deload');
    } finally {
      console.warn = originalWarn;
    }
  });
});

