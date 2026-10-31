// POST /api/checkin-worker with an in-memory database (api/_fake-supabase.js), a mocked tool kit and
// a scripted fake model. No network. Everything else (the Agents SDK, the schemas, the week and
// timezone math, the idempotency rules) is the real code. Time is pinned with fake Date only.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppError } from '@bot-native/sdk';

const h = vi.hoisted(() => ({
  db: null,
  kit: null,
  provider: null,
  modelCalls: [],
  script: null,
  usage: { inputTokens: 1200, outputTokens: 300 },
  pushConfigured: true,
  pushSent: null, // null = every subscription
  pushes: [],
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.db.client }));
vi.mock('../mcp/dist/mcp/src/sdk-adapter.js', () => ({ buildToolKit: (...args) => h.kit.build(...args) }));
vi.mock('./_push.js', () => ({
  configureWebPush: () => h.pushConfigured,
  sendToSubscriptions: async (_supabase, subs, payload) => {
    h.pushes.push({ subs, payload });
    return h.pushSent ?? subs.length;
  },
}));
vi.mock('./_chad-agent.js', async (importOriginal) => {
  const actual = await importOriginal();
  const { Runner } = await import('@openai/agents');
  return { ...actual, createRunner: () => new Runner({ modelProvider: h.provider, tracingDisabled: true }) };
});

import { Usage } from '@openai/agents';
import handler from './checkin-worker.js';
import { createFakeSupabase } from './_fake-supabase.js';

const SECRET = 'test-worker-secret-not-real';
const UID = '3f2b7a52-5d0a-4f3e-9c11-0a6f6a0e8a11';
const OTHER = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
const CID = '5b8e6f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const OID = '6c9f7a4b-2d3e-4f50-9bac-1d2e3f4a5b6c';
const GYM = 'gym-1';
const NOW = '2026-03-09T00:00:30Z'; // Sunday 18:00:30 MDT, just after the weekly check-in time

const env = { userId: UID, instigation: 'schedule', workflowId: `coach-${UID}`, runId: 'run-1', attempt: 1 };
const day = (focus, ...names) => ({ focus, exercises: names.map((name) => ({ name, sets: 3, reps: '8' })) });
const REST = { focus: 'Rest Day', exercises: [] };

const W1 = {
  Monday: day('Push', 'Bench Press'), Tuesday: day('Pull', 'Row'), Wednesday: REST, Thursday: day('Legs', 'Squat'),
  Friday: REST, Saturday: REST, Sunday: REST,
};
const W2 = {
  Monday: day('Push', 'Bench Press', 'Overhead Press'), Tuesday: day('Pull', 'Row'), Wednesday: day('Legs', 'Squat'),
  Thursday: REST, Friday: day('Arms', 'Curl'), Saturday: REST, Sunday: REST,
};

const REVIEW = {
  reviewWeek: 1, scheduledDays: ['Monday', 'Tuesday', 'Thursday'], completedDays: ['Monday', 'Tuesday'],
  missedDays: [{ day: 'Thursday', reason: null }],
  sessions: [{ day: 'Monday', exercise: 'Bench Press', sets: 3, avgWeight: 185, avgReps: 8, prescribedReps: 8, outcome: 'hit' }],
  notes: [{ day: 'Monday', label: null, text: 'felt good' }],
  recommendations: [{ exercise: 'Bench Press', type: 'increase', message: 'Ready to add 5 lbs.', increment: 5 }],
};

const textItem = (text) => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] });
const DRAFT_ANSWER = {
  recap: { headline: 'Solid week', wins: ['Bench is moving'], watch: ['Thursday got skipped'] },
  changes: [{ day: 'Monday', summary: 'Bench up five pounds', reason: 'Three clean sessions.', day_data: day('Push', 'Bench Press +5', 'Overhead Press') }],
};

let app; // settings the rpc handlers read
let isAdmin;
let leaderGym; // what get_leader_gym_id answers (null: not a group member)

function seedDb(extra = {}) {
  return createFakeSupabase({
    profiles: [{ id: UID, program_start_date: '2026-03-02', timezone: 'America/Denver' }],
    workout_programs: [
      { gym_id: GYM, week_number: 1, program_data: W1 },
      { gym_id: GYM, week_number: 2, program_data: W2 },
    ],
    chad_coach_settings: [{ user_id: UID, weekly_checkin: true }],
    gym_members: [{ user_id: UID, gym_id: GYM, role: 'owner', joined_at: '2026-01-01T00:00:00Z' }],
    gym_equipment: [{ gym_id: GYM, name: 'barbell' }],
    push_subscriptions: [{ user_id: UID, endpoint: 'https://push.example/1', keys: { p256dh: 'k', auth: 'a' } }],
    ...extra,
  }, {
    rpc: {
      get_app_setting: ({ p_key }) => app[p_key] ?? null,
      is_admin: () => isAdmin,
      get_leader_gym_id: () => leaderGym,
    },
  });
}

function makeKit() {
  const applyOk = vi.fn(async (_week, days) => ({ success: true, message: 'ok', data: { applied: Object.keys(days), skipped: [] } }));
  return {
    build: vi.fn(() => kit),
    queries: {
      get_maxes: vi.fn(async () => ({ success: true, data: { maxes: { 'Bench Press': 225 } } })),
      get_training_history_summary: vi.fn(async () => ({
        success: true,
        data: {
          week_summaries: {
            1: {
              scheduled_days: ['Monday', 'Tuesday', 'Thursday'],
              completed_days: ['Monday', 'Tuesday', 'Monday'],
              missed_days: [{ day: 'Thursday', reason: null }],
              exercise_sessions: [{ day_name: 'Monday', exercise_name: 'Bench Press', sets_logged: 3, avg_actual_weight: 185, avg_prescribed_weight: 180, avg_actual_reps: 8, prescribed_reps: 8, outcome: 'hit' }],
            },
            2: { scheduled_days: [], completed_days: [], missed_days: [], exercise_sessions: [] },
          },
          session_notes: [
            { week_number: 1, day_name: 'Monday', label: null, text: 'felt good' },
            { week_number: 0, day_name: 'Friday', label: null, text: 'old note' },
          ],
        },
      })),
      get_overload_recommendations: vi.fn(async () => ({
        success: true,
        data: { recommendations: [{ exercise_name: 'Bench Press', type: 'increase', message: 'Ready to add 5 lbs.', suggested_increment: 5 }] },
      })),
    },
    actions: { apply_program_days: applyOk },
  };
}
let kit;

async function call(body, { token = SECRET, method = 'POST' } = {}) {
  const req = { method, body, headers: token === null ? {} : { authorization: `Bearer ${token}` } };
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  await handler(req, res);
  return res;
}
const op = (name, extra = {}, overrides = {}) => call({ ...env, ...overrides, op: name, ...extra });

