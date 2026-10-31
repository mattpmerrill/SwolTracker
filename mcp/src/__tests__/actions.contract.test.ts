import { describe, it, expect, vi, afterEach } from 'vitest';
import { isAppError } from '@bot-native/sdk';
import { ProgramDaySchema, createActionTools } from '../tools/actions.js';
import { createMcpMockSupabase } from './mockSupabase.js';
import type { EventEmitter } from '../bot-native-shim.js';

const stubEvents: EventEmitter = {
  emit: vi.fn(async () => undefined),
} as any;

const stubQueries = {
  resolveGymId: vi.fn(async (_gymId?: string) => 'g1'),
  resolveWritableGymId: vi.fn(async (_gymId?: string) => 'g1'),
  resolveLeaderProgramGym: vi.fn(async () => null),
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

describe('update_program_day', () => {
  const day = (focus: string, name = 'Squat') => ({
    focus,
    exercises: [{ name, sets: 3, reps: '5', percentages: [70, 70, 70] }],
  });
  const storedWeek = () => ({
    Monday: day('Legs'),
    Tuesday: { focus: 'Rest', exercises: [] },
    Wednesday: day('Push', 'Bench Press'),
    Thursday: { focus: 'Rest', exercises: [] },
    Friday: day('Pull', 'Deadlift'),
    Saturday: { focus: 'Rest', exercises: [] },
    Sunday: { focus: 'Rest', exercises: [] },
  });

  // Fixed clock: program_start_date 2026-06-01 puts 2026-10-09 in week 19.
  const CURRENT_WEEK = 19;
  function setup() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T18:00:00Z'));
    const sb = createMcpMockSupabase();
    sb.respond('profiles.single', {
      data: { program_start_date: '2026-06-01', timezone: null },
      error: null,
    });
    const events = { emit: vi.fn(async () => undefined) } as any;
    return { sb, tools: createActionTools(sb, 'u1', events, stubQueries) };
  }
  const upsertPayload = (sb: ReturnType<typeof createMcpMockSupabase>) =>
    sb.calls.find(([table, method]) => table === 'workout_programs' && method === 'upsert')?.[2][0];

  afterEach(() => {
    vi.useRealTimers();
  });

  it('replaces one day and leaves the other days untouched', async () => {
    const { sb, tools } = setup();
    sb.respond('workout_programs.maybeSingle', { data: { program_data: storedWeek() }, error: null });
    sb.respond('workout_programs.single', { data: { id: 'p1' }, error: null });

    const next = day('Pull', 'Dumbbell Row');
    const result = await tools.update_program_day(CURRENT_WEEK, 'Wednesday', next);

    expect(result.success).toBe(true);
    const payload = upsertPayload(sb);
    expect(payload.gym_id).toBe('g1');
    expect(payload.week_number).toBe(CURRENT_WEEK);
    // The read is scoped to the verified gym and week, not just filtered by id.
    expect(sb.calls).toContainEqual(['workout_programs', 'eq', ['gym_id', 'g1']]);
    expect(sb.calls).toContainEqual(['workout_programs', 'eq', ['week_number', CURRENT_WEEK]]);
    expect(payload.ai_notes).toBe('Edited by Chad');
    expect(payload.program_data.Wednesday).toEqual(next);
    const { Wednesday: _edited, ...rest } = payload.program_data;
    const { Wednesday: _old, ...expectedRest } = storedWeek();
    expect(rest).toEqual(expectedRest);
  });

  it('rejects a week before the current week and writes nothing', async () => {
    const { sb, tools } = setup();
    sb.respond('workout_programs.maybeSingle', { data: { program_data: storedWeek() }, error: null });

    await expect(tools.update_program_day(CURRENT_WEEK - 1, 'Monday', day('Legs'))).rejects.toSatisfy(
      (e: unknown) => isAppError(e) && e.code === 'invalid_args' && /past|locked/.test(e.message),
    );
    expect(upsertPayload(sb)).toBeUndefined();
  });

  it("forbids a group member from editing the leader's program", async () => {
    // A member's personal gym is writable, so only the leader lookup can stop this edit.
    const memberQueries = {
      resolveGymId: vi.fn(async () => 'g-personal'),
      resolveWritableGymId: vi.fn(async () => 'g-personal'),
      resolveLeaderProgramGym: vi.fn(async () => ({ id: 'g-leader', name: 'Coach' })),
    } as any;

    for (const gymId of [undefined, 'g-leader']) {
      const sb = createMcpMockSupabase();
      const tools = createActionTools(sb, 'u-member', stubEvents, memberQueries);
      await expect(tools.update_program_day(1, 'Monday', day('Legs'), gymId)).rejects.toSatisfy(
        (e: unknown) => isAppError(e) && e.code === 'forbidden' && e.message.includes('Coach'),
      );
      expect(upsertPayload(sb)).toBeUndefined();
    }
  });

  it('returns not found when the week has no program', async () => {
    const { sb, tools } = setup();
    sb.respond('workout_programs.maybeSingle', { data: null, error: null });

    await expect(tools.update_program_day(CURRENT_WEEK + 1, 'Monday', day('Legs'))).rejects.toSatisfy(
      (e: unknown) => isAppError(e) && e.code === 'not_found' && /No program for week 20/.test(e.message),
    );
    expect(upsertPayload(sb)).toBeUndefined();
  });

  it('rejects an unknown day name', async () => {
    const { sb, tools } = setup();
    await expect(tools.update_program_day(CURRENT_WEEK, 'Funday', day('Legs'))).rejects.toSatisfy(
      (e: unknown) => isAppError(e) && e.code === 'invalid_args',
    );
    expect(upsertPayload(sb)).toBeUndefined();
  });

  it('rejects an invalid day with the validation message and does not save', async () => {
    const { sb, tools } = setup();
    sb.respond('workout_programs.maybeSingle', { data: { program_data: storedWeek() }, error: null });

    const bad = { focus: 'Legs', exercises: [{ name: 'Squat', sets: 3, reps: 'x'.repeat(17) }] };
    const result = await tools.update_program_day(CURRENT_WEEK, 'Monday', bad);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Program data validation failed');
    expect(result.message).toContain('Monday');
    expect(upsertPayload(sb)).toBeUndefined();
  });
});

