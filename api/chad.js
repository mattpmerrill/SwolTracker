// Chad, the in-app coach. POST /api/chad
//   { type: 'message', message, history }  -> run the agent
//   { type: 'decision', approve, state }   -> resume a run that paused for approval
// Same trust model as api/mcp.js: verify the Supabase JWT, then run tools through a
// service-role client bound to that verified user id (the service role bypasses RLS, so the
// binding in buildToolKit is the authorization layer).

import { createClient } from '@supabase/supabase-js';
import { InputGuardrailTripwireTriggered, MaxTurnsExceededError, RunState, assistant, user as userMessage } from '@openai/agents';
import { buildToolKit } from '../mcp/dist/mcp/src/sdk-adapter.js';
import { setCorsHeaders } from './_mcp-shared.js';
import { captureException, initSentry } from './_sentry.js';
import { createChad, createRunner, updateProgramDayArgsSchema } from './_chad-agent.js';
import { RED_FLAG_REPLY, chatRequestSchema, dropDanglingToolCalls, resolveChadModel, sanitizeHistory } from './_chad-core.js';

const CHAD_DAILY_LIMIT = 30; // per user per day, counted separately for messages and decisions
const MAX_TURNS = 8;
// Below the 60 s maxDuration in vercel.json so we answer politely instead of being killed mid-write.
const RUN_TIMEOUT_MS = 50_000;

initSentry();

const FRIENDLY_500 = 'Chad hit a snag. Try again in a minute.';
const NO_KEY = 'Chad is off the clock right now. Try again later.';
const TANGLED = 'I got tangled up on that one. Try asking it a simpler way.';
const TOO_SLOW = 'That took too long. Try again.';
const LOST_THREAD = 'Saved it, but I lost my train of thought. Your workout is updated.';
const BAD_EDIT = "I put together an edit, but it didn't pass the checks, so nothing was saved. Want me to try again?";

function lastAssistantText(result) {
  const items = result.newItems ?? [];
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i].type !== 'message_output_item') continue;
    const text = (items[i].rawItem?.content ?? [])
      .map((part) => (part?.type === 'output_text' ? part.text : ''))
      .join('')
      .trim();
    if (text) return text;
  }
  return '';
}

// "before" comes from the database, never from the model, so the card shows what is really
// saved today. A missing "before" (e.g. a not-yet-created week) just hides that half of the card.
async function buildProposal(kit, interruption) {
  if (interruption.name !== 'update_program_day') return null;
  let raw;
  try {
    raw = JSON.parse(interruption.arguments ?? '');
  } catch {
    return null;
  }
  const parsed = updateProgramDayArgsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { week, day, summary, day_data } = parsed.data;
  let before = null;
  try {
    const current = await kit.queries.get_program_day(week, day);
    if (current.success) before = current.data?.day ?? null;
  } catch {
    // The card still works without a "before".
  }
  return { week, day, summary, before, after: day_data };
}

// A resumed run carries the usage of the run before it, so decisions subtract what the state
// already held. Otherwise the first half of the conversation would be billed twice.
function newUsage(result, baseline) {
  const usage = result?.state?.usage;
  return {
    prompt: Math.max(0, (usage?.inputTokens ?? 0) - baseline.prompt),
    completion: Math.max(0, (usage?.outputTokens ?? 0) - baseline.completion),
  };
}

// Usage logging must never break a reply.
async function logUsage(supabase, { userId, model, result, baseline = { prompt: 0, completion: 0 }, success, errorMessage = null }) {
  try {
    const usage = newUsage(result, baseline);
    const { error } = await supabase.rpc('log_api_usage', {
      p_user_id: userId,
      p_request_type: 'chad',
      p_model: model,
      p_prompt_tokens: result ? usage.prompt : null,
      p_completion_tokens: result ? usage.completion : null,
      p_success: success,
      p_error_message: errorMessage,
    });
    if (error) console.error('log_api_usage failed:', error.message);
  } catch (error) {
    console.error('log_api_usage failed:', error?.message);
  }
}

async function limited(supabase, userId, operation) {
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_user_id: userId,
    p_operation: operation,
    p_max_requests: CHAD_DAILY_LIMIT,
    p_window_minutes: 1440,
  });
  return allowed === false;
}

