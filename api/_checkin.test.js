// POST /api/checkin with an in-memory database, a mocked tool kit and a mocked Temporal client. No
// network. The Temporal error classes are the real ones, so the error mapping is tested against what
// the SDK actually throws.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const h = vi.hoisted(() => ({
  db: null,
  client: null,
  handle: null,
  configured: true,
  connectError: null,
  blocked: false,
  rpcNames: [],
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.db.client }));
vi.mock('./_temporal.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    isTemporalConfigured: () => h.configured,
    getTemporalClient: async () => {
      if (h.connectError) throw h.connectError;
      return h.client;
    },
  };
});

import {
  ApplicationFailure,
  WorkflowNotFoundError,
  WorkflowUpdateFailedError,
  WorkflowUpdateRPCTimeoutOrCancelledError,
} from '@temporalio/client';
import handler from './checkin.js';
import { createFakeSupabase } from './_fake-supabase.js';

const UID = '3f2b7a52-5d0a-4f3e-9c11-0a6f6a0e8a11';
const OTHER = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';
const CID = '5b8e6f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const OID = '6c9f7a4b-2d3e-4f50-9bac-1d2e3f4a5b6c';

let settings;
let isAdmin;
let leaderGym;

function seed(extra = {}) {
  return createFakeSupabase({
    chad_coach_settings: [{ user_id: UID, weekly_checkin: false }],
    chad_checkins: [{ id: CID, user_id: UID, status: 'pending' }],
    chad_missed_offers: [{ id: OID, user_id: UID, status: 'pending' }],
    gym_members: [{ user_id: UID, gym_id: 'gym-1', role: 'owner', joined_at: '2026-01-01T00:00:00Z' }],
    ...extra,
  }, {
    auth: (token) => (token === 'good-token' ? UID : null),
    rpc: {
      check_rate_limit: () => !h.blocked,
      get_app_setting: ({ p_key }) => settings[p_key] ?? null,
      is_admin: () => isAdmin,
      get_leader_gym_id: () => leaderGym,
    },
  });
}