describe('apply_program_days', () => {
  const day = (focus: string, name = 'Squat') => ({
    focus,
    exercises: [{ name, sets: 3, reps: '5', percentages: [70, 70, 70] }],
  });
  const rest = () => ({ focus: 'Rest', exercises: [] });
  const storedWeek = () => ({
    Monday: day('Legs'),
    Tuesday: rest(),
    Wednesday: day('Push', 'Bench Press'),
    Thursday: rest(),
    Friday: day('Pull', 'Deadlift'),
    Saturday: rest(),
    Sunday: rest(),
  });

  // Fixed clock: program_start_date 2026-06-01 puts 2026-10-09 in week 19.
  const CURRENT_WEEK = 19;
  function setup() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T18:00:00Z'));
    const sb = createMcpMockSupabase();
    sb.respond('profiles.single', {
      data: { program_start_date: '2026-06-01', timezone: null },
      error: null,
    });
    sb.respond('workout_programs.maybeSingle', { data: { program_data: storedWeek() }, error: null });
    sb.respond('workout_programs.single', { data: { id: 'p1' }, error: null });
    sb.respond('workout_logs.list', { data: [], error: null });
    const events = { emit: vi.fn(async () => undefined) } as any;
    return { sb, tools: createActionTools(sb, 'u1', events, stubQueries) };
  }
  const upserts = (sb: ReturnType<typeof createMcpMockSupabase>) =>
    sb.calls.filter(([table, method]) => table === 'workout_programs' && method === 'upsert');

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes several days in one upsert and leaves the other days untouched', async () => {
    const { sb, tools } = setup();
    const stored = storedWeek();
    const nextMon = day('Legs', 'Front Squat');
    const nextFri = day('Pull', 'Rack Pull');

    const result = await tools.apply_program_days(
      CURRENT_WEEK,
      {
        Monday: { before: stored.Monday, after: nextMon },
        Friday: { before: stored.Friday, after: nextFri },
      },
      'Weekly check-in',
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      applied: ['Monday', 'Friday'],
      skipped: [],
      gym_id: 'g1',
      week_number: CURRENT_WEEK,
    });
    expect(upserts(sb)).toHaveLength(1);
    const payload = upserts(sb)[0][2][0];
    expect(payload.gym_id).toBe('g1');
    expect(payload.week_number).toBe(CURRENT_WEEK);
    expect(payload.ai_notes).toBe('Weekly check-in');
    expect(payload.program_data).toEqual({ ...stored, Monday: nextMon, Friday: nextFri });
  });

  it('treats a day whose keys are in a different order as unchanged', async () => {
    const { sb, tools } = setup();
    const stored = storedWeek();
    const reordered = { exercises: stored.Monday.exercises, focus: stored.Monday.focus };
    const result = await tools.apply_program_days(
      CURRENT_WEEK,
      { Monday: { before: reordered, after: day('Legs', 'Front Squat') } },
      'n',
    );
    expect(result.data).toMatchObject({ applied: ['Monday'], skipped: [] });
    expect(upserts(sb)).toHaveLength(1);
  });

  it('skips a day that changed since the draft and still applies the rest', async () => {
    const { sb, tools } = setup();
    const stored = storedWeek();
    const staleMonday = day('Legs', 'Leg Press');

    const result = await tools.apply_program_days(
      CURRENT_WEEK,
      {
        Monday: { before: staleMonday, after: day('Legs', 'Front Squat') },
        Friday: { before: stored.Friday, after: day('Pull', 'Rack Pull') },
      },
      'n',
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      applied: ['Friday'],
      skipped: [{ day: 'Monday', reason: 'changed_since_draft' }],
    });
    const payload = upserts(sb)[0][2][0];
    expect(payload.program_data.Monday).toEqual(stored.Monday);
    expect(payload.program_data.Friday).toEqual(day('Pull', 'Rack Pull'));
  });

  it('accepts a null before for a day missing from the stored week', async () => {
    const { sb, tools } = setup();
    const { Saturday: _gone, ...withoutSaturday } = storedWeek();
    sb.respond('workout_programs.maybeSingle', { data: { program_data: withoutSaturday }, error: null });

    const result = await tools.apply_program_days(
      CURRENT_WEEK,
      { Saturday: { before: null, after: day('Legs', 'Front Squat') } },
      'n',
    );
    expect(result.data).toMatchObject({ applied: ['Saturday'], skipped: [] });
    expect(upserts(sb)[0][2][0].program_data.Saturday).toEqual(day('Legs', 'Front Squat'));
  });

  it('skips a day the user already started, scoped to the program gym and week', async () => {
    const { sb, tools } = setup();
    const stored = storedWeek();
    sb.respond('workout_logs.list', { data: [{ day_name: 'Wednesday' }], error: null });

    const result = await tools.apply_program_days(
      CURRENT_WEEK,
      {
        Wednesday: { before: stored.Wednesday, after: day('Push', 'Incline Press') },
        Friday: { before: stored.Friday, after: day('Pull', 'Rack Pull') },
      },
      'n',
    );

    expect(result.data).toMatchObject({
      applied: ['Friday'],
      skipped: [{ day: 'Wednesday', reason: 'already_logged' }],
    });
    expect(sb.calls).toContainEqual(['workout_logs', 'eq', ['user_id', 'u1']]);
    expect(sb.calls).toContainEqual(['workout_logs', 'eq', ['gym_id', 'g1']]);
    expect(sb.calls).toContainEqual(['workout_logs', 'eq', ['week_number', CURRENT_WEEK]]);
    expect(sb.calls).toContainEqual(['workout_logs', 'eq', ['completed', true]]);
    expect(upserts(sb)[0][2][0].program_data.Wednesday).toEqual(stored.Wednesday);
  });

  it('does not write when every day is skipped', async () => {
    const { sb, tools } = setup();
    const stored = storedWeek();
    sb.respond('workout_logs.list', { data: [{ day_name: 'Friday' }], error: null });

    const result = await tools.apply_program_days(
      CURRENT_WEEK,
      {
        Monday: { before: day('Legs', 'Leg Press'), after: day('Legs', 'Front Squat') },
        Friday: { before: stored.Friday, after: day('Pull', 'Rack Pull') },
      },
      'n',
    );

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      applied: [],
      skipped: [
        { day: 'Monday', reason: 'changed_since_draft' },
        { day: 'Friday', reason: 'already_logged' },
      ],
    });
    expect(upserts(sb)).toHaveLength(0);
  });

  it('forbids a group member from applying days to the leader program', async () => {
    const memberQueries = {
      resolveGymId: vi.fn(async () => 'g-personal'),
      resolveWritableGymId: vi.fn(async () => 'g-personal'),
      resolveLeaderProgramGym: vi.fn(async () => ({ id: 'g-leader', name: 'Coach' })),
    } as any;
    const sb = createMcpMockSupabase();
    const tools = createActionTools(sb, 'u-member', stubEvents, memberQueries);
    await expect(
      tools.apply_program_days(1, { Monday: { before: null, after: day('Legs') } }, 'n'),
    ).rejects.toSatisfy((e: unknown) => isAppError(e) && e.code === 'forbidden');
    expect(upserts(sb)).toHaveLength(0);
  });

  it('rejects a week before the current week', async () => {
    const { sb, tools } = setup();
    await expect(
      tools.apply_program_days(
        CURRENT_WEEK - 1,
        { Monday: { before: storedWeek().Monday, after: day('Legs', 'Front Squat') } },
        'n',
      ),
    ).rejects.toSatisfy((e: unknown) => isAppError(e) && e.code === 'invalid_args' && /past|locked/.test(e.message));
    expect(upserts(sb)).toHaveLength(0);
  });

  it('rejects an invalid day name before reading or writing', async () => {
    const { sb, tools } = setup();
    await expect(
      tools.apply_program_days(
        CURRENT_WEEK,
        {
          Monday: { before: storedWeek().Monday, after: day('Legs', 'Front Squat') },
          Funday: { before: null, after: day('Legs') },
        },
        'n',
      ),
    ).rejects.toSatisfy((e: unknown) => isAppError(e) && e.code === 'invalid_args');
    expect(upserts(sb)).toHaveLength(0);
  });

  it('rejects an empty set of days', async () => {
    const { tools } = setup();
    await expect(tools.apply_program_days(CURRENT_WEEK, {}, 'n')).rejects.toSatisfy(
      (e: unknown) => isAppError(e) && e.code === 'invalid_args',
    );
  });

  it('returns not found when the week has no program', async () => {
    const { sb, tools } = setup();
    sb.respond('workout_programs.maybeSingle', { data: null, error: null });
    await expect(
      tools.apply_program_days(CURRENT_WEEK + 1, { Monday: { before: null, after: day('Legs') } }, 'n'),
    ).rejects.toSatisfy((e: unknown) => isAppError(e) && e.code === 'not_found');
    expect(upserts(sb)).toHaveLength(0);
  });

  it('reports a validation failure with no applied days and does not save', async () => {
    const { sb, tools } = setup();
    const bad = { focus: 'Legs', exercises: [{ name: 'Squat', sets: 3, reps: 'x'.repeat(17) }] };
    const result = await tools.apply_program_days(
      CURRENT_WEEK,
      { Monday: { before: storedWeek().Monday, after: bad } },
      'n',
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('Program data validation failed');
    expect(result.data).toMatchObject({ applied: [], skipped: [] });
    expect(upserts(sb)).toHaveLength(0);
  });

  it('treats an omitted before as "the day must be absent" and skips an existing day', async () => {
    const { sb, tools } = setup();
    const result = await tools.apply_program_days(
      CURRENT_WEEK,
      { Monday: { after: day('Legs', 'Front Squat') } },
      'n',
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      applied: [],
      skipped: [{ day: 'Monday', reason: 'changed_since_draft' }],
    });
    expect(upserts(sb)).toHaveLength(0);
  });

  it('rejects a day entry that is not an object', async () => {
    const { sb, tools } = setup();
    await expect(
      tools.apply_program_days(CURRENT_WEEK, { Monday: null as any }, 'n'),
    ).rejects.toSatisfy((e: unknown) => isAppError(e) && e.code === 'invalid_args');
    expect(upserts(sb)).toHaveLength(0);
  });

  it('fails without writing when the logged-sets read errors, keeping the conflict skips', async () => {
    const { sb, tools } = setup();
    sb.respond('workout_logs.list', { data: null, error: { message: 'boom' } });
    const result = await tools.apply_program_days(
      CURRENT_WEEK,
      {
        Monday: { before: day('Legs', 'Leg Press'), after: day('Legs', 'Front Squat') },
        Friday: { before: storedWeek().Friday, after: day('Pull', 'Rack Pull') },
      },
      'n',
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('Failed to check logged sets');
    expect(result.data).toMatchObject({
      applied: [],
      skipped: [{ day: 'Monday', reason: 'changed_since_draft' }],
    });
    expect(upserts(sb)).toHaveLength(0);
  });

  it('reports no applied days when the upsert itself errors', async () => {
    const { sb, tools } = setup();
    sb.respond('workout_programs.single', { data: null, error: { message: 'db down' } });
    const result = await tools.apply_program_days(
      CURRENT_WEEK,
      { Monday: { before: storedWeek().Monday, after: day('Legs', 'Front Squat') } },
      'n',
    );
    expect(result.success).toBe(false);
    expect(result.message).toContain('db down');
    expect(result.data).toMatchObject({ applied: [] });
  });

  it('does not run the conflict or logged-sets guards for update_program_day', async () => {
    const { sb, tools } = setup();
    sb.respond('workout_logs.list', { data: [{ day_name: 'Wednesday' }], error: null });
    const result = await tools.update_program_day(CURRENT_WEEK, 'Wednesday', day('Push', 'Incline Press'));
    expect(result.success).toBe(true);
    expect(sb.calls.some(([table]) => table === 'workout_logs')).toBe(false);
    expect(upserts(sb)).toHaveLength(1);
  });
});

describe('ProgramDaySchema (shared with the check-in endpoint)', () => {
  const exercise = { name: 'Bench', sets: 3, reps: '8' };

  it('strips unknown keys so the stored form is canonical', () => {
    const parsed = ProgramDaySchema.safeParse({ focus: 'Push', surprise: 1, exercises: [{ ...exercise, extra: true }] });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ focus: 'Push', exercises: [exercise] });
  });

  it('rejects what save_workout_program would reject', () => {
    expect(ProgramDaySchema.safeParse({ exercises: [{ ...exercise, reps: 'x'.repeat(17) }] }).success).toBe(false);
    expect(ProgramDaySchema.safeParse({ exercises: [{ ...exercise, sets: 3.5 }] }).success).toBe(false);
  });
});