const events = () => h.db.rows('chad_events');
const eventNames = () => events().map((e) => e.event);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  process.env.CHECKIN_WORKER_SECRET = SECRET;
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-not-real';
  process.env.OPENROUTER_API_KEY = 'test-key-not-real';
  app = { chad_checkin_rollout: 'all', chad_price_per_mtok: '{"input":3,"output":15}' };
  isAdmin = false;
  leaderGym = null;
  h.db = seedDb();
  kit = makeKit();
  h.kit = kit;
  h.modelCalls = [];
  h.pushes = [];
  h.pushConfigured = true;
  h.pushSent = null;
  h.usage = { inputTokens: 1200, outputTokens: 300 };
  h.script = () => [textItem(JSON.stringify(DRAFT_ANSWER))];
  h.provider = {
    getModel: async (name) => ({
      name,
      async getResponse(request) {
        h.modelCalls.push({ model: name, request });
        return {
          usage: new Usage({ requests: 1, ...h.usage, totalTokens: h.usage.inputTokens + h.usage.outputTokens }),
          output: h.script(request),
          responseId: `resp_${h.modelCalls.length}`,
        };
      },
      // eslint-disable-next-line require-yield
      async *getStreamedResponse() { throw new Error('streaming is not used'); },
    }),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/checkin-worker: the secret', () => {
  it('500 when the secret is not configured', async () => {
    delete process.env.CHECKIN_WORKER_SECRET;
    expect((await op('schedule')).statusCode).toBe(500);
  });

  it('401 for a missing, wrong, shorter, longer or differently-cased token', async () => {
    for (const token of [null, 'wrong', 'x', SECRET.slice(0, -1), `${SECRET}x`, SECRET.toUpperCase(), 'y'.repeat(5000), '']) {
      const res = await call({ ...env, op: 'schedule' }, { token });
      expect(res.statusCode, String(token).slice(0, 20)).toBe(401);
    }
    expect(kit.build).not.toHaveBeenCalled();
    expect(h.db.writes('chad_events')).toHaveLength(0);
  });

  it('rejects a bare secret with no Bearer prefix', async () => {
    const res = await call({ ...env, op: 'schedule' }, { method: 'POST', token: null });
    expect(res.statusCode).toBe(401);
    const req = { method: 'POST', body: { ...env, op: 'schedule' }, headers: { authorization: SECRET } };
    const out = { status(c) { this.c = c; return this; }, json() { return this; } };
    await handler(req, out);
    expect(out.c).toBe(401);
  });

  it('405 for other methods, and 400 for a bad body only after the secret passes', async () => {
    expect((await call(undefined, { method: 'GET' })).statusCode).toBe(405);
    expect((await call({ op: 'schedule' }, { token: 'wrong' })).statusCode).toBe(401);
    expect((await call({ op: 'schedule' })).statusCode).toBe(400);
    expect((await call({ ...env, op: 'nope' })).statusCode).toBe(400);
    expect((await call({ ...env, op: 'apply', checkinId: 'not-a-uuid', acceptIds: [] })).statusCode).toBe(400);
  });

  it('binds the kit to the user id in the body, nothing else', async () => {
    await op('schedule');
    expect(kit.build).toHaveBeenCalledTimes(1);
    expect(kit.build.mock.calls[0][1]).toBe(UID);
  });
});

describe('op schedule', () => {
  it('returns the next wake-up times in the user zone and emits nothing', async () => {
    const res = await op('schedule');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      stop: false,
      timeZone: 'America/Denver',
      nextDailyAt: '2026-03-09T15:00:00.000Z', // Monday 09:00 MDT
      nextCheckinAt: '2026-03-16T00:00:00.000Z', // Sunday Mar 15 18:00 MDT; "now" is just after this week's
    });
    expect(h.db.writes('chad_events')).toHaveLength(0);
  });

  it('stops when the switch is off', async () => {
    h.db = seedDb({ chad_coach_settings: [{ user_id: UID, weekly_checkin: false }] });
    expect((await op('schedule')).body).toEqual({ stop: true, reason: 'disabled' });
  });

  it('stops when the user has no settings row at all', async () => {
    h.db = seedDb({ chad_coach_settings: [] });
    expect((await op('schedule')).body).toEqual({ stop: true, reason: 'disabled' });
  });

  it('rollout: admin only by default, everyone on "all"', async () => {
    app.chad_checkin_rollout = null;
    expect((await op('schedule')).body).toEqual({ stop: true, reason: 'rollout' });
    app.chad_checkin_rollout = 'admin';
    expect((await op('schedule')).body).toEqual({ stop: true, reason: 'rollout' });
    isAdmin = true;
    expect((await op('schedule')).body.stop).toBe(false);
    isAdmin = false;
    app.chad_checkin_rollout = ' ALL ';
    expect((await op('schedule')).body.stop).toBe(false);
    // is_admin was asked about the body's user id.
    expect(h.db.writes('rpc', 'is_admin')[0].payload).toEqual({ p_user_id: UID });
  });

  it('stops for a group member even though they own a personal gym', async () => {
    leaderGym = 'leader-gym';
    expect((await op('schedule')).body).toEqual({ stop: true, reason: 'group_member' });
  });

  it('stops for a user with no gym they can write to (a plain member, or none)', async () => {
    h.db = seedDb({ gym_members: [{ user_id: UID, gym_id: GYM, role: 'member', joined_at: '2026-01-01T00:00:00Z' }] });
    expect((await op('schedule')).body).toEqual({ stop: true, reason: 'no_gym' });
    h.db = seedDb({ gym_members: [] });
    expect((await op('schedule')).body).toEqual({ stop: true, reason: 'no_gym' });
  });

  it('picks the oldest writable gym, the way the kit does', async () => {
    h.db = seedDb({ gym_members: [
      { user_id: UID, gym_id: 'gym-z', role: 'owner', joined_at: '2026-02-01T00:00:00Z' },
      { user_id: UID, gym_id: GYM, role: 'owner', joined_at: '2026-01-01T00:00:00Z' },
    ] });
    await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' });
    expect(kit.queries.get_training_history_summary).toHaveBeenCalledWith(GYM, 1);
  });

  it('a failed read is a retryable 503, never a "stop" that would end the workflow for good', async () => {
    for (const key of ['gym_members.select', 'profiles.select', 'chad_coach_settings.select']) {
      h.db.clearFailures();
      h.db.fail(key, { code: '57014', message: 'canceling statement due to statement timeout' });
      const res = await op('schedule');
      expect(res.statusCode, key).toBe(503);
      expect(res.body.stop).toBeUndefined();
    }
    h.db.clearFailures();
    h.db = seedDb();
    // The leader lookup is an rpc: an error there must not read as "not a group member" either.
    const failing = createFakeSupabase({ chad_coach_settings: [{ user_id: UID, weekly_checkin: true }] }, {
      rpc: { get_app_setting: () => 'all' },
    });
    const original = failing.client.rpc;
    failing.client.rpc = async (name, args) => (name === 'get_leader_gym_id' ? { data: null, error: { code: '57014', message: 'timeout' } } : original(name, args));
    h.db = failing;
    const res = await op('schedule');
    expect(res.statusCode).toBe(503);
  });

  it('every other op answers 403 for an ineligible user', async () => {
    h.db = seedDb({ chad_coach_settings: [{ user_id: UID, weekly_checkin: false }] });
    expect((await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' })).statusCode).toBe(403);
    expect((await op('missed_check')).statusCode).toBe(403);
    const draft = await op('draft', { reviewWeek: 1, targetWeek: 2, anchor: '2026-03-09T00:00:00.000Z', review: REVIEW });
    expect(draft.statusCode).toBe(403);
    expect(h.modelCalls).toHaveLength(0);
  });
});

