// The two check-in additions to POST /api/chad: the pending proposal in Chad's context, and the
// best-effort metering rows in chad_events. The rest of the endpoint is covered by chad.test.js.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ db: null, kit: null, provider: null, calls: [], script: null }));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.db.client }));
vi.mock('../mcp/dist/mcp/src/sdk-adapter.js', () => ({ buildToolKit: () => h.kit }));
vi.mock('./_chad-agent.js', async (importOriginal) => {
  const actual = await importOriginal();
  const { Runner } = await import('@openai/agents');
  return { ...actual, createRunner: () => new Runner({ modelProvider: h.provider, tracingDisabled: true }) };
});

import { Usage } from '@openai/agents';
import handler from './chad.js';
import { createFakeSupabase } from './_fake-supabase.js';

const UID = '3f2b7a52-5d0a-4f3e-9c11-0a6f6a0e8a11';
const OTHER = '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f';

const DAY = { focus: 'Push', exercises: [{ name: 'DB Bench Press', sets: 4, reps: '8' }] };
const textItem = (text) => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text }] });
const updateCall = () => ({
  type: 'function_call', callId: 'call_1', name: 'update_program_day', status: 'completed',
  arguments: JSON.stringify({ week: 3, day: 'Thursday', day_data: DAY, summary: 'Swap bench.' }),
});

let prices;

function seed(extra = {}) {
  return createFakeSupabase(extra, {
    auth: (token) => (token === 'good-token' ? UID : null),
    rpc: {
      check_rate_limit: () => true,
      get_app_setting: ({ p_key }) => (p_key === 'chad_price_per_mtok' ? prices : null),
    },
  });
}

async function call(body) {
  const res = {
    statusCode: 200, body: undefined,
    setHeader() {}, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; },
  };
  await handler({ method: 'POST', body, headers: { authorization: 'Bearer good-token' } }, res);
  return res;
}

