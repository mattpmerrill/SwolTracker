import { describe, it, expect, vi } from 'vitest';
import { isAppError } from '@bot-native/sdk';
import { createActionTools } from '../tools/actions.js';
import { createQueryTools } from '../tools/queries.js';
import { createGenerationTools, type LlmCaller } from '../tools/generation.js';
import { buildApp } from '../sdk-adapter.js';
import { createMcpMockSupabase } from './mockSupabase.js';
import type { EventEmitter } from '../bot-native-shim.js';

const events: EventEmitter = { emit: vi.fn(async () => undefined) } as any;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

function weekWith(overrides: Record<string, unknown> = {}) {
  const week: Record<string, unknown> = {};
  for (const d of DAYS) week[d] = { focus: 'Rest', exercises: [] };
  return { ...week, ...overrides };
}

const forgeBlock = {
  id: 'forge',
  type: 'amrap',
  title: 'Forge AMRAP',
  time_cap_min: 12,
  exercise_indexes: [1, 2, 3, 4],
  benchmark: 'forge',
  notes: 'Pick a pace you can hold.',
};

const forgeExercises = [
  { name: 'Hang Power Cleans', sets: 3, reps: '3', percentages: [60, 65, 65], note: 'Fast, crisp' },
  { name: 'Hang Power Cleans', sets: 1, reps: '10/rd', weight_lbs: 95 },
  { name: 'Push-Ups', sets: 1, reps: '12/rd' },
  { name: 'Bodyweight Squats', sets: 1, reps: '15/rd' },
  { name: 'Burpees', sets: 1, reps: '8/rd' },
];

const saturday = {
  focus: 'Forge Baseline AMRAP - SCORE IT',
  coach_notes: 'Warm up 5 min. Cleans first while fresh, then the 12-min AMRAP.',
  exercises: forgeExercises,
  blocks: [forgeBlock],
};

function memberOf(sb: ReturnType<typeof createMcpMockSupabase>, gymId = 'g1', role = 'owner') {
  sb.respond('gym_members.list', {
    data: [{ gym_id: gymId, role, gyms: { id: gymId, name: 'Home' } }],
    error: null,
  });
}

function actionTools(sb: ReturnType<typeof createMcpMockSupabase>, userId = 'u1') {
  return createActionTools(sb, userId, events, createQueryTools(sb, userId));
}

function savedProgram(sb: ReturnType<typeof createMcpMockSupabase>) {
  const call = sb.calls.find(([table, method]) => table === 'workout_programs' && method === 'upsert');
  return call?.[2][0].program_data as Record<string, any> | undefined;
}