describe('op review', () => {
  it('builds the compact review of the week that ended and counts one run', async () => {
    const res = await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ skip: false, reviewWeek: 1, targetWeek: 2, anchor: '2026-03-09T00:00:00.000Z' });
    expect(res.body.review).toEqual({
      reviewWeek: 1,
      scheduledDays: ['Monday', 'Tuesday', 'Thursday'],
      completedDays: ['Monday', 'Tuesday'],
      missedDays: [{ day: 'Thursday', reason: null }],
      sessions: [{ day: 'Monday', exercise: 'Bench Press', sets: 3, avgWeight: 185, avgReps: 8, prescribedReps: 8, outcome: 'hit' }],
      notes: [{ day: 'Monday', label: null, text: 'felt good' }],
      recommendations: [{ exercise: 'Bench Press', type: 'increase', message: 'Ready to add 5 lbs.', increment: 5 }],
    });
    expect(kit.queries.get_training_history_summary).toHaveBeenCalledWith(GYM, 1);
    expect(eventNames()).toEqual(['run.started', 'step.completed']);
    expect(events()[0]).toMatchObject({ instigation: 'schedule', workflow_id: env.workflowId, run_id: 'run-1', metadata: { kind: 'weekly', week: 1 } });
  });

  it('a retried review does not count a second run', async () => {
    await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' });
    await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' }, { attempt: 2 });
    expect(eventNames().filter((e) => e === 'run.started')).toHaveLength(1);
  });

  it('a late wake-up on Monday still reviews the week that ended', async () => {
    vi.setSystemTime(new Date('2026-03-09T18:00:00Z')); // Monday 12:00 MDT, week 2 has started
    const res = await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' });
    expect(res.body).toMatchObject({ skip: false, reviewWeek: 1, targetWeek: 2 });
    expect(kit.queries.get_training_history_summary).toHaveBeenCalledWith(GYM, 2);
    expect(res.body.review.completedDays).toEqual(['Monday', 'Tuesday']);
  });

  it('skips, but still counts the run, when there is no program for next week', async () => {
    h.db = seedDb({ workout_programs: [{ gym_id: GYM, week_number: 1, program_data: W1 }] });
    const res = await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' });
    expect(res.body).toEqual({ skip: true, reason: 'no_next_week' });
    expect(eventNames()).toEqual(['run.started', 'completed']);
    expect(kit.queries.get_training_history_summary).not.toHaveBeenCalled();
  });

  it('scheduledFor is required: without it the week cannot be known', async () => {
    expect((await op('review')).statusCode).toBe(400);
    expect(h.db.writes('chad_events')).toHaveLength(0);
  });

  it('skips with no_program when the user has no start date, instead of reviewing a made-up week 1', async () => {
    h.db = seedDb({ profiles: [{ id: UID, program_start_date: null, timezone: 'America/Denver' }] });
    const res = await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' });
    expect(res.body).toEqual({ skip: true, reason: 'no_program' });
    expect(kit.queries.get_training_history_summary).not.toHaveBeenCalled();
    expect(eventNames()).toEqual(['run.started', 'completed']);
  });

  it('clamps odd numbers so the next step\'s request still validates', async () => {
    kit.queries.get_training_history_summary = vi.fn(async () => ({
      success: true,
      data: {
        week_summaries: { 1: {
          scheduled_days: ['Monday'], completed_days: ['Monday'], missed_days: [],
          exercise_sessions: [{ day_name: 'Monday', exercise_name: 'Bench', sets_logged: -2, avg_actual_weight: -45, avg_prescribed_weight: 0, avg_actual_reps: -1, prescribed_reps: -3, outcome: 'hit' }],
        } },
        session_notes: [],
      },
    }));
    kit.queries.get_overload_recommendations = vi.fn(async () => ({ success: true, data: { recommendations: [{ exercise_name: 'Bench', type: 'increase', message: 'x', suggested_increment: -5 }, { exercise_name: 'Odd', type: 'mystery', message: 'x' }] } }));
    const res = await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' });
    expect(res.body.review.sessions[0]).toMatchObject({ sets: 0, avgWeight: 0, avgReps: 0, prescribedReps: 0 });
    expect(res.body.review.recommendations).toEqual([{ exercise: 'Bench', type: 'increase', message: 'x', increment: 0 }]);
    // And the whole review passes the draft request's own bounds.
    const draft = await op('draft', { reviewWeek: 1, targetWeek: 2, anchor: res.body.anchor, review: res.body.review });
    expect(draft.statusCode).toBe(200);
  });

  it('skips when the Monday deadline already passed', async () => {
    vi.setSystemTime(new Date('2026-03-10T12:00:00Z'));
    const res = await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' });
    expect(res.body).toEqual({ skip: true, reason: 'window_closed' });
  });

  it('503 and no step.completed when the kit cannot read the history', async () => {
    kit.queries.get_training_history_summary = vi.fn(async () => ({ success: false, message: 'Failed to read logs: secret detail' }));
    const res = await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' });
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('secret detail');
  });
});