export default async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let supabase = null;
  let user = null;
  let model = null;
  // Hoisted so the failure paths can still report a write that already happened.
  let changed = false;
  let state = null;

  try {
    const parsedBody = chatRequestSchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ error: 'That request looked off. Try again.' });
    const request = parsedBody.data;

    if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: NO_KEY });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ error: FRIENDLY_500 });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Authorization header.' });

    supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authResult = await supabase.auth.getUser(authHeader.slice(7));
    user = authResult.data?.user;
    if (authResult.error || !user) return res.status(401).json({ error: 'Invalid or expired token.' });

    // Messages and decisions each get the daily budget. A decision costs a model call too, so it
    // is limited on its own counter: approving or declining never eats into the message budget.
    const operation = request.type === 'message' ? 'chad_message' : 'chad_decision';
    if (await limited(supabase, user.id, operation)) {
      return res.status(429).json({ error: `Chad needs a rest day. You've hit ${CHAD_DAILY_LIMIT} ${request.type === 'message' ? 'messages' : 'confirmations'} today, come back tomorrow.` });
    }

    // The only source of identity for every tool below.
    const kit = buildToolKit(supabase, user.id);

    let contextBundle = {};
    try {
      const bundle = await kit.context.get_context_bundle();
      if (bundle?.success) contextBundle = bundle.data ?? {};
    } catch (error) {
      console.error('Chad context bundle failed:', error?.name || 'Error');
    }

    const { data: modelSetting } = await supabase.rpc('get_app_setting', { p_key: 'chad_model' });
    model = resolveChadModel(modelSetting);

    const agent = createChad({ kit, contextBundle, model, onProgramWritten: () => { changed = true; } });
    const runner = createRunner();
    const signal = AbortSignal.timeout(RUN_TIMEOUT_MS);

    // For the guardrail path we need the same input a message run would have used.
    const priorHistory = request.type === 'message' ? sanitizeHistory(request.history) : [];
    const messageInput = request.type === 'message' ? [...priorHistory, userMessage(request.message)] : null;
    const baseline = { prompt: 0, completion: 0 };

    // Used by every "the run did not finish" path: keep what the user can still use.
    const unfinished = (reply) => ({
      reply,
      history: state ? dropDanglingToolCalls(state.history) : priorHistory,
      pending: null,
      changed,
    });

    let result;
    try {
      if (request.type === 'message') {
        result = await runner.run(agent, messageInput, { maxTurns: MAX_TURNS, signal });
      } else {
        try {
          state = await RunState.fromString(agent, request.state);
        } catch {
          return res.status(400).json({ error: 'That change expired. Ask Chad again.' });
        }
        const [pendingItem, ...extra] = state.getInterruptions();
        if (!pendingItem) return res.status(400).json({ error: 'There is nothing waiting for approval.' });
        baseline.prompt = state.usage?.inputTokens ?? 0;
        baseline.completion = state.usage?.outputTokens ?? 0;
        // The user only saw the first change, so only it can be approved. Anything else the
        // model queued is declined and it has to propose again.
        if (request.approve) state.approve(pendingItem);
        else state.reject(pendingItem, { message: 'The user said no. Do not apply this change.' });
        for (const item of extra) state.reject(item, { message: 'Only one change at a time. Propose it again.' });
        result = await runner.run(agent, state, { maxTurns: MAX_TURNS, signal });
      }
    } catch (error) {
      if (error instanceof InputGuardrailTripwireTriggered) {
        // The model was never called. Keep the exchange in history so later turns have context.
        const history = sanitizeHistory([...messageInput, assistant(RED_FLAG_REPLY)]);
        return res.status(200).json({ reply: RED_FLAG_REPLY, history, pending: null, changed: false });
      }
      if (signal.aborted) {
        await logUsage(supabase, { userId: user.id, model, result: null, success: false, errorMessage: 'timeout' });
        return res.status(200).json(unfinished(changed ? LOST_THREAD : TOO_SLOW));
      }
      if (error instanceof MaxTurnsExceededError) {
        await logUsage(supabase, { userId: user.id, model, result: null, success: false, errorMessage: 'max_turns' });
        return res.status(200).json(unfinished(changed ? LOST_THREAD : TANGLED));
      }
      throw error;
    }

    await logUsage(supabase, { userId: user.id, model, result, baseline, success: true });

    const [firstInterruption] = result.interruptions ?? [];
    if (firstInterruption) {
      // The paused tool call travels in `state`. It is removed from `history` (never the
      // window cut) so a user who types instead of tapping can still send it to a provider.
      const history = dropDanglingToolCalls(result.history);
      const proposal = await buildProposal(kit, firstInterruption);
      if (!proposal) {
        return res.status(200).json({ reply: BAD_EDIT, history, pending: null, changed });
      }
      return res.status(200).json({
        reply: lastAssistantText(result) || "Here's the change. Apply it?",
        history,
        pending: { state: result.state.toString(), proposal },
        // A resumed run can save one edit and immediately propose the next.
        changed,
      });
    }

    const history = sanitizeHistory(result.history);
    const reply = (typeof result.finalOutput === 'string' ? result.finalOutput : '').trim()
      || (changed ? 'Done. Your workout is updated.' : 'Got it.');
    return res.status(200).json({ reply, history, pending: null, changed });
  } catch (error) {
    // Provider and database errors can carry request details, so they stay in Sentry only.
    console.error('Chad error:', error?.name || 'Error');
    captureException(error, { tags: { endpoint: 'chad' } });
    if (supabase && user) {
      await logUsage(supabase, { userId: user.id, model, result: null, success: false, errorMessage: (error?.name || 'error').slice(0, 100) });
    }
    // The provider can fail after the write went through. Say so instead of a 500, or the
    // user would retry an edit that is already saved.
    if (changed) {
      return res.status(200).json({ reply: LOST_THREAD, history: state ? dropDanglingToolCalls(state.history) : [], pending: null, changed: true });
    }
    return res.status(500).json({ error: FRIENDLY_500 });
  }
}