describe('program schema: coach_notes, blocks, note, weight_lbs', () => {
  async function save(program: Record<string, unknown>) {
    const sb = createMcpMockSupabase();
    memberOf(sb);
    sb.respond('workout_programs.single', { data: { id: 'p1' }, error: null });
    const result = await actionTools(sb).save_workout_program('g1', 38, program);
    return { result, sb };
  }

  // Regression: ExerciseSchema had no weight_lbs, and z.object strips unknown keys,
  // so a prescribed load saved by an agent was silently dropped. enrichExercises
  // reads ex.weight_lbs, so the Saturday "95 lb cleans" never reached the app.
  it('keeps weight_lbs on an exercise instead of stripping it', async () => {
    const { result, sb } = await save(
      weekWith({ Saturday: { focus: 'Lift', exercises: [{ name: 'Hang Power Cleans', sets: 1, reps: '10/rd', weight_lbs: 95 }] } }),
    );
    expect(result.success).toBe(true);
    expect(savedProgram(sb)!.Saturday.exercises[0].weight_lbs).toBe(95);
  });

  it('rejects a negative or absurd weight_lbs', async () => {
    for (const weight_lbs of [-5, 5000]) {
      const { result } = await save(
        weekWith({ Saturday: { focus: 'x', exercises: [{ name: 'Squat', sets: 1, reps: '5', weight_lbs }] } }),
      );
      expect(result.success).toBe(false);
    }
  });

  it('saves coach_notes and a valid block untouched', async () => {
    const { result, sb } = await save(weekWith({ Saturday: saturday }));
    expect(result.success).toBe(true);
    const day = savedProgram(sb)!.Saturday;
    expect(day.coach_notes).toBe(saturday.coach_notes);
    expect(day.blocks).toEqual([forgeBlock]);
  });

  it('still saves old days that have no coach_notes or blocks', async () => {
    const { result, sb } = await save(
      weekWith({ Monday: { focus: 'Push', exercises: [{ name: 'Bench Press', sets: 3, reps: '5' }] } }),
    );
    expect(result.success).toBe(true);
    expect(savedProgram(sb)!.Monday.blocks).toBeUndefined();
  });

  it('raises the exercise note limit to 500 (was 200)', async () => {
    const day = (note: string) =>
      weekWith({ Monday: { focus: 'x', exercises: [{ name: 'Bench Press', sets: 3, reps: '5', note }] } });
    expect((await save(day('n'.repeat(500)))).result.success).toBe(true);
    expect((await save(day('n'.repeat(501)))).result.success).toBe(false);
  });

  it('caps coach_notes at 1500 characters', async () => {
    const day = (coach_notes: string) => weekWith({ Monday: { focus: 'x', coach_notes, exercises: [] } });
    expect((await save(day('c'.repeat(1500)))).result.success).toBe(true);
    expect((await save(day('c'.repeat(1501)))).result.success).toBe(false);
  });

  const withBlocks = (blocks: unknown[]) =>
    weekWith({ Saturday: { ...saturday, blocks } });

  it('rejects a block that points past the exercise list', async () => {
    const { result } = await save(withBlocks([{ ...forgeBlock, exercise_indexes: [1, 2, 3, 5] }]));
    expect(result.success).toBe(false);
    expect(result.message).toContain('Saturday.blocks.0.exercise_indexes');
  });

  it('rejects two blocks that claim the same movement', async () => {
    const { result } = await save(
      withBlocks([forgeBlock, { ...forgeBlock, id: 'finisher', benchmark: undefined, exercise_indexes: [4] }]),
    );
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/already in block "forge"/);
  });

  it('rejects an index repeated inside one block', async () => {
    const { result } = await save(withBlocks([{ ...forgeBlock, exercise_indexes: [1, 1] }]));
    expect(result.success).toBe(false);
  });

  it('rejects duplicate block ids, bad ids, bad types, caps outside 1..90 and empty movement lists', async () => {
    const other = { ...forgeBlock, id: 'second', exercise_indexes: [0] };
    const bad: unknown[][] = [
      [forgeBlock, { ...other, id: 'forge' }],
      [{ ...forgeBlock, id: 'Forge Block!' }],
      [{ ...forgeBlock, type: 'emom' }],
      [{ ...forgeBlock, time_cap_min: 0 }],
      [{ ...forgeBlock, time_cap_min: 91 }],
      [{ ...forgeBlock, time_cap_min: 12.5 }],
      [{ ...forgeBlock, exercise_indexes: [] }],
      [{ ...forgeBlock, title: 't'.repeat(61) }],
      [{ ...forgeBlock, notes: 'n'.repeat(1001) }],
    ];
    for (const blocks of bad) {
      expect((await save(withBlocks(blocks))).result.success, JSON.stringify(blocks)).toBe(false);
    }
  });

  it('accepts rounds on for_time but rejects it on amrap, where it would be dropped silently', async () => {
    const forTime = { ...forgeBlock, type: 'for_time', rounds: 5 };
    expect((await save(withBlocks([forTime]))).result.success).toBe(true);
    expect((await save(withBlocks([{ ...forgeBlock, rounds: 5 }]))).result.success).toBe(false);
  });
});