describe('op draft', () => {
  const draftBody = { reviewWeek: 1, targetWeek: 2, anchor: '2026-03-09T00:00:00.000Z', review: REVIEW };

  it('drafts, stores a pending check-in with the Monday timers and meters tokens and cost', async () => {
    const res = await op('draft', draftBody);

    expect(res.statusCode).toBe(200);
    expect(res.body.reused).toBe(false);
    // What crosses into Temporal is small: no recap, no proposed days.
    expect(res.body.checkin).toEqual({
      id: expect.any(String), status: 'pending',
      reminderAt: '2026-03-09T13:00:00.000Z', expiresAt: '2026-03-10T05:59:59.000Z', changeCount: 1,
    });

    const [row] = h.db.rows('chad_checkins');
    expect(row.recap).toMatchObject({ headline: 'Solid week', tone: 'normal', stats: { scheduled: 3, completed: 2, missed: 1 } });
    expect(row.changes).toHaveLength(1);
    expect(row.changes[0]).toMatchObject({ id: 'c1', day: 'Monday', before: W2.Monday });
    expect(row).toMatchObject({ review_week: 1, target_week: 2 });
    expect(row).toMatchObject({ user_id: UID, gym_id: GYM, status: 'pending', workflow_id: env.workflowId });
    expect(h.modelCalls).toHaveLength(1);

    const [event] = events();
    expect(event).toMatchObject({
      event: 'step.completed', step: 'draft', checkin_id: row.id, model: 'anthropic/claude-sonnet-5.5',
      prompt_tokens: 1200, completion_tokens: 300, cost_usd: 0.0081, attempt: 1, instigation: 'schedule',
    });
    expect(event.duration_ms).toBeGreaterThanOrEqual(0);
    expect(events()).toHaveLength(1); // draft emits no run.started: review already did
  });

  it('meters cost as 0 and flags it when the prices are missing or broken', async () => {
    app.chad_price_per_mtok = 'not json';
    await op('draft', draftBody);
    expect(events()[0]).toMatchObject({ cost_usd: 0, prompt_tokens: 1200, metadata: { price_missing: true } });
  });

  it('is idempotent: a pending check-in is returned without calling the model again', async () => {
    const first = await op('draft', draftBody);
    h.modelCalls.length = 0;
    const eventsBefore = events().length;

    const second = await op('draft', draftBody, { attempt: 2 });

    expect(second.statusCode).toBe(200);
    expect(second.body.reused).toBe(true);
    expect(second.body.checkin.id).toBe(first.body.checkin.id);
    expect(h.modelCalls).toHaveLength(0);
    expect(events()).toHaveLength(eventsBefore);
    expect(h.db.rows('chad_checkins')).toHaveLength(1);
  });

  it('re-drafts a half-written "drafting" row (a crashed attempt) and keeps its id', async () => {
    h.db = seedDb({
      chad_checkins: [{ id: CID, user_id: UID, gym_id: GYM, review_week: 1, target_week: 2, status: 'drafting' }],
    });
    const res = await op('draft', draftBody);

    expect(h.modelCalls).toHaveLength(1);
    expect(res.body.reused).toBe(false);
    expect(res.body.checkin).toMatchObject({ id: CID, status: 'pending' });
    expect(h.db.rows('chad_checkins')).toHaveLength(1);
  });

  it.each(['applied', 'partial', 'declined', 'expired', 'failed'])('returns a %s check-in as it is, without a model call', async (status) => {
    h.db = seedDb({
      chad_checkins: [{ id: CID, user_id: UID, gym_id: GYM, review_week: 1, target_week: 2, status, result: { applied: [], skipped: [] } }],
    });
    const res = await op('draft', draftBody);
    expect(res.body).toMatchObject({ reused: true, checkin: { id: CID, status } });
    expect(h.modelCalls).toHaveLength(0);
  });

  it('returns a decided check-in even when next week\'s program is gone', async () => {
    h.db = seedDb({
      workout_programs: [],
      chad_checkins: [{ id: CID, user_id: UID, gym_id: GYM, review_week: 1, target_week: 2, status: 'applied' }],
    });
    const res = await op('draft', draftBody);
    expect(res.body).toMatchObject({ reused: true, checkin: { status: 'applied' } });
  });

  it('503 on a model failure, records step.failed, leaves the row drafting and retryable', async () => {
    h.script = () => { throw new Error('upstream 502 key sk-or-secret'); };
    const res = await op('draft', draftBody);

    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('sk-or');
    expect(eventNames()).toEqual(['step.failed']);
    expect(events()[0]).toMatchObject({ step: 'draft', attempt: 1, prompt_tokens: 0, cost_usd: 0 });
    expect(h.db.rows('chad_checkins')[0].status).toBe('drafting');

    // The retry (attempt 2) recovers: same row, now pending.
    h.script = () => [textItem(JSON.stringify(DRAFT_ANSWER))];
    const retry = await op('draft', draftBody, { attempt: 2 });
    expect(retry.statusCode).toBe(200);
    expect(h.db.rows('chad_checkins')).toHaveLength(1);
    expect(h.db.rows('chad_checkins')[0].status).toBe('pending');
    expect(events().map((e) => [e.event, e.attempt])).toEqual([['step.failed', 1], ['step.completed', 2]]);
  });

  it('marks the check-in failed once the last attempt is spent', async () => {
    h.script = () => { throw new Error('upstream 502'); };
    await op('draft', draftBody, { attempt: 3 });
    expect(h.db.rows('chad_checkins')[0].status).toBe('failed');
    // And a later call returns it instead of paying for another try.
    h.modelCalls.length = 0;
    const again = await op('draft', draftBody, { attempt: 1 });
    expect(again.body).toMatchObject({ reused: true, checkin: { status: 'failed' } });
    expect(h.modelCalls).toHaveLength(0);
  });

  it('a red flag in the week\'s notes skips the model and stores a serious recap with no changes', async () => {
    const review = { ...REVIEW, notes: [{ day: 'Thursday', label: null, text: 'heard a pop in my knee on the last squat' }] };
    const res = await op('draft', { ...draftBody, review });

    expect(h.modelCalls).toHaveLength(0);
    expect(res.body.checkin).toMatchObject({ status: 'pending', changeCount: 0 });
    expect(h.db.rows('chad_checkins')[0].changes).toEqual([]);
    expect(h.db.rows('chad_checkins')[0].recap.tone).toBe('serious');
    expect(events()[0]).toMatchObject({ event: 'step.completed', step: 'draft', prompt_tokens: 0, cost_usd: 0, model: null, metadata: { red_flag: true, changes: 0 } });
  });

  it('409 when next week\'s program is gone, with no model call', async () => {
    h.db = seedDb({ workout_programs: [{ gym_id: GYM, week_number: 1, program_data: W1 }] });
    const res = await op('draft', draftBody);
    expect(res.statusCode).toBe(409);
    expect(h.modelCalls).toHaveLength(0);
  });

  it('sends the stored program, maxes and equipment to the model, and takes before from the database', async () => {
    h.script = () => [textItem(JSON.stringify({
      ...DRAFT_ANSWER,
      changes: [{ ...DRAFT_ANSWER.changes[0], before: { focus: 'a lie' } }],
    }))];
    await op('draft', draftBody);
    const sent = JSON.stringify(h.modelCalls[0].request.input);
    expect(sent).toContain('Bench Press');
    expect(sent).toContain('barbell');
    expect(sent).toContain('225');
    expect(h.db.rows('chad_checkins')[0].changes[0].before).toEqual(W2.Monday);
  });
});