async function call(body, { token = 'good-token', method = 'POST' } = {}) {
  const req = { method, body, headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  await handler(req, res);
  return res;
}

const decide = (extra = {}) => call({ action: 'decide', checkinId: CID, acceptIds: ['c1'], ...extra });
const rpcCalls = (name) => h.db.writes('rpc', name);

beforeEach(() => {
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-not-real';
  settings = { chad_checkin_rollout: 'all' };
  isAdmin = false;
  leaderGym = null;
  h.configured = true;
  h.connectError = null;
  h.blocked = false;
  h.db = seed();
  h.handle = {
    signal: vi.fn(async () => {}),
    describe: vi.fn(async () => ({ status: { name: 'RUNNING' } })),
    executeUpdate: vi.fn(async () => ({ status: 'applied', applied: [{ id: 'c1', day: 'Monday' }], skipped: [], alreadyDecided: false })),
  };
  h.client = {
    connection: { withDeadline: vi.fn(async (_deadline, fn) => fn()) },
    workflow: {
      signalWithStart: vi.fn(async () => ({})),
      getHandle: vi.fn(() => h.handle),
    },
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /api/checkin: gates', () => {
  it('answers OPTIONS, rejects other methods, and 400s a bad body', async () => {
    expect((await call(undefined, { method: 'OPTIONS' })).statusCode).toBe(200);
    expect((await call(undefined, { method: 'GET' })).statusCode).toBe(405);
    for (const body of [undefined, {}, { action: 'nope' }, { action: 'settings' }, { action: 'decide', checkinId: 'x', acceptIds: [] }]) {
      expect((await call(body)).statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it('503 "Check-ins are off right now." when Temporal is not configured, before any auth or database work', async () => {
    h.configured = false;
    const res = await call({ action: 'status' }, { token: null });
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('Check-ins are off right now.');
    expect(h.db.writes('rpc')).toHaveLength(0);
    expect(h.client.workflow.getHandle).not.toHaveBeenCalled();
  });

  it('401 without a token and with a bad one, and nothing reaches Temporal', async () => {
    expect((await call({ action: 'status' }, { token: null })).statusCode).toBe(401);
    expect((await call({ action: 'status' }, { token: 'bad-token' })).statusCode).toBe(401);
    expect((await call({ action: 'settings', enabled: true }, { token: 'bad-token' })).statusCode).toBe(401);
    expect(h.client.workflow.signalWithStart).not.toHaveBeenCalled();
    expect(h.db.writes('chad_coach_settings')).toHaveLength(0);
  });

  it('429 when the daily limit is used up, with its own counter, and Temporal is not touched', async () => {
    h.blocked = true;
    for (const body of [
      { action: 'settings', enabled: true },
      { action: 'decide', checkinId: CID, acceptIds: [] },
      { action: 'missed', offerId: OID, accept: true },
      { action: 'event', type: 'day_missed', week: 2, day: 'Monday' },
    ]) {
      const res = await call(body);
      expect(res.statusCode, body.action).toBe(429);
    }
    expect(rpcCalls('check_rate_limit')[0].payload).toEqual({
      p_user_id: UID, p_operation: 'checkin_action', p_max_requests: 30, p_window_minutes: 1440,
    });
    expect(h.client.workflow.signalWithStart).not.toHaveBeenCalled();
    expect(h.handle.executeUpdate).not.toHaveBeenCalled();
    expect(h.handle.signal).not.toHaveBeenCalled();
  });

  it('never rate-limits the status action, even when the limit is spent', async () => {
    h.blocked = true;
    const res = await call({ action: 'status' });
    expect(res.statusCode).toBe(200);
    expect(rpcCalls('check_rate_limit')).toHaveLength(0);
  });
});

describe('action status', () => {
  it('reports an eligible user and the switch', async () => {
    expect((await call({ action: 'status' })).body).toEqual({ eligible: true, enabled: false, configured: true });
    h.db = seed({ chad_coach_settings: [{ user_id: UID, weekly_checkin: true }] });
    expect((await call({ action: 'status' })).body).toEqual({ eligible: true, enabled: true, configured: true });
  });

  it('gives the reason when the user cannot use it', async () => {
    settings.chad_checkin_rollout = 'admin';
    expect((await call({ action: 'status' })).body).toEqual({ eligible: false, reason: 'rollout', enabled: false, configured: true });
    isAdmin = true;
    expect((await call({ action: 'status' })).body.eligible).toBe(true);

    isAdmin = false;
    settings.chad_checkin_rollout = 'all';
    leaderGym = 'leader-gym';
    expect((await call({ action: 'status' })).body).toMatchObject({ eligible: false, reason: 'group_member' });
    leaderGym = null;
    h.db = seed({ gym_members: [] });
    expect((await call({ action: 'status' })).body).toMatchObject({ eligible: false, reason: 'no_gym' });
  });

  it('a failed database read is an error, never "not eligible"', async () => {
    h.db.fail('gym_members.select');
    const res = await call({ action: 'status', userId: OTHER });
    expect(res.statusCode).toBe(500);
    expect(res.body.reason).toBeUndefined();
  });

  describe('self-heal', () => {
    beforeEach(() => { h.db = seed({ chad_coach_settings: [{ user_id: UID, weekly_checkin: true }] }); });
    const status = () => call({ action: 'status' });

    it('leaves a running workflow alone: describe only, no signal in its history', async () => {
      const res = await status();
      expect(res.body).toEqual({ eligible: true, enabled: true, configured: true });
      expect(h.client.workflow.getHandle).toHaveBeenCalledWith(`coach-${UID}`);
      expect(h.handle.describe).toHaveBeenCalledTimes(1);
      expect(h.client.workflow.signalWithStart).not.toHaveBeenCalled();
    });

    it('starts the workflow when it does not exist', async () => {
      h.handle.describe = vi.fn(async () => { throw new WorkflowNotFoundError('not found', `coach-${UID}`, undefined); });
      const res = await status();
      expect(res.body).toEqual({ eligible: true, enabled: true, configured: true });
      expect(h.client.workflow.signalWithStart).toHaveBeenCalledTimes(1);
      expect(h.client.workflow.signalWithStart.mock.calls[0][1]).toMatchObject({
        workflowId: `coach-${UID}`, signal: 'setEnabled', signalArgs: [true], workflowIdConflictPolicy: 'USE_EXISTING',
      });
    });

    it.each(['COMPLETED', 'FAILED', 'TERMINATED', 'TIMED_OUT', 'CANCELLED'])('starts it again when the last run is %s', async (name) => {
      h.handle.describe = vi.fn(async () => ({ status: { name } }));
      await status();
      expect(h.client.workflow.signalWithStart).toHaveBeenCalledTimes(1);
    });

    it('never throws or changes the answer when describe fails, and does not guess a start', async () => {
      h.handle.describe = vi.fn(async () => { throw new Error('unavailable'); });
      const res = await status();
      expect(res).toMatchObject({ statusCode: 200, body: { eligible: true, enabled: true, configured: true } });
      expect(h.client.workflow.signalWithStart).not.toHaveBeenCalled();
    });

    it('a failing start or connect never changes the answer either', async () => {
      h.handle.describe = vi.fn(async () => { throw new WorkflowNotFoundError('nf', `coach-${UID}`, undefined); });
      h.client.workflow.signalWithStart = vi.fn(async () => { throw new Error('down'); });
      expect((await status()).body.enabled).toBe(true);
      h.connectError = new Error('refused');
      expect((await status()).statusCode).toBe(200);
    });

    it('is capped: a Temporal that never answers delays status by about 1.5 s at most', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
      h.client.connection.withDeadline = vi.fn(() => new Promise(() => {}));
      const pending = status();
      await vi.advanceTimersByTimeAsync(1_600);
      expect((await pending).statusCode).toBe(200);
    });
  });

  it('does not self-heal a user who is off or not eligible', async () => {
    await call({ action: 'status' }); // off
    settings.chad_checkin_rollout = 'admin';
    h.db = seed({ chad_coach_settings: [{ user_id: UID, weekly_checkin: true }] });
    await call({ action: 'status' }); // on but not eligible
    expect(h.client.workflow.signalWithStart).not.toHaveBeenCalled();
  });

});

describe('action settings', () => {
  it('enabling saves the row, then signal-with-starts the workflow for the verified user', async () => {
    const res = await call({ action: 'settings', enabled: true, userId: OTHER });

    expect(res).toMatchObject({ statusCode: 200, body: { enabled: true } });
    const row = h.db.rows('chad_coach_settings').find((r) => r.user_id === UID);
    expect(row.weekly_checkin).toBe(true);
    expect(h.db.rows('chad_coach_settings').some((r) => r.user_id === OTHER)).toBe(false);
    expect(typeof h.db.writes('chad_coach_settings', 'upsert')[0].payload.updated_at).toBe('string');

    expect(h.client.workflow.signalWithStart).toHaveBeenCalledTimes(1);
    expect(h.client.workflow.signalWithStart).toHaveBeenCalledWith('coachLoopWorkflow', {
      workflowId: `coach-${UID}`,
      taskQueue: 'chad-checkin',
      args: [{ userId: UID }],
      signal: 'setEnabled',
      signalArgs: [true],
      workflowIdConflictPolicy: 'USE_EXISTING',
    });
    expect(h.client.connection.withDeadline).toHaveBeenCalled();
  });

  it('refuses to enable for an ineligible user: 403 with a reason, no row, no signal', async () => {
    settings.chad_checkin_rollout = 'admin';
    const res = await call({ action: 'settings', enabled: true });
    expect(res.statusCode).toBe(403);
    expect(res.body.reason).toBe('rollout');
    expect(h.db.writes('chad_coach_settings', 'upsert')).toHaveLength(0);
    expect(h.client.workflow.signalWithStart).not.toHaveBeenCalled();
  });

  it('puts the switch back and answers 503 when the workflow cannot be started', async () => {
    h.client.workflow.signalWithStart = vi.fn(async () => { throw new WorkflowUpdateRPCTimeoutOrCancelledError('deadline'); });
    const res = await call({ action: 'settings', enabled: true });
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe("Chad's offline right now. Try again in a bit.");
    expect(h.db.rows('chad_coach_settings').find((r) => r.user_id === UID).weekly_checkin).toBe(false);

    h.connectError = new Error('connect ECONNREFUSED with a host name');
    const down = await call({ action: 'settings', enabled: true });
    expect(down.statusCode).toBe(503);
    expect(JSON.stringify(down.body)).not.toContain('ECONNREFUSED');
  });

  it('disabling saves the row and signals setEnabled(false) on the user\'s workflow', async () => {
    h.db = seed({ chad_coach_settings: [{ user_id: UID, weekly_checkin: true }] });
    const res = await call({ action: 'settings', enabled: false });

    expect(res.body).toEqual({ enabled: false });
    expect(h.db.rows('chad_coach_settings')[0].weekly_checkin).toBe(false);
    expect(h.client.workflow.getHandle).toHaveBeenCalledWith(`coach-${UID}`);
    expect(h.handle.signal).toHaveBeenCalledWith('setEnabled', false);
    expect(h.client.workflow.signalWithStart).not.toHaveBeenCalled();
  });

  it('disabling still works when there is no workflow, and when Temporal is unreachable', async () => {
    console.error.mockClear();
    h.handle.signal = vi.fn(async () => { throw new WorkflowNotFoundError('not found', `coach-${UID}`, undefined); });
    expect((await call({ action: 'settings', enabled: false })).body).toEqual({ enabled: false });
    expect(console.error).not.toHaveBeenCalled();

    h.connectError = new Error('down');
    const res = await call({ action: 'settings', enabled: false });
    expect(res.body).toEqual({ enabled: false });
    expect(h.db.rows('chad_coach_settings')[0].weekly_checkin).toBe(false);
  });

  it('disabling is allowed for a user who is no longer eligible', async () => {
    settings.chad_checkin_rollout = 'admin';
    expect((await call({ action: 'settings', enabled: false })).statusCode).toBe(200);
  });
});

describe('action decide', () => {
  it('verifies the check-in is the caller\'s, then runs the decideCheckin Update on the caller\'s workflow', async () => {
    const res = await decide({ acceptIds: ['c1', 'c3'] });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ status: 'applied', applied: [{ id: 'c1', day: 'Monday' }], skipped: [], alreadyDecided: false });
    expect(h.client.workflow.getHandle).toHaveBeenCalledWith(`coach-${UID}`);
    expect(h.handle.executeUpdate).toHaveBeenCalledWith('decideCheckin', { args: [{ checkinId: CID, acceptIds: ['c1', 'c3'] }] });
  });

  it('puts about a 15 second deadline on the Update', async () => {
    const before = Date.now();
    await decide();
    const deadline = h.client.connection.withDeadline.mock.calls[0][0];
    expect(deadline - before).toBeGreaterThan(14_000);
    expect(deadline - before).toBeLessThanOrEqual(15_500);
  });

  it('404 and no Update for a check-in that belongs to someone else', async () => {
    h.db = seed({ chad_checkins: [{ id: CID, user_id: OTHER, status: 'pending' }] });
    const res = await decide();
    expect(res.statusCode).toBe(404);
    expect(h.handle.executeUpdate).not.toHaveBeenCalled();
    expect(h.client.workflow.getHandle).not.toHaveBeenCalled();
  });

  it('404 for an id that does not exist', async () => {
    h.db = seed({ chad_checkins: [] });
    expect((await decide()).statusCode).toBe(404);
    expect(h.handle.executeUpdate).not.toHaveBeenCalled();
  });

  it('a missed deadline or no worker is a friendly 503', async () => {
    h.handle.executeUpdate = vi.fn(async () => { throw new WorkflowUpdateRPCTimeoutOrCancelledError('Workflow update call timeout or cancelled'); });
    const res = await decide();
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe("Chad's offline right now. Try again in a bit.");
  });

  it('a gRPC deadline error and a server that is down are the same offline 503', async () => {
    const grpc = (code) => Object.assign(new Error('rpc failed'), { code, details: 'x', metadata: {} });
    for (const code of [4, 14]) {
      h.handle.executeUpdate = vi.fn(async () => { throw grpc(code); });
      const res = await decide();
      expect(res.statusCode, String(code)).toBe(503);
      expect(res.body.error).toBe("Chad's offline right now. Try again in a bit.");
    }
  });

  it('answers 503 when nothing comes back at all, using the backstop timer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    h.client.connection.withDeadline = vi.fn(() => new Promise(() => {}));
    const pending = decide();
    await vi.advanceTimersByTimeAsync(17_100);
    const res = await pending;
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe("Chad's offline right now. Try again in a bit.");
  });

  it('an Update the workflow\'s validator refused is a 409', async () => {
    h.handle.executeUpdate = vi.fn(async () => {
      throw new WorkflowUpdateFailedError('Update failed', ApplicationFailure.nonRetryable('That check-in is closed.', 'Stale'));
    });
    const res = await decide();
    expect(res.statusCode).toBe(409);
    expect(res.body.error).not.toContain('That check-in is closed.'); // the workflow's wording is not passed through
  });

  it('a permanent refusal that came up through an activity failure is a 409, or a 403 for not eligible', async () => {
    const viaActivity = (type) => {
      const activity = Object.assign(new Error('Activity task failed'), { cause: ApplicationFailure.nonRetryable('worker said no', type) });
      return new WorkflowUpdateFailedError('Update failed', activity);
    };
    for (const type of ['Conflict', 'BadRequest', 'NotFound']) {
      h.handle.executeUpdate = vi.fn(async () => { throw viaActivity(type); });
      const res = await decide();
      expect(res.statusCode, type).toBe(409);
      expect(JSON.stringify(res.body)).not.toContain('worker said no');
    }
    h.handle.executeUpdate = vi.fn(async () => { throw viaActivity('NotEligible'); });
    expect((await decide()).statusCode).toBe(403);
    // An activity that gave up on a temporary error stays a temporary 503.
    h.handle.executeUpdate = vi.fn(async () => { throw viaActivity('ServiceUnavailable'); });
    expect((await decide()).statusCode).toBe(503);
  });

  it('an Update that failed on the way (an activity gave up) is a 503, not a 409', async () => {
    const cause = new Error('Activity task failed'); // anything that is not an ApplicationFailure
    h.handle.executeUpdate = vi.fn(async () => { throw new WorkflowUpdateFailedError('Update failed', cause); });
    const res = await decide();
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('Chad hit a snag. Try again in a minute.');
  });

  it('a missing workflow is a 409 (nothing is tracking that check-in), and an unknown error is a plain 503', async () => {
    h.handle.executeUpdate = vi.fn(async () => { throw new WorkflowNotFoundError('workflow not found', `coach-${UID}`, undefined); });
    expect((await decide()).statusCode).toBe(409);

    h.handle.executeUpdate = vi.fn(async () => { throw new Error('internal detail sk-secret-123'); });
    const res = await decide();
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('sk-secret');
  });

  it('503 when the client cannot connect', async () => {
    h.connectError = new Error('ECONNREFUSED');
    const res = await decide();
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
  });

  it('a decline (no ids) goes through as an Update too', async () => {
    await decide({ acceptIds: [] });
    expect(h.handle.executeUpdate).toHaveBeenCalledWith('decideCheckin', { args: [{ checkinId: CID, acceptIds: [] }] });
  });
});

describe('action missed', () => {
  it('verifies the offer is the caller\'s and runs answerMissedDay', async () => {
    h.handle.executeUpdate = vi.fn(async () => ({ status: 'accepted', fromDay: 'Tuesday', toDay: 'Thursday' }));
    const res = await call({ action: 'missed', offerId: OID, accept: true });
    expect(res.body).toEqual({ status: 'accepted', fromDay: 'Tuesday', toDay: 'Thursday' });
    expect(h.handle.executeUpdate).toHaveBeenCalledWith('answerMissedDay', { args: [{ offerId: OID, accept: true }] });
  });

  it('404 for another user\'s offer, 409 on a validator rejection, 503 when offline', async () => {
    h.db = seed({ chad_missed_offers: [{ id: OID, user_id: OTHER, status: 'pending' }] });
    expect((await call({ action: 'missed', offerId: OID, accept: true })).statusCode).toBe(404);
    expect(h.handle.executeUpdate).not.toHaveBeenCalled();

    h.db = seed();
    h.handle.executeUpdate = vi.fn(async () => { throw new WorkflowUpdateFailedError('x', ApplicationFailure.nonRetryable('closed')); });
    expect((await call({ action: 'missed', offerId: OID, accept: false })).statusCode).toBe(409);
    h.handle.executeUpdate = vi.fn(async () => { throw new WorkflowUpdateRPCTimeoutOrCancelledError('t'); });
    expect((await call({ action: 'missed', offerId: OID, accept: false })).statusCode).toBe(503);
  });
});

describe('action event', () => {
  it('signals dayMissed on the user\'s workflow and answers 202', async () => {
    const res = await call({ action: 'event', type: 'day_missed', week: 2, day: 'Tuesday' });
    expect(res).toMatchObject({ statusCode: 202, body: { queued: true } });
    expect(h.client.workflow.getHandle).toHaveBeenCalledWith(`coach-${UID}`);
    expect(h.handle.signal).toHaveBeenCalledWith('dayMissed', { week: 2, day: 'Tuesday' });
  });

  it('202 queued: false when the user has no workflow, 503 when Temporal fails', async () => {
    h.handle.signal = vi.fn(async () => { throw new WorkflowNotFoundError('nf', `coach-${UID}`, undefined); });
    const none = await call({ action: 'event', type: 'day_missed', week: 2, day: 'Tuesday' });
    expect(none).toMatchObject({ statusCode: 202, body: { queued: false } });

    h.handle.signal = vi.fn(async () => { throw new Error('boom'); });
    expect((await call({ action: 'event', type: 'day_missed', week: 2, day: 'Tuesday' })).statusCode).toBe(503);
  });
});