describe('program rewrites keep coach_notes and blocks', () => {
  it('substitute_equipment_globally spreads the day, so notes and blocks survive', async () => {
    const sb = createMcpMockSupabase();
    memberOf(sb);
    sb.respond('workout_programs.list', {
      data: [
        {
          id: 'p38',
          week_number: 38,
          program_data: {
            Saturday: {
              ...saturday,
              exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: '5' }, ...forgeExercises.slice(1)],
            },
          },
        },
      ],
      error: null,
    });
    sb.respond('workout_programs.single', { data: null, error: null });

    const result = await actionTools(sb).substitute_equipment_globally('Barbell Bench Press', 'Dumbbell Bench Press');
    expect(result.success).toBe(true);
    const update = sb.calls.find(([t, m]) => t === 'workout_programs' && m === 'update')!;
    const saturdayOut = update[2][0].program_data.Saturday;
    expect(saturdayOut.exercises[0].name).toBe('Dumbbell Bench Press');
    expect(saturdayOut.coach_notes).toBe(saturday.coach_notes);
    expect(saturdayOut.blocks).toEqual([forgeBlock]);
  });

  it('rebuild_week_for_constraints sends the current notes and blocks and tells the model to keep them', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('workout_programs.single', {
      data: { id: 'p1', gym_id: 'g1', week_number: 38, program_data: weekWith({ Saturday: saturday }) },
      error: null,
    });
    sb.respond('prompt_templates.single', { data: { template: 'system' }, error: null });
    const llm = vi.fn(async () => ({
      content: JSON.stringify(weekWith({ Saturday: saturday })),
      usage: { prompt_tokens: 1, completion_tokens: 1 },
      model: 't',
    })) as unknown as LlmCaller;
    const save_workout_program = vi.fn(async () => ({ success: true, message: 'ok', data: {} }));
    const queries = { resolveGymId: vi.fn(async () => 'g1') } as any;

    const tools = createGenerationTools(sb, 'u1', queries, { save_workout_program } as any, llm);
    const result = await tools.rebuild_week_for_constraints(38, 'no barbell');
    expect(result.success).toBe(true);

    const prompt = (llm as any).mock.calls[0][0].userPrompt as string;
    expect(prompt).toContain('"coach_notes"');
    expect(prompt).toContain('"exercise_indexes"');
    expect(prompt).toMatch(/keep .*coach_notes.*blocks/i);
    expect(prompt).toMatch(/exercise_indexes/);
    const saved = (save_workout_program.mock.calls[0] as any[])[2];
    expect(saved.Saturday.coach_notes).toBe(saturday.coach_notes);
    expect(saved.Saturday.blocks).toEqual([forgeBlock]);
  });
});