describe('op notify', () => {
  const pending = (extra = {}) => ({
    id: CID, user_id: UID, gym_id: GYM, review_week: 1, target_week: 2, status: 'pending',
    recap: { headline: 'Solid week', tone: 'normal' }, changes: [{ id: 'c1' }, { id: 'c2' }],
    expires_at: '2026-03-10T05:59:59.000Z', notified_at: null, reminded_at: null, ...extra,
  });

  beforeEach(() => { h.db = seedDb({ chad_checkins: [pending()] }); });

  it('ready: pushes with the deep link, stamps notified_at and records waiting_on_human once', async () => {
    const res = await op('notify', { kind: 'ready', checkinId: CID });

    expect(res.body).toEqual({ sent: 1 });
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0].payload.url).toBe(`/workout?checkin=${CID}`);
    expect(h.pushes[0].payload.body).toContain('2 changes');
    expect(`${h.pushes[0].payload.title}${h.pushes[0].payload.body}`).not.toMatch(/[—–]/);
    expect(h.db.rows('chad_checkins')[0].notified_at).toBe('2026-03-09T00:00:30.000Z');
    expect(eventNames()).toEqual(['waiting_on_human']);

    // A retry sends nothing and adds nothing.
    const again = await op('notify', { kind: 'ready', checkinId: CID }, { attempt: 2 });
    expect(again.body).toEqual({ sent: 0, skipped: 'already_notified' });
    expect(h.pushes).toHaveLength(1);
    expect(eventNames()).toEqual(['waiting_on_human']);
  });

  it('reminder: its own dedupe column, its own copy', async () => {
    await op('notify', { kind: 'ready', checkinId: CID });
    const res = await op('notify', { kind: 'reminder', checkinId: CID });
    expect(res.body).toEqual({ sent: 1 });
    expect(h.pushes[1].payload.url).toBe(`/workout?checkin=${CID}`);
    expect(h.pushes[1].payload.title).toMatch(/still waiting/);
    const row = h.db.rows('chad_checkins')[0];
    expect(row.reminded_at).not.toBeNull();
    expect((await op('notify', { kind: 'reminder', checkinId: CID })).body).toEqual({ sent: 0, skipped: 'already_notified' });
    expect(h.pushes).toHaveLength(2);
  });

  it('no reminder for a check-in with nothing to decide, but the ready push goes out', async () => {
    h.db = seedDb({ chad_checkins: [pending({ changes: [], recap: { headline: 'On track', tone: 'normal' } })] });
    expect((await op('notify', { kind: 'ready', checkinId: CID })).body).toEqual({ sent: 1 });
    expect(h.pushes[0].payload.body).toMatch(/Nothing to change/);
    expect((await op('notify', { kind: 'reminder', checkinId: CID })).body).toEqual({ sent: 0, skipped: 'no_changes' });
    expect(h.pushes).toHaveLength(1);
  });

  it('is a no-op success when the user has no push subscriptions, and does not stamp the row', async () => {
    h.db = seedDb({ chad_checkins: [pending()], push_subscriptions: [] });
    const res = await op('notify', { kind: 'ready', checkinId: CID });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ sent: 0, skipped: 'no_subscriptions' });
    expect(h.pushes).toHaveLength(0);
    expect(h.db.rows('chad_checkins')[0].notified_at).toBeNull();
    // The check-in is still waiting on the user, push or not.
    expect(eventNames()).toEqual(['waiting_on_human']);
  });

  it('does not push for a check-in that is no longer open or has expired', async () => {
    h.db = seedDb({ chad_checkins: [pending({ status: 'applied' })] });
    expect((await op('notify', { kind: 'ready', checkinId: CID })).body).toEqual({ sent: 0, skipped: 'not_open' });
    h.db = seedDb({ chad_checkins: [pending({ expires_at: '2026-03-08T00:00:00.000Z' })] });
    expect((await op('notify', { kind: 'reminder', checkinId: CID })).body).toEqual({ sent: 0, skipped: 'not_open' });
    expect(h.pushes).toHaveLength(0);
  });

  it('does not stamp the row when delivery fails or VAPID is missing, and never errors', async () => {
    h.pushSent = 0;
    expect((await op('notify', { kind: 'ready', checkinId: CID })).body).toEqual({ sent: 0, skipped: 'delivery_failed' });
    expect(h.db.rows('chad_checkins')[0].notified_at).toBeNull();
    h.pushConfigured = false;
    expect((await op('notify', { kind: 'ready', checkinId: CID })).body).toEqual({ sent: 0, skipped: 'push_not_configured' });
    expect(eventNames()).toEqual(['waiting_on_human']); // still only once
  });

  it('404 for a check-in that is not this user\'s', async () => {
    const res = await op('notify', { kind: 'ready', checkinId: CID }, { userId: OTHER });
    expect(res.statusCode).toBe(404);
    expect(h.pushes).toHaveLength(0);
  });

  it('missed: pushes the offer deep link and dedupes on the offer row', async () => {
    h.db = seedDb({
      chad_missed_offers: [{ id: OID, user_id: UID, week: 2, from_day: 'Tuesday', to_day: 'Thursday', status: 'pending', expires_at: '2026-03-12T05:59:59.000Z' }],
    });
    const res = await op('notify', { kind: 'missed', offerId: OID }, { instigation: 'day_missed' });
    expect(res.body).toEqual({ sent: 1 });
    expect(h.pushes[0].payload.url).toBe(`/workout?offer=${OID}`);
    expect(h.pushes[0].payload.body).toContain('Thursday');
    expect(h.db.rows('chad_missed_offers')[0].notified_at).not.toBeNull();
    expect((await op('notify', { kind: 'missed', offerId: OID })).body).toEqual({ sent: 0, skipped: 'already_notified' });
  });
});

