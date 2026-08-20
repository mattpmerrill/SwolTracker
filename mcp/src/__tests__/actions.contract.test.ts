import { describe, it, expect, vi } from 'vitest';
import { isAppError } from '@bot-native/sdk';
import { createActionTools } from '../tools/actions.js';
import { createMcpMockSupabase } from './mockSupabase.js';
import type { EventEmitter } from '../bot-native-shim.js';

const stubEvents: EventEmitter = {
  emit: vi.fn(async () => undefined),
} as any;

const stubQueries = {
  resolveGymId: vi.fn(async (_gymId?: string) => 'g1'),
  resolveWritableGymId: vi.fn(async (_gymId?: string) => 'g1'),
  // only methods actually invoked by update_max/log_set are referenced
} as any;

describe('MCP actions contract', () => {
  it('update_max inserts a new max row and returns ToolResult', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('current_user_maxes.single', { data: null, error: null });
    sb.respond('user_maxes.single', {
      data: { id: 'm1', user_id: 'u1', exercise_name: 'Deadlift', weight_lbs: 405 },
      error: null,
    });
    const tools = createActionTools(sb, 'u1', stubEvents, stubQueries);
    const result = await tools.update_max('Deadlift', 405);
    expect(result.success).toBe(true);
    expect(result.message).toContain('405');
    expect((result.data as any).record.weight_lbs).toBe(405);
  });

  it('update_max surfaces an error ToolResult when insert fails', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('user_maxes.single', {
      data: null,
      error: { message: 'constraint violation' },
    });
    const tools = createActionTools(sb, 'u1', stubEvents, stubQueries);
    const result = await tools.update_max('Deadlift', 405);
    expect(result.success).toBe(false);
    expect(result.message).toContain('constraint violation');
  });

  it('shift_program updates profile.program_start_date by N weeks and reports new week', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('profiles.single', {
      data: { program_start_date: '2026-01-05' },
      error: null,
    });
    sb.respond('profiles.list', { data: null, error: null });
    const tools = createActionTools(sb, 'u1', stubEvents, stubQueries);
    const result = await tools.shift_program(2);
    expect(result.success).toBe(true);
    expect((result.data as any).previous_start_date).toBe('2026-01-05');
    expect((result.data as any).new_start_date).toBe('2026-01-19');
    expect((result.data as any).weeks_forward).toBe(2);
    expect(result.message).toContain('forward 2 weeks');
  });

  it('shift_program with 0 weeks is a no-op', async () => {
    const sb = createMcpMockSupabase();
    const tools = createActionTools(sb, 'u1', stubEvents, stubQueries);
    const result = await tools.shift_program(0);
    expect(result.success).toBe(true);
    expect((result.data as any).weeks_forward).toBe(0);
    // Should not touch the DB at all
    const touchedProfiles = sb.calls.some(([table]) => table === 'profiles');
    expect(touchedProfiles).toBe(false);
  });

  it('shift_program rejects non-integer or out-of-range input', async () => {
    const sb = createMcpMockSupabase();
    const tools = createActionTools(sb, 'u1', stubEvents, stubQueries);
    await expect(tools.shift_program(1.5)).rejects.toThrow(/integer/);
    await expect(tools.shift_program(53)).rejects.toThrow(/between -52 and 52/);
    await expect(tools.shift_program(-53)).rejects.toThrow(/between -52 and 52/);
  });

  it('substitute_equipment_globally replaces exercise across all weeks and emits program.saved', async () => {
    const sb = createMcpMockSupabase();
    const events = { emit: vi.fn(async () => undefined) } as any;
    sb.respond('workout_programs.list', {
      data: [
        {
          id: 'p1',
          week_number: 1,
          program_data: {
            Monday: {
              focus: 'Push',
              exercises: [
                { name: 'Barbell Bench Press', sets: 3, reps: 5 },
                { name: 'Overhead Press', sets: 3, reps: 8 },
              ],
            },
            Wednesday: {
              focus: 'Pull',
              exercises: [{ name: 'Barbell Row', sets: 3, reps: 5 }],
            },
          },
        },
        {
          id: 'p2',
          week_number: 2,
          program_data: {
            Monday: {
              focus: 'Push',
              exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: 3 }],
            },
          },
        },
        {
          id: 'p3',
          week_number: 3,
          program_data: {
            Monday: {
              focus: 'Pull',
              exercises: [{ name: 'Deadlift', sets: 3, reps: 5 }],
            },
          },
        },
      ],
      error: null,
    });
    const tools = createActionTools(sb, 'u1', events, stubQueries);
    const result = await tools.substitute_equipment_globally(
      'bench press',
      'Dumbbell Bench Press',
      'gym closed'
    );
    expect(result.success).toBe(true);
    expect((result.data as any).from).toBe('Barbell Bench Press');
    expect((result.data as any).to).toBe('Dumbbell Bench Press');
    expect((result.data as any).exercises_changed).toBe(2);
    expect((result.data as any).weeks_updated).toEqual([1, 2]);
    // program.saved emitted per updated week
    expect((events.emit as any).mock.calls.filter((c: any[]) => c[0] === 'program.saved')).toHaveLength(2);
  });

  it('substitute_equipment_globally returns 0 changes when exercise not found', async () => {
    const sb = createMcpMockSupabase();
    const events = { emit: vi.fn(async () => undefined) } as any;
    sb.respond('workout_programs.list', {
      data: [
        {
          id: 'p1',
          week_number: 1,
          program_data: {
            Monday: { focus: 'Pull', exercises: [{ name: 'Deadlift', sets: 3, reps: 5 }] },
          },
        },
      ],
      error: null,
    });
    const tools = createActionTools(sb, 'u1', events, stubQueries);
    const result = await tools.substitute_equipment_globally('Bench Press', 'Dumbbell Bench Press');
    expect(result.success).toBe(true);
    expect((result.data as any).exercises_changed).toBe(0);
    expect((result.data as any).weeks_updated).toEqual([]);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('substitute_equipment_globally rejects identity substitutions', async () => {
    const sb = createMcpMockSupabase();
    const tools = createActionTools(sb, 'u1', stubEvents, stubQueries);
    await expect(
      tools.substitute_equipment_globally('bench press', 'Barbell Bench Press')
    ).rejects.toThrow(/same canonical exercise/);
  });

  it('shift_program backward moves the anchor earlier', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('profiles.single', {
      data: { program_start_date: '2026-04-20' },
      error: null,
    });
    sb.respond('profiles.list', { data: null, error: null });
    const tools = createActionTools(sb, 'u1', stubEvents, stubQueries);
    const result = await tools.shift_program(-1);
    expect(result.success).toBe(true);
    expect((result.data as any).new_start_date).toBe('2026-04-13');
    expect(result.message).toContain('back 1 week');
  });

  it('save_workout_program forbids a gym member from overwriting the shared program', async () => {
    const sb = createMcpMockSupabase();
    const memberQueries = {
      resolveGymId: vi.fn(async () => 'g-shared'),
      resolveWritableGymId: vi.fn(async () => null),
    } as any;
    const tools = createActionTools(sb, 'u-member', stubEvents, memberQueries);
    const validWeek = {
      Monday: { focus: 'Rest', exercises: [] },
      Tuesday: { focus: 'Rest', exercises: [] },
      Wednesday: { focus: 'Rest', exercises: [] },
      Thursday: { focus: 'Rest', exercises: [] },
      Friday: { focus: 'Rest', exercises: [] },
      Saturday: { focus: 'Rest', exercises: [] },
      Sunday: { focus: 'Rest', exercises: [] },
    };
    await expect(tools.save_workout_program('g-shared', 1, validWeek)).rejects.toSatisfy((e: unknown) => {
      if (!isAppError(e)) return false;
      return e.code === 'forbidden';
    });
    expect(memberQueries.resolveWritableGymId).toHaveBeenCalledWith('g-shared');
  });
});