describe('queries: notes, blocks and scores', () => {
  function programSb(day: unknown = saturday) {
    const sb = createMcpMockSupabase();
    memberOf(sb);
    sb.respond('profiles.single', {
      data: { program_start_date: '2026-01-05', timezone: 'America/Denver' },
      error: null,
    });
    sb.respond('workout_programs.single', {
      data: { id: 'p1', gym_id: 'g1', week_number: 38, program_data: weekWith({ Saturday: day }) },
      error: null,
    });
    sb.respond('current_user_maxes.list', {
      data: [{ user_id: 'u1', exercise_name: 'Hang Power Clean', weight_lbs: 150 }],
      error: null,
    });
    sb.respond('workout_logs.list', { data: [], error: null });
    sb.respond('workout_completions.maybeSingle', { data: null, error: null });
    return sb;
  }

  const thisWeek = {
    gym_id: 'g1',
    week_number: 38,
    day_name: 'Saturday',
    block_id: 'forge',
    benchmark: 'forge',
    score_type: 'amrap',
    rounds: 5,
    reps: 22,
    time_seconds: null,
    capped: false,
    note: null,
  };
  const earlier = { ...thisWeek, week_number: 37, rounds: 4, reps: 10 };

  it('get_todays_workout returns coach_notes, blocks, per-exercise note and block_id', async () => {
    const sb = programSb();
    sb.respond('workout_block_scores.list', { data: [], error: null });
    const result = await createQueryTools(sb, 'u1').get_todays_workout('g1', 'Saturday', 38);
    const data = result.data as any;

    expect(data.coach_notes).toBe(saturday.coach_notes);
    expect(data.blocks).toHaveLength(1);
    expect(data.blocks[0]).toMatchObject({
      id: 'forge',
      type: 'amrap',
      title: 'Forge AMRAP',
      time_cap_min: 12,
      exercise_indexes: [1, 2, 3, 4],
      benchmark: 'forge',
      score: null,
      best_previous: null,
    });
    expect(data.exercises[0]).toMatchObject({ note: 'Fast, crisp', block_id: null });
    expect(data.exercises[1]).toMatchObject({ note: null, block_id: 'forge', weight_lbs: 95 });
    expect(result.message).toContain('Forge AMRAP');
    expect(result.message).toContain('12 min cap');
    expect(result.message).toContain('Warm up 5 min');
  });

  it('adds this day\'s score and the best earlier score for the same benchmark, each with a display string', async () => {
    const sb = programSb();
    sb.respond('workout_block_scores.list', { data: [thisWeek, earlier, { ...earlier, week_number: 36, rounds: 3 }], error: null });
    const result = await createQueryTools(sb, 'u1').get_todays_workout('g1', 'Saturday', 38);
    const block = (result.data as any).blocks[0];

    expect(block.score).toMatchObject({ rounds: 5, reps: 22, display: '5 rounds + 22 reps' });
    expect(block.best_previous).toMatchObject({ week_number: 37, display: '4 rounds + 10 reps' });
    expect(result.message).toContain('score: 5 rounds + 22 reps');
  });

  it('never offers a later week or a different score type as the number to beat', async () => {
    const sb = programSb();
    sb.respond('workout_block_scores.list', {
      data: [
        { ...earlier, week_number: 39, rounds: 9 },
        { ...earlier, week_number: 30, score_type: 'for_time', rounds: null, reps: null, time_seconds: 600 },
      ],
      error: null,
    });
    const result = await createQueryTools(sb, 'u1').get_todays_workout('g1', 'Saturday', 38);
    expect((result.data as any).blocks[0].best_previous).toBeNull();
  });

  it('old days without notes or blocks return null/[] and skip the scores query', async () => {
    const sb = programSb({ focus: 'Push', exercises: [{ name: 'Bench Press', sets: 3, reps: '5' }] });
    const result = await createQueryTools(sb, 'u1').get_todays_workout('g1', 'Saturday', 38);
    expect((result.data as any).coach_notes).toBeNull();
    expect((result.data as any).blocks).toEqual([]);
    expect(sb.calls.some(([t]) => t === 'workout_block_scores')).toBe(false);
  });

  it('get_weekly_workout adds coach_notes and blocks per day, without scores', async () => {
    const sb = programSb();
    const result = await createQueryTools(sb, 'u1').get_weekly_workout(38, 'g1');
    const sat = (result.data as any).days.Saturday;
    expect(sat.coach_notes).toBe(saturday.coach_notes);
    expect(sat.blocks[0]).toMatchObject({ id: 'forge', time_cap_min: 12 });
    expect(sat.blocks[0].score).toBeUndefined();
    expect(sat.exercises[2].block_id).toBe('forge');
    expect(sb.calls.some(([t]) => t === 'workout_block_scores')).toBe(false);
  });

  it('get_training_history_summary lists block scores with the block title', async () => {
    const sb = programSb();
    sb.respond('profiles.single', {
      data: { id: 'u1', name: 'Matt', program_start_date: '2026-01-05', timezone: 'America/Denver' },
      error: null,
    });
    sb.respond('workout_programs.list', {
      data: [{ week_number: 38, program_data: weekWith({ Saturday: saturday }), ai_notes: null }],
      error: null,
    });
    sb.respond('workout_block_scores.list', { data: [thisWeek], error: null });
    const result = await createQueryTools(sb, 'u1').get_training_history_summary('g1', 4);
    expect(result.message).toContain('Block scores:');
    expect(result.message).toContain('Week 38 Saturday Forge AMRAP: 5 rounds + 22 reps');
    expect((result.data as any).block_scores[0]).toMatchObject({ block_id: 'forge', display: '5 rounds + 22 reps' });
  });
});