describe('op apply', () => {
  const change = (id, dayName, to) => ({
    id, day: dayName, summary: `Change ${dayName}`, reason: 'because', before: W2[dayName], after: { ...W2[dayName], exercises: [{ name: to, sets: 3, reps: '8' }] },
  });
  const checkin = (extra = {}) => ({
    id: CID, user_id: UID, gym_id: GYM, review_week: 1, target_week: 2, status: 'pending', recap: {},
    changes: [change('c1', 'Monday', 'Bench v2'), change('c2', 'Tuesday', 'Row v2'), change('c3', 'Friday', 'Curl v2')],
    expires_at: '2026-03-10T05:59:59.000Z', ...extra,
  });
  const apply = (acceptIds, extra = {}, overrides = {}) =>
    op('apply', { checkinId: CID, acceptIds, ...extra }, { instigation: 'user_action', ...overrides });

  beforeEach(() => { h.db = seedDb({ chad_checkins: [checkin()] }); });

  it('applies every change in one kit call with the drafted befores, and records approved + completed', async () => {
    const res = await apply(['c1', 'c2', 'c3']);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      status: 'applied',
      applied: [{ id: 'c1', day: 'Monday' }, { id: 'c2', day: 'Tuesday' }, { id: 'c3', day: 'Friday' }],
      skipped: [],
      alreadyDecided: false,
    });
    expect(kit.actions.apply_program_days).toHaveBeenCalledTimes(1);
    const [week, days, note, gymId] = kit.actions.apply_program_days.mock.calls[0];
    expect(week).toBe(2);
    expect(gymId).toBe(GYM);
    expect(note).toBe('Weekly check-in from Chad');
    expect(Object.keys(days).sort()).toEqual(['Friday', 'Monday', 'Tuesday']);
    expect(days.Monday.before).toEqual(W2.Monday);
    expect(days.Monday.after.exercises[0].name).toBe('Bench v2');

    const row = h.db.rows('chad_checkins')[0];
    expect(row).toMatchObject({ status: 'applied', decided_at: '2026-03-09T00:00:30.000Z', updated_at: '2026-03-09T00:00:30.000Z' });
    expect(row.result.applied).toHaveLength(3);
    expect(eventNames()).toEqual(['approved', 'completed']);
    expect(events()[0]).toMatchObject({ checkin_id: CID, instigation: 'user_action', metadata: { accepted: 3, applied: 3, skipped: 0 } });
  });

  it('is idempotent: a second apply returns the stored result and writes nothing', async () => {
    const first = await apply(['c1', 'c2']);
    expect(first.body.status).toBe('partial');
    kit.actions.apply_program_days.mockClear();
    const eventsBefore = events().length;

    const again = await apply(['c1', 'c2', 'c3'], {}, { attempt: 2 }); // even a different selection
    expect(again.statusCode).toBe(200);
    expect(again.body).toMatchObject({ status: 'partial', alreadyDecided: true, applied: first.body.applied });
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
    expect(events()).toHaveLength(eventsBefore);
  });

  it('partial: only the ticked changes are applied', async () => {
    const res = await apply(['c2']);
    expect(res.body).toMatchObject({ status: 'partial', applied: [{ id: 'c2', day: 'Tuesday' }], skipped: [] });
    expect(Object.keys(kit.actions.apply_program_days.mock.calls[0][1])).toEqual(['Tuesday']);
    expect(eventNames()).toEqual(['approved', 'completed']);
  });

  it('a conflict skip from the kit is reported per change and the rest still land', async () => {
    kit.actions.apply_program_days = vi.fn(async () => ({
      success: true, message: 'ok',
      data: { applied: ['Monday', 'Friday'], skipped: [{ day: 'Tuesday', reason: 'already_logged' }] },
    }));
    const res = await apply(['c1', 'c2', 'c3']);

    expect(res.body).toEqual({
      status: 'partial',
      applied: [{ id: 'c1', day: 'Monday' }, { id: 'c3', day: 'Friday' }],
      skipped: [{ id: 'c2', day: 'Tuesday', reason: 'already_logged' }],
      alreadyDecided: false,
    });
    expect(h.db.rows('chad_checkins')[0].status).toBe('partial');
    expect(events()[0]).toMatchObject({ event: 'approved', metadata: { accepted: 3, applied: 2, skipped: 1 } });
  });

  it('a concurrent apply that finishes first wins: its stored result is returned and not overwritten', async () => {
    kit.actions.apply_program_days = vi.fn(async (_week, days) => {
      // The other request lands while this one is saving.
      await h.db.client.from('chad_checkins')
        .update({ status: 'applied', result: { applied: [{ id: 'c1', day: 'Monday' }], skipped: [] } })
        .eq('id', CID);
      return { success: true, message: 'ok', data: { applied: Object.keys(days), skipped: [] } };
    });
    const res = await apply(['c1', 'c2']);
    expect(res.body).toMatchObject({ status: 'applied', alreadyDecided: true, applied: [{ id: 'c1', day: 'Monday' }] });
    expect(h.db.rows('chad_checkins')[0].result.applied).toHaveLength(1);
    expect(events()).toHaveLength(0);
  });

  it('is failed (kept out of the approval rate) when every ticked change hits a conflict, and says why', async () => {
    kit.actions.apply_program_days = vi.fn(async () => ({
      success: true, message: 'ok',
      data: { applied: [], skipped: [{ day: 'Monday', reason: 'changed_since_draft' }] },
    }));
    const res = await apply(['c1']);
    expect(res.body).toMatchObject({ status: 'failed', applied: [], skipped: [{ id: 'c1', day: 'Monday', reason: 'changed_since_draft' }] });
    expect(h.db.rows('chad_checkins')[0]).toMatchObject({ status: 'failed', result: { applied: [], skipped: [{ id: 'c1' }] } });
    // The user did say yes, so it is 'approved' with nothing applied, not 'declined'.
    expect(eventNames()).toEqual(['approved', 'completed']);
    expect(events()[0].metadata).toMatchObject({ accepted: 1, applied: 0, skipped: 1 });

    // And it is idempotent like any other decision.
    kit.actions.apply_program_days.mockClear();
    const again = await apply(['c1'], {}, { attempt: 2 });
    expect(again.body).toMatchObject({ status: 'failed', alreadyDecided: true });
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
  });

  it('a save the program refuses for validation is a permanent 409, not a retried 503', async () => {
    kit.actions.apply_program_days = vi.fn(async () => ({
      success: false, message: 'Program data validation failed: ...', data: { issues: [{ path: ['Monday'], message: 'reps too long' }] },
    }));
    const res = await apply(['c1', 'c2']);
    expect(res.statusCode).toBe(409);
    expect(h.db.rows('chad_checkins')[0].status).toBe('pending');
  });

  it('a "Got it" on a check-in with no changes is a decline', async () => {
    h.db = seedDb({ chad_checkins: [checkin({ changes: [], recap: { tone: 'serious' } })] });
    const res = await apply([]);
    expect(res.body).toMatchObject({ status: 'declined', alreadyDecided: false });
    expect(eventNames()).toEqual(['declined', 'completed']);
  });

  it('an empty selection is a decline: no kit call, declined + completed', async () => {
    const res = await apply([]);
    expect(res.body).toEqual({ status: 'declined', applied: [], skipped: [], alreadyDecided: false });
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
    expect(h.db.rows('chad_checkins')[0]).toMatchObject({ status: 'declined', decided_at: '2026-03-09T00:00:30.000Z' });
    expect(eventNames()).toEqual(['declined', 'completed']);
  });

  it('counts a day that already matches the drafted result as applied (a retry after a crash)', async () => {
    h.db = seedDb({
      chad_checkins: [checkin()],
      workout_programs: [
        { gym_id: GYM, week_number: 2, program_data: { ...W2, Monday: checkin().changes[0].after } },
      ],
    });
    const res = await apply(['c1', 'c2']);
    expect(res.body.applied).toEqual([{ id: 'c1', day: 'Monday' }, { id: 'c2', day: 'Tuesday' }]);
    expect(Object.keys(kit.actions.apply_program_days.mock.calls[0][1])).toEqual(['Tuesday']);
  });

  it('400 for an unknown change id, with nothing written', async () => {
    const res = await op('apply', { checkinId: CID, acceptIds: ['c4'] });
    expect(res.statusCode).toBe(400);
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
    expect(h.db.rows('chad_checkins')[0].status).toBe('pending');
  });

  it('404 for another user\'s check-in (ownership comes from the body user id, not the row alone)', async () => {
    const res = await apply(['c1'], {}, { userId: OTHER });
    expect(res.statusCode).toBe(404);
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
    expect(h.db.rows('chad_checkins')[0].status).toBe('pending');
  });

  it('409 when the check-in expired, whether by status or by the clock', async () => {
    h.db = seedDb({ chad_checkins: [checkin({ status: 'expired' })] });
    expect((await apply(['c1'])).statusCode).toBe(409);
    h.db = seedDb({ chad_checkins: [checkin({ expires_at: '2026-03-08T12:00:00.000Z' })] });
    expect((await apply(['c1'])).statusCode).toBe(409);
    h.db = seedDb({ chad_checkins: [checkin({ status: 'drafting' })] });
    expect((await apply(['c1'])).statusCode).toBe(409);
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
  });

  it('409 when the stored changes are damaged', async () => {
    h.db = seedDb({ chad_checkins: [checkin({ changes: [{ id: 'c1', day: 'Monday', before: null, after: { exercises: [] } }] })] });
    expect((await apply(['c1'])).statusCode).toBe(409);
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
  });

  it('maps a kit permission error to 403 and a failed save to 503, leaving the check-in pending', async () => {
    kit.actions.apply_program_days = vi.fn(async () => { throw AppError.forbidden('Only the group leader can change it.'); });
    const denied = await apply(['c1']);
    expect(denied.statusCode).toBe(403);

    kit.actions.apply_program_days = vi.fn(async () => ({ success: false, message: 'Failed to save: relation "workout_programs"' }));
    const failed = await apply(['c1']);
    expect(failed.statusCode).toBe(503);
    expect(JSON.stringify(failed.body)).not.toContain('workout_programs');

    kit.actions.apply_program_days = vi.fn(async () => { throw AppError.invalidArgs('Cannot edit a past week.'); });
    expect((await apply(['c1'])).statusCode).toBe(409);

    expect(h.db.rows('chad_checkins')[0].status).toBe('pending');
    expect(h.db.writes('chad_events')).toHaveLength(0);
  });
});