const pendingRow = (extra = {}) => ({
  id: 'ck-1', user_id: UID, status: 'pending', target_week: 4, created_at: '2026-03-09T00:00:00.000Z',
  expires_at: '2999-01-01T00:00:00.000Z',
  recap: { headline: 'Solid week', wins: ['Bench moved'], watch: ['Skipped Thursday'] },
  changes: [{ id: 'c1', day: 'Monday', summary: 'Bench up five pounds', reason: 'Three clean sessions.', before: { exercises: [{ name: 'SECRET-BEFORE' }] }, after: { exercises: [{ name: 'SECRET-AFTER' }] } }],
  ...extra,
});

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = 'test-key-not-real';
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-not-real';
  prices = '{"input":3,"output":15}';
  h.db = seed();
  h.calls = [];
  h.script = () => [textItem('Squats are up, bro.')];
  h.kit = {
    queries: { get_program_day: vi.fn(async () => ({ success: true, message: '', data: { day: DAY } })) },
    actions: { update_program_day: vi.fn(async () => ({ success: true, message: 'saved', data: {} })) },
    context: { get_context_bundle: vi.fn(async () => ({ success: true, message: '{}', data: { today: 'Thursday' } })) },
  };
  h.provider = {
    getModel: async (name) => ({
      name,
      async getResponse(request) {
        h.calls.push({ model: name, request });
        return {
          usage: new Usage({ requests: 1, inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
          output: h.script(request),
          responseId: `resp_${h.calls.length}`,
        };
      },
      // eslint-disable-next-line require-yield
      async *getStreamedResponse() { throw new Error('streaming is not used'); },
    }),
  };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('the pending check-in in Chad\'s context', () => {
  it('shows him the newest pending proposal, compactly', async () => {
    h.db = seed({ chad_checkins: [pendingRow({ id: 'old', target_week: 3, created_at: '2026-03-02T00:00:00.000Z', recap: { headline: 'Old one' } }), pendingRow()] });
    await call({ type: 'message', message: 'Tell me about the changes', history: [] });

    const instructions = h.calls[0].request.systemInstructions;
    expect(instructions).toContain('"pending_weekly_checkin"');
    expect(instructions).toContain('Solid week');
    expect(instructions).toContain('Bench up five pounds');
    expect(instructions).toContain('Three clean sessions.');
    expect(instructions).toContain('"for_week":4');
    expect(instructions).not.toContain('Old one');
    // Before and after stay on the card; the prompt gets the summary only.
    expect(instructions).not.toContain('SECRET-BEFORE');
    expect(instructions).not.toContain('SECRET-AFTER');
    // The rest of the bundle is still there.
    expect(instructions).toContain('"today":"Thursday"');
  });

  it('leaves it out when nothing is pending, it is decided or expired, or it is someone else\'s', async () => {
    h.db = seed({
      chad_checkins: [
        pendingRow({ id: 'a', status: 'applied' }),
        pendingRow({ id: 'b', target_week: 5, expires_at: '2020-01-01T00:00:00.000Z' }),
        pendingRow({ id: 'c', target_week: 6, user_id: OTHER }),
      ],
    });
    await call({ type: 'message', message: 'hi', history: [] });
    expect(h.calls[0].request.systemInstructions).not.toContain('pending_weekly_checkin');
  });

  it('chat still works when the table does not exist yet', async () => {
    h.db = seed();
    h.db.fail('chad_checkins.select');
    const res = await call({ type: 'message', message: 'hi', history: [] });
    expect(res.statusCode).toBe(200);
    expect(h.calls[0].request.systemInstructions).not.toContain('pending_weekly_checkin');
  });
});

describe('chad_events metering', () => {
  const rows = () => h.db.rows('chad_events');

  it('a chat message is one run: run.started, then completed with tokens and cost', async () => {
    const res = await call({ type: 'message', message: 'how are my squats?', history: [] });

    expect(res.statusCode).toBe(200);
    expect(rows().map((r) => r.event)).toEqual(['run.started', 'completed']);
    for (const r of rows()) {
      expect(r).toMatchObject({ user_id: UID, instigation: 'user_message', workflow_id: null, run_id: null, checkin_id: null, attempt: 1, model: expect.any(String) });
    }
    expect(rows()[0]).toMatchObject({ prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 });
    // 10 in at $3/M and 5 out at $15/M.
    expect(rows()[1]).toMatchObject({ prompt_tokens: 10, completion_tokens: 5, cost_usd: 0.000105, model: 'anthropic/claude-sonnet-5.5', step: 'chat' });
  });

  it('missing or broken prices meter the tokens at zero cost and say so', async () => {
    prices = null;
    await call({ type: 'message', message: 'hi', history: [] });
    expect(rows()[1]).toMatchObject({ prompt_tokens: 10, completion_tokens: 5, cost_usd: 0, metadata: { price_missing: true } });
  });

  it('a failed run is run.started then step.failed, with no tokens', async () => {
    h.script = () => { throw new Error('upstream exploded'); };
    const res = await call({ type: 'message', message: 'hi', history: [] });
    expect(res.statusCode).toBe(500);
    expect(rows().map((r) => r.event)).toEqual(['run.started', 'step.failed']);
    expect(rows()[1]).toMatchObject({ prompt_tokens: 0, completion_tokens: 0 });
  });

  it('a decision resumes the run: its own step and cost, no second run.started', async () => {
    h.script = (request) => {
      const input = Array.isArray(request.input) ? request.input : [];
      return input.some((item) => item.type === 'function_call_result') ? [textItem('Done.')] : [updateCall()];
    };
    const first = await call({ type: 'message', message: 'swap bench', history: [] });
    expect(rows().map((r) => r.event)).toEqual(['run.started', 'completed']);

    await call({ type: 'decision', approve: true, state: first.body.pending.state });
    expect(rows().map((r) => r.event)).toEqual(['run.started', 'completed', 'step.completed']);
    // Only the resumed half is billed, the same rule log_api_usage follows.
    expect(rows()[2]).toMatchObject({ step: 'decision', prompt_tokens: 10, completion_tokens: 5, cost_usd: 0.000105 });
    expect(rows().filter((r) => r.event === 'run.started')).toHaveLength(1);
  });

  it('never breaks a reply: a failing insert, or a missing table, still answers', async () => {
    h.db.fail('chad_events.insert', { code: '42P01', message: 'relation "chad_events" does not exist' });
    const res = await call({ type: 'message', message: 'hi', history: [] });
    expect(res.statusCode).toBe(200);
    expect(res.body.reply).toBe('Squats are up, bro.');
    // log_api_usage still ran.
    expect(h.db.writes('rpc', 'log_api_usage')).toHaveLength(1);
  });
});