describe('log_block_score', () => {
  function logSb(opts: { scores?: unknown[]; day?: unknown; gym?: string; role?: string } = {}) {
    const sb = createMcpMockSupabase();
    memberOf(sb, opts.gym ?? 'g1', opts.role ?? 'owner');
    sb.respond('workout_programs.single', {
      data: { program_data: weekWith({ Saturday: opts.day ?? saturday }) },
      error: null,
    });
    sb.respond('current_user_maxes.list', { data: [], error: null });
    sb.respond('workout_block_scores.list', { data: opts.scores ?? [], error: null });
    sb.respond('workout_block_scores.single', { data: { id: 's1' }, error: null });
    sb.respond('workout_logs.list', { data: [{ id: 'l' }], error: null });
    return sb;
  }

  const call = (sb: ReturnType<typeof createMcpMockSupabase>, args: Record<string, unknown>, userId = 'u1') =>
    actionTools(sb, userId).log_block_score({ week_number: 38, day_name: 'Saturday', ...args } as any);

  const upserts = (sb: ReturnType<typeof createMcpMockSupabase>, table: string) =>
    sb.calls.filter(([t, m]) => t === table && m === 'upsert');

  it('writes the score row, then set-0 logs for every movement with per-movement AMRAP totals', async () => {
    const sb = logSb();
    const result = await call(sb, { block_id: 'forge', rounds: 5, reps: 22 });

    expect(result.success).toBe(true);
    expect(result.message).toContain('5 rounds + 22 reps');

    const [scoreCall] = upserts(sb, 'workout_block_scores');
    expect(scoreCall[2][0]).toMatchObject({
      user_id: 'u1',
      gym_id: 'g1',
      week_number: 38,
      day_name: 'Saturday',
      block_id: 'forge',
      benchmark: 'forge',
      score_type: 'amrap',
      rounds: 5,
      reps: 22,
      time_seconds: null,
      capped: false,
    });
    expect(scoreCall[2][1]).toEqual({ onConflict: 'user_id,gym_id,week_number,day_name,block_id' });

    const [logCall] = upserts(sb, 'workout_logs');
    expect(logCall[2][1]).toEqual({ onConflict: 'user_id,gym_id,week_number,day_name,exercise_index,set_index' });
    const rows = logCall[2][0] as any[];
    expect(rows.map((r) => r.exercise_index)).toEqual([1, 2, 3, 4]);
    expect(rows.every((r) => r.set_index === 0 && r.completed === true && r.user_id === 'u1' && r.gym_id === 'g1')).toBe(true);
    // 5 rounds + 22 extra over 10/12/15/8 reps: +10, +12, +0, +0
    expect(rows.map((r) => r.actual_reps)).toEqual([60, 72, 75, 40]);
    expect(rows[0]).toMatchObject({ exercise_name: 'Hang Power Cleans', actual_weight: 95, prescribed_weight: 95, prescribed_reps: '10/rd' });
    expect(rows[1].actual_weight).toBeNull();
  });

  it('a For Time finish writes the time and leaves movement reps null', async () => {
    const day = { ...saturday, blocks: [{ ...forgeBlock, type: 'for_time', rounds: 5 }] };
    const sb = logSb({ day });
    const result = await call(sb, { block_id: 'forge', time_seconds: 702 });
    expect(result.success).toBe(true);
    expect(result.message).toContain('11:42');
    expect(upserts(sb, 'workout_block_scores')[0][2][0]).toMatchObject({ score_type: 'for_time', time_seconds: 702, capped: false });
    expect((upserts(sb, 'workout_logs')[0][2][0] as any[]).every((r) => r.actual_reps === null)).toBe(true);
  });

  it('a capped For Time score needs no time and records the work done', async () => {
    const day = { ...saturday, blocks: [{ ...forgeBlock, type: 'for_time' }] };
    const sb = logSb({ day });
    const result = await call(sb, { block_id: 'forge', capped: true, rounds: 4, reps: 3 });
    expect(result.success).toBe(true);
    expect(result.message).toContain('Capped: 4 rounds + 3 reps');
  });

  it('reports the previous best for the benchmark and whether this score beat it', async () => {
    const prior = (rounds: number, reps: number, week: number) => ({
      week_number: week, day_name: 'Saturday', block_id: 'forge', benchmark: 'forge',
      score_type: 'amrap', rounds, reps, time_seconds: null, capped: false,
    });
    const sb = logSb({ scores: [prior(4, 10, 37), prior(5, 22, 36)] });
    const beaten = await call(sb, { block_id: 'forge', rounds: 6, reps: 0 });
    expect((beaten.data as any).previous_best).toMatchObject({ week_number: 36, display: '5 rounds + 22 reps' });
    expect((beaten.data as any).beat).toBe(true);
    expect(beaten.message).toMatch(/new best/i);

    const behind = await call(logSb({ scores: [prior(5, 22, 36)] }), { block_id: 'forge', rounds: 5, reps: 10 });
    expect((behind.data as any).beat).toBe(false);
    expect((behind.data as any).previous_best.display).toBe('5 rounds + 22 reps');
  });

  it('with no earlier score there is nothing to beat', async () => {
    const result = await call(logSb(), { block_id: 'forge', rounds: 5 });
    expect((result.data as any).previous_best).toBeNull();
    expect((result.data as any).beat).toBe(false);
  });

  it('rejects a block that is not in that day\'s program, and writes nothing', async () => {
    const sb = logSb();
    await expect(call(sb, { block_id: 'nope', rounds: 5 })).rejects.toSatisfy(
      (e: unknown) => isAppError(e) && e.code === 'not_found' && /forge/.test((e as Error).message),
    );
    expect(upserts(sb, 'workout_block_scores')).toHaveLength(0);
    expect(upserts(sb, 'workout_logs')).toHaveLength(0);
  });

  it('rejects when the day has no program at all', async () => {
    const sb = logSb();
    sb.respond('workout_programs.single', { data: null, error: null });
    await expect(call(sb, { block_id: 'forge', rounds: 5 })).rejects.toSatisfy(
      (e: unknown) => isAppError(e) && e.code === 'not_found',
    );
  });

  it('rejects an AMRAP without rounds, and a For Time with no time and not capped', async () => {
    const sb = logSb();
    for (const args of [{ reps: 22 }, {}, { rounds: 5, time_seconds: 600 }, { rounds: 5, capped: true }]) {
      await expect(call(sb, { block_id: 'forge', ...args })).rejects.toSatisfy(
        (e: unknown) => isAppError(e) && e.code === 'invalid_args',
      );
    }
    const forTime = logSb({ day: { ...saturday, blocks: [{ ...forgeBlock, type: 'for_time' }] } });
    await expect(call(forTime, { block_id: 'forge', rounds: 5 })).rejects.toSatisfy(
      (e: unknown) => isAppError(e) && e.code === 'invalid_args',
    );
    expect(upserts(sb, 'workout_block_scores')).toHaveLength(0);
  });

  it('a gym member logs under their own gym against the leader\'s program', async () => {
    const sb = logSb({ gym: 'g-member', role: 'member' });
    sb.respond('rpc.get_leader_gym_id', { data: 'g-leader', error: null });
    sb.respond('gyms.maybeSingle', { data: { id: 'g-leader', name: 'Coach Gym' }, error: null });

    const result = await call(sb, { block_id: 'forge', rounds: 3 }, 'u-member');
    expect(result.success).toBe(true);
    expect(upserts(sb, 'workout_block_scores')[0][2][0]).toMatchObject({ user_id: 'u-member', gym_id: 'g-member' });
    expect((upserts(sb, 'workout_logs')[0][2][0] as any[])[0]).toMatchObject({ user_id: 'u-member', gym_id: 'g-member' });
    // The block is read from the leader's program, not the member's own empty gym.
    const programGyms = sb.calls
      .filter(([t, m, a]) => t === 'workout_programs' && m === 'eq' && a[0] === 'gym_id')
      .map((c) => c[2][1]);
    expect(programGyms[0]).toBe('g-leader');
  });

  it('refuses a gym the caller is not a member of, without writing', async () => {
    const sb = logSb();
    await expect(call(sb, { block_id: 'forge', rounds: 5, gym_id: 'g-stranger' })).rejects.toSatisfy(
      (e: unknown) => isAppError(e) && e.code === 'not_found',
    );
    expect(upserts(sb, 'workout_block_scores')).toHaveLength(0);
  });

  it('takes the user id from the key, never from arguments', async () => {
    const sb = logSb();
    await call(sb, { block_id: 'forge', rounds: 5, user_id: 'attacker', userId: 'attacker' });
    const rows = [
      upserts(sb, 'workout_block_scores')[0][2][0] as any,
      ...(upserts(sb, 'workout_logs')[0][2][0] as any[]),
    ];
    expect(rows.every((r) => r.user_id === 'u1')).toBe(true);
    expect(sb.calls.filter(([, m, a]) => m === 'eq' && a[0] === 'user_id').every((c) => c[2][1] === 'u1')).toBe(true);

    const tool = buildApp(createMcpMockSupabase() as any).tools.find((t) => t.name === 'log_block_score')!;
    expect(Object.keys(tool.schema)).not.toContain('user_id');
  });

  it('does not write movement logs when the score row fails to save', async () => {
    const sb = logSb();
    sb.respond('workout_block_scores.single', { data: null, error: { message: 'boom' } });
    const result = await call(sb, { block_id: 'forge', rounds: 5 });
    expect(result.success).toBe(false);
    expect(upserts(sb, 'workout_logs')).toHaveLength(0);
  });
});
