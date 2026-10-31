// Chad's weekly check-in, the browser's door (ADR-006). POST /api/checkin
//   { action: 'status' }                              -> eligibility and the switch
//   { action: 'settings', enabled }                   -> turn the weekly check-in on or off
//   { action: 'decide', checkinId, acceptIds }        -> apply the ticked changes (a Temporal Update)
//   { action: 'missed', offerId, accept }             -> move a missed workout or skip it (an Update)
//   { action: 'event', type: 'day_missed', week, day } -> the user marked a day missed (a Signal)
// This endpoint is a Temporal client. The check-in card itself reads Supabase through RLS, so the app
// keeps working while the worker is off. The request and response shapes are in
// shared/checkin-contract.ts. Same trust model as api/chad.js: verify the Supabase JWT, and take the
// user id only from it, never from the body.

import { createClient } from '@supabase/supabase-js';
import {
  SIGNAL_DAY_MISSED,
  SIGNAL_SET_ENABLED,
  TASK_QUEUE,
  UPDATE_ANSWER_MISSED_DAY,
  UPDATE_DECIDE_CHECKIN,
  WORKFLOW_TYPE,
  workflowIdFor,
} from '../mcp/dist/shared/checkin-contract.js';
import { setCorsHeaders } from './_mcp-shared.js';
import { captureException, initSentry } from './_sentry.js';
import { checkinRequestSchema } from './_checkin-core.js';
import { loadEligibility } from './_checkin-db.js';
import { classifyTemporalError, getTemporalClient, isTemporalConfigured, withTemporalDeadline } from './_temporal.js';

const CHECKIN_DAILY_LIMIT = 30;
// Updates need a live worker. Below the 30 s maxDuration in vercel.json, so we answer politely
// instead of being killed.
const UPDATE_DEADLINE_MS = 15_000;
const SIGNAL_DEADLINE_MS = 8_000;

initSentry();

const OFF = 'Check-ins are off right now.';
const OFFLINE = "Chad's offline right now. Try again in a bit.";
const SNAG = 'Chad hit a snag. Try again in a minute.';
const STALE = 'That one already changed. Pull it up again and take another look.';
const NOT_YOURS = "Chad can't change that program for you.";
const CLOSED = "That check-in isn't open anymore.";

const INELIGIBLE_COPY = {
  rollout: "Weekly check-ins aren't open to everyone yet.",
  group_member: 'Only your program owner can use check-ins.',
  no_gym: 'Set up your program first, then Chad can check in on it.',
};

async function limited(supabase, userId) {
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_user_id: userId,
    p_operation: 'checkin_action',
    p_max_requests: CHECKIN_DAILY_LIMIT,
    p_window_minutes: 1440,
  });
  return allowed === false;
}

function updateFailure(res, error) {
  const kind = classifyTemporalError(error);
  if (kind === 'rejected') return res.status(409).json({ error: STALE });
  if (kind === 'ineligible') return res.status(403).json({ error: NOT_YOURS });
  if (kind === 'not_found') return res.status(409).json({ error: CLOSED });
  if (kind === 'offline') return res.status(503).json({ error: OFFLINE });
  console.error('Check-in update error:', error?.name || 'Error');
  captureException(error, { tags: { endpoint: 'checkin', stage: 'update' } });
  return res.status(503).json({ error: SNAG });
}

const SELF_HEAL_WAIT_MS = 1500;
const DESCRIBE_DEADLINE_MS = 1000;

// Signal-with-start: attaches to the user's running workflow, or starts one if there is none.
async function startWorkflow(userId) {
  const client = await getTemporalClient();
  await withTemporalDeadline(client, SIGNAL_DEADLINE_MS, () =>
    client.workflow.signalWithStart(WORKFLOW_TYPE, {
      workflowId: workflowIdFor(userId),
      taskQueue: TASK_QUEUE,
      args: [{ userId }],
      signal: SIGNAL_SET_ENABLED,
      signalArgs: [true],
      workflowIdConflictPolicy: 'USE_EXISTING',
    }),
  );
}

// Only starts a workflow that is missing or finished. Describing first keeps every status poll from
// appending a setEnabled(true) signal to a healthy workflow's history. If describe itself fails we
// leave things alone: guessing "not running" would be the noisy choice.
async function ensureWorkflow(userId) {
  try {
    const client = await getTemporalClient();
    let running;
    try {
      const description = await withTemporalDeadline(client, DESCRIBE_DEADLINE_MS, () =>
        client.workflow.getHandle(workflowIdFor(userId)).describe(),
      );
      running = description?.status?.name === 'RUNNING';
    } catch (error) {
      if (classifyTemporalError(error) !== 'not_found') throw error;
      running = false;
    }
    if (!running) await startWorkflow(userId);
  } catch (error) {
    console.error('Check-in self-heal failed:', error?.name || 'Error');
  }
}