describe('op expire', () => {
  const pendingCheckin = { id: CID, user_id: UID, gym_id: GYM, review_week: 1, target_week: 2, status: 'pending' };
  const pendingOffer = { id: OID, user_id: UID, week: 2, from_day: 'Tuesday', to_day: 'Thursday', status: 'pending' };

  it('expires an open check-in once: expired + completed, and a repeat adds nothing', async () => {
    h.db = seedDb({ chad_checkins: [pendingCheckin] });
    const first = await op('expire', { checkinId: CID });
    expect(first.body).toEqual({ status: 'expired', expired: true });
    expect(h.db.rows('chad_checkins')[0]).toMatchObject({ status: 'expired', updated_at: '2026-03-09T00:00:30.000Z' });
    expect(eventNames()).toEqual(['expired', 'completed']);

    const again = await op('expire', { checkinId: CID }, { attempt: 2 });
    expect(again.body).toEqual({ status: 'expired', expired: false });
    expect(eventNames()).toEqual(['expired', 'completed']);
  });

  it('does not touch a decided check-in', async () => {
    h.db = seedDb({ chad_checkins: [{ ...pendingCheckin, status: 'applied' }] });
    expect((await op('expire', { checkinId: CID })).body).toEqual({ status: 'applied', expired: false });
    expect(h.db.writes('chad_events')).toHaveLength(0);
  });

  it('expires a half-drafted check-in too, and an open offer', async () => {
    h.db = seedDb({ chad_checkins: [{ ...pendingCheckin, status: 'drafting' }], chad_missed_offers: [pendingOffer] });
    expect((await op('expire', { checkinId: CID })).body.expired).toBe(true);
    expect((await op('expire', { offerId: OID })).body).toEqual({ status: 'expired', expired: true });
    expect(h.db.rows('chad_missed_offers')[0].status).toBe('expired');
  });

  it('works for a user who has switched check-ins off (turning off is what expires what is open)', async () => {
    h.db = seedDb({ chad_checkins: [pendingCheckin], chad_coach_settings: [{ user_id: UID, weekly_checkin: false }] });
    expect((await op('expire', { checkinId: CID })).body.expired).toBe(true);
  });

  it('404 for someone else\'s id', async () => {
    h.db = seedDb({ chad_checkins: [pendingCheckin] });
    expect((await op('expire', { checkinId: CID }, { userId: OTHER })).statusCode).toBe(404);
    expect(h.db.rows('chad_checkins')[0].status).toBe('pending');
  });
});

describe('op missed_check', () => {
  const WED_9AM = '2026-03-11T15:00:00Z'; // Wednesday 09:00 MDT, week 2
  const daily = (extra = {}, overrides = {}) => op('missed_check', extra, overrides);

  beforeEach(() => { vi.setSystemTime(new Date(WED_9AM)); });

  it('offers to move yesterday\'s unlogged workout to the next rest day, counting one run', async () => {
    const res = await daily();

    expect(res.statusCode).toBe(200);
    expect(res.body.created).toBe(true);
    expect(res.body.offer).toMatchObject({ week: 2, fromDay: 'Tuesday', toDay: 'Thursday', status: 'pending', expiresAt: '2026-03-12T05:59:59.000Z' });
    expect(h.db.rows('chad_missed_offers')).toHaveLength(1);
    expect(eventNames()).toEqual(['run.started', 'step.completed']);
  });

  it('a retry returns the same offer, creates no second row and counts no second run', async () => {
    const first = await daily();
    const second = await daily({}, { attempt: 2 });
    expect(second.body.created).toBe(false);
    expect(second.body.offer.id).toBe(first.body.offer.id);
    expect(h.db.rows('chad_missed_offers')).toHaveLength(1);
    expect(eventNames().filter((e) => e === 'run.started')).toHaveLength(1);
    expect(eventNames().filter((e) => e === 'step.completed')).toHaveLength(1);
  });

  it('a no-op daily check emits nothing: logged, completed, rest day, injury, no rest day left', async () => {
    const cases = [
      ['logged sets', { workout_logs: [{ user_id: UID, week_number: 2, day_name: 'Tuesday', completed: true }] }, 'already_logged'],
      ['a completion', { workout_completions: [{ user_id: UID, week_number: 2, day_name: 'Tuesday' }] }, 'completed'],
      ['marked injured', { missed_days: [{ user_id: UID, week_number: 2, day_name: 'Tuesday', reason: 'injury' }] }, 'injury_or_illness'],
      ['marked ill', { missed_days: [{ user_id: UID, week_number: 2, day_name: 'Tuesday', reason: 'Illness' }] }, 'injury_or_illness'],
      ['a rest day yesterday', { workout_programs: [{ gym_id: GYM, week_number: 2, program_data: { ...W2, Tuesday: REST } }] }, 'rest_day'],
      ['no rest day left', { workout_programs: [{ gym_id: GYM, week_number: 2, program_data: { ...W2, Thursday: day('Legs', 'Squat'), Saturday: day('Arms', 'Curl'), Sunday: day('Core', 'Plank') } }] }, 'no_rest_day'],
      ['no program', { workout_programs: [] }, 'no_program'],
    ];
    for (const [label, seed, reason] of cases) {
      h.db = seedDb(seed);
      const res = await daily();
      expect(res.body, label).toEqual({ offer: null, created: false, reason });
      expect(h.db.writes('chad_events'), label).toHaveLength(0);
      expect(h.db.rows('chad_missed_offers'), label).toHaveLength(0);
    }
  });

  it('still offers when yesterday was marked missed for an ordinary reason', async () => {
    h.db = seedDb({ missed_days: [{ user_id: UID, week_number: 2, day_name: 'Tuesday', reason: 'travel' }] });
    expect((await daily()).body.created).toBe(true);
  });

  it('does nothing without a program start date', async () => {
    h.db = seedDb({ profiles: [{ id: UID, program_start_date: null, timezone: 'America/Denver' }] });
    expect((await daily()).body).toEqual({ offer: null, created: false, reason: 'no_program' });
    expect(h.db.rows('chad_missed_offers')).toHaveLength(0);
  });

  it('logged sets beat a missed mark: no offer, so the workout is never scheduled twice', async () => {
    h.db = seedDb({
      workout_logs: [{ user_id: UID, week_number: 2, day_name: 'Tuesday', completed: true }],
      missed_days: [{ user_id: UID, week_number: 2, day_name: 'Tuesday', reason: 'travel' }],
    });
    expect((await daily()).body.reason).toBe('already_logged');
  });

  it('does nothing across the week boundary: Monday morning, yesterday was last week\'s Sunday', async () => {
    vi.setSystemTime(new Date('2026-03-16T15:00:00Z'));
    expect((await daily()).body).toEqual({ offer: null, created: false, reason: 'week_boundary' });
    expect(h.db.writes('chad_events')).toHaveLength(0);
  });

  it('does not offer again once the user has answered', async () => {
    h.db = seedDb({ chad_missed_offers: [{ id: OID, user_id: UID, week: 2, from_day: 'Tuesday', to_day: 'Thursday', status: 'declined' }] });
    expect((await daily()).body).toEqual({ offer: null, created: false, reason: 'already_handled' });
  });

  it('the user marking a day missed (day_missed) offers straight away and counts one run', async () => {
    const res = await daily({ week: 2, day: 'Monday' }, { instigation: 'day_missed' });
    expect(res.body.offer).toMatchObject({ fromDay: 'Monday', toDay: 'Thursday' });
    expect(events().map((e) => [e.event, e.instigation])).toEqual([['run.started', 'day_missed'], ['step.completed', 'day_missed']]);
    await daily({ week: 2, day: 'Monday' }, { instigation: 'day_missed', attempt: 2 });
    expect(eventNames().filter((e) => e === 'run.started')).toHaveLength(1);
  });

  it('a day_missed run that ends in no offer is still one run: run.started + completed, once', async () => {
    h.db = seedDb({ missed_days: [{ user_id: UID, week_number: 2, day_name: 'Monday', reason: 'injury' }] });
    const body = { week: 2, day: 'Monday' };
    expect((await daily(body, { instigation: 'day_missed' })).body.reason).toBe('injury_or_illness');
    await daily(body, { instigation: 'day_missed', attempt: 2 });
    expect(eventNames()).toEqual(['run.started', 'completed']);
    expect(events()[1].metadata.reason).toBe('injury_or_illness');
  });

  it('ignores a week that is not the current one', async () => {
    const res = await daily({ week: 1, day: 'Monday' }, { instigation: 'day_missed' });
    expect(res.body.reason).toBe('week_boundary');
    const future = await daily({ week: 3, day: 'Monday' }, { instigation: 'day_missed' });
    expect(future.body.reason).toBe('not_current_week');
  });
});

describe('op missed_apply', () => {
  const offer = (extra = {}) => ({
    id: OID, user_id: UID, week: 2, from_day: 'Tuesday', to_day: 'Thursday', status: 'pending', expires_at: '2026-03-12T05:59:59.000Z', ...extra,
  });
  const answer = (accept, overrides = {}) => op('missed_apply', { offerId: OID, accept }, { instigation: 'user_action', ...overrides });

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-03-11T16:00:00Z'));
    h.db = seedDb({ chad_missed_offers: [offer()] });
  });

  it('moves the workout and rests the old day in ONE kit call with correct befores', async () => {
    const res = await answer(true);

    expect(res.body).toEqual({ status: 'accepted', fromDay: 'Tuesday', toDay: 'Thursday', alreadyDecided: false });
    expect(kit.actions.apply_program_days).toHaveBeenCalledTimes(1);
    const [week, days, , gymId] = kit.actions.apply_program_days.mock.calls[0];
    expect(week).toBe(2);
    expect(gymId).toBe(GYM);
    expect(days).toEqual({
      Tuesday: { before: W2.Tuesday, after: { focus: 'Rest Day', exercises: [] } },
      Thursday: { before: W2.Thursday, after: W2.Tuesday },
    });
    expect(h.db.rows('chad_missed_offers')[0]).toMatchObject({ status: 'accepted', updated_at: '2026-03-11T16:00:00.000Z' });
    expect(eventNames()).toEqual(['approved', 'completed']);
    expect(events()[0]).toMatchObject({ instigation: 'user_action', metadata: { offer: OID } });
  });

  it('is idempotent: answering again returns the stored outcome and writes nothing', async () => {
    await answer(true);
    kit.actions.apply_program_days.mockClear();
    const eventsBefore = events().length;
    const again = await answer(true, { attempt: 2 });
    expect(again.body).toEqual({ status: 'accepted', fromDay: 'Tuesday', toDay: 'Thursday', alreadyDecided: true });
    const declineAfter = await answer(false);
    expect(declineAfter.body.status).toBe('accepted');
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
    expect(events()).toHaveLength(eventsBefore);
  });

  it('decline closes the offer without touching the program', async () => {
    const res = await answer(false);
    expect(res.body).toEqual({ status: 'declined', fromDay: 'Tuesday', toDay: 'Thursday', alreadyDecided: false });
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
    expect(eventNames()).toEqual(['declined', 'completed']);
  });

  it('409 and an untouched program when the target is no longer a rest day', async () => {
    h.db = seedDb({
      chad_missed_offers: [offer()],
      workout_programs: [{ gym_id: GYM, week_number: 2, program_data: { ...W2, Thursday: day('Legs', 'Squat') } }],
    });
    expect((await answer(true)).statusCode).toBe(409);
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
    // A permanent conflict ends the offer, so the card stops offering what always fails.
    expect(h.db.rows('chad_missed_offers')[0].status).toBe('expired');
    expect(eventNames()).toEqual(['expired', 'completed']);
    expect(events()[0].metadata).toMatchObject({ offer: OID });
    // Answering again is the same 409, with nothing more recorded.
    expect((await answer(true, { attempt: 2 })).statusCode).toBe(409);
    expect(eventNames()).toEqual(['expired', 'completed']);
  });

  it('treats an already-moved workout (retry after a crash) as accepted without writing again', async () => {
    h.db = seedDb({
      chad_missed_offers: [offer()],
      workout_programs: [{ gym_id: GYM, week_number: 2, program_data: { ...W2, Tuesday: REST, Thursday: W2.Tuesday } }],
    });
    const res = await answer(true);
    expect(res.body.status).toBe('accepted');
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
    expect(h.db.rows('chad_missed_offers')[0].status).toBe('accepted');
  });

  it('puts the saved day back when only one of the two days could be written', async () => {
    kit.actions.apply_program_days = vi.fn()
      .mockResolvedValueOnce({ success: true, message: 'ok', data: { applied: ['Thursday'], skipped: [{ day: 'Tuesday', reason: 'already_logged' }] } })
      .mockResolvedValueOnce({ success: true, message: 'ok', data: { applied: ['Thursday'], skipped: [] } });
    const res = await answer(true);

    expect(res.statusCode).toBe(409);
    expect(kit.actions.apply_program_days).toHaveBeenCalledTimes(2);
    const [, undo] = kit.actions.apply_program_days.mock.calls[1];
    expect(undo).toEqual({ Thursday: { before: W2.Tuesday, after: W2.Thursday } });
    expect(h.db.rows('chad_missed_offers')[0].status).toBe('expired');
    expect(eventNames()).toEqual(['expired', 'completed']);
  });

  it('checks the rollback result: a rollback that comes back unsaved is reported, and still a 409', async () => {
    const sentry = await import('./_sentry.js');
    const spy = vi.spyOn(sentry, 'captureException').mockImplementation(() => {});
    kit.actions.apply_program_days = vi.fn()
      .mockResolvedValueOnce({ success: true, message: 'ok', data: { applied: ['Thursday'], skipped: [{ day: 'Tuesday', reason: 'already_logged' }] } })
      .mockResolvedValueOnce({ success: false, message: 'Failed to save', data: {} });
    const res = await answer(true);
    expect(res.statusCode).toBe(409);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('409 for an expired offer, by status or by the clock', async () => {
    h.db = seedDb({ chad_missed_offers: [offer({ status: 'expired' })] });
    expect((await answer(true)).statusCode).toBe(409);
    h.db = seedDb({ chad_missed_offers: [offer({ expires_at: '2026-03-11T05:59:59.000Z' })] });
    expect((await answer(true)).statusCode).toBe(409);
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
  });

  it('403 for a group member and 404 for someone else\'s offer', async () => {
    leaderGym = 'leader-gym';
    expect((await answer(true)).statusCode).toBe(403);
    leaderGym = null;
    expect((await answer(true, { userId: OTHER })).statusCode).toBe(404);
    expect(kit.actions.apply_program_days).not.toHaveBeenCalled();
  });
});

describe('upstream failures', () => {
  it('a database error is a 503 with no detail', async () => {
    h.db.fail('chad_coach_settings.select', { code: '42P01', message: 'relation "chad_coach_settings" does not exist' });
    const res = await op('schedule');
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('chad_coach_settings');
  });

  it('a failing metering insert never fails the work', async () => {
    h.db.fail('chad_events.insert');
    const res = await op('review', { scheduledFor: '2026-03-09T00:00:00.000Z' });
    expect(res.statusCode).toBe(200);
    expect(res.body.skip).toBe(false);
  });
});