async function ownsRow(supabase, table, id, userId) {
  const { data, error } = await supabase.from(table).select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export default async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const parsedBody = checkinRequestSchema.safeParse(req.body);
    if (!parsedBody.success) return res.status(400).json({ error: 'That request looked off. Try again.' });
    const request = parsedBody.data;

    // Without Temporal there is nothing to start or ask, and the web app hides the switch on this 503.
    if (!isTemporalConfigured()) return res.status(503).json({ error: OFF });

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: SNAG });

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Authorization header.' });

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authResult = await supabase.auth.getUser(authHeader.slice(7));
    const user = authResult.data?.user;
    if (authResult.error || !user) return res.status(401).json({ error: 'Invalid or expired token.' });

    // Reading the switch is free; everything that touches Temporal or writes counts.
    if (request.action !== 'status' && (await limited(supabase, user.id))) {
      return res.status(429).json({ error: "Chad needs a rest day. That's a lot of check-in taps, come back tomorrow." });
    }

    // The only source of identity for everything below is the verified user id.
    const workflowId = workflowIdFor(user.id);

    if (request.action === 'status') {
      const e = await loadEligibility(supabase, user.id);
      // Self-heal: a user who is on and eligible must have a workflow. If it ended (a past stop, a
      // lost start), signal-with-start brings it back. Best effort, capped so a slow Temporal never
      // holds the answer, and it never changes the answer.
      if (e.enabled && e.reason === null) {
        let timer;
        await Promise.race([ensureWorkflow(user.id), new Promise((resolve) => { timer = setTimeout(resolve, SELF_HEAL_WAIT_MS); })]);
        clearTimeout(timer);
      }
      return res.status(200).json({ eligible: e.reason === null, ...(e.reason ? { reason: e.reason } : {}), enabled: e.enabled, configured: true });
    }

    if (request.action === 'settings') {
      const e = await loadEligibility(supabase, user.id);
      if (request.enabled && e.reason) return res.status(403).json({ error: INELIGIBLE_COPY[e.reason], reason: e.reason });

      // The row first: the workflow's first act is to ask the worker whether the switch is on.
      const save = (value) => supabase
        .from('chad_coach_settings')
        .upsert({ user_id: user.id, weekly_checkin: value, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      const { error: saveError } = await save(request.enabled);
      if (saveError) throw saveError;

      if (request.enabled) {
        try {
          await startWorkflow(user.id);
        } catch (error) {
          // Put the switch back so the screen does not say "on" for a workflow that never started.
          try {
            await save(e.enabled);
          } catch {
            // The next status read shows the truth either way.
          }
          console.error('Check-in start error:', error?.name || 'Error');
          captureException(error, { tags: { endpoint: 'checkin', stage: 'start' } });
          return res.status(503).json({ error: classifyTemporalError(error) === 'offline' ? OFFLINE : SNAG });
        }
        return res.status(200).json({ enabled: true });
      }

      // Off is already saved, and the worker refuses work for a switched-off user, so a failed
      // signal only means the workflow notices at its next wake-up instead of right now.
      try {
        const client = await getTemporalClient();
        await withTemporalDeadline(client, SIGNAL_DEADLINE_MS, () =>
          client.workflow.getHandle(workflowId).signal(SIGNAL_SET_ENABLED, false),
        );
      } catch (error) {
        if (classifyTemporalError(error) !== 'not_found') {
          console.error('Check-in stop error:', error?.name || 'Error');
          captureException(error, { tags: { endpoint: 'checkin', stage: 'stop' } });
        }
      }
      return res.status(200).json({ enabled: false });
    }

    if (request.action === 'event') {
      try {
        const client = await getTemporalClient();
        await withTemporalDeadline(client, SIGNAL_DEADLINE_MS, () =>
          client.workflow.getHandle(workflowId).signal(SIGNAL_DAY_MISSED, { week: request.week, day: request.day }),
        );
      } catch (error) {
        // No workflow means the user never turned check-ins on. Nothing to tell.
        if (classifyTemporalError(error) === 'not_found') return res.status(202).json({ queued: false });
        console.error('Check-in event error:', error?.name || 'Error');
        captureException(error, { tags: { endpoint: 'checkin', stage: 'event' } });
        return res.status(503).json({ error: classifyTemporalError(error) === 'offline' ? OFFLINE : SNAG });
      }
      return res.status(202).json({ queued: true });
    }

    // decide and missed: an Update, so the user gets the real result back or an honest "offline".
    const isDecide = request.action === 'decide';
    const table = isDecide ? 'chad_checkins' : 'chad_missed_offers';
    const id = isDecide ? request.checkinId : request.offerId;
    // The id comes from the body, so confirm it is the caller's before anything is sent to Temporal.
    if (!(await ownsRow(supabase, table, id, user.id))) {
      return res.status(404).json({ error: isDecide ? "I can't find that check-in." : "I can't find that offer." });
    }

    let client;
    try {
      client = await getTemporalClient();
    } catch (error) {
      console.error('Check-in connect error:', error?.name || 'Error');
      return res.status(503).json({ error: OFFLINE });
    }
    try {
      const handle = client.workflow.getHandle(workflowId);
      const result = await withTemporalDeadline(client, UPDATE_DEADLINE_MS, () =>
        isDecide
          ? handle.executeUpdate(UPDATE_DECIDE_CHECKIN, { args: [{ checkinId: request.checkinId, acceptIds: request.acceptIds }] })
          : handle.executeUpdate(UPDATE_ANSWER_MISSED_DAY, { args: [{ offerId: request.offerId, accept: request.accept }] }),
      );
      return res.status(200).json(result);
    } catch (error) {
      return updateFailure(res, error);
    }
  } catch (error) {
    // Database errors can carry request details, so they stay in Sentry only.
    console.error('Check-in error:', error?.name || 'Error');
    captureException(error, { tags: { endpoint: 'checkin' } });
    return res.status(500).json({ error: SNAG });
  }
}
