// The Temporal worker's door into the app (ADR-006). POST /api/checkin-worker
//   Authorization: Bearer ${CHECKIN_WORKER_SECRET}, body { op, userId, instigation, workflowId,
//   runId, attempt, ...opArgs }. The request and response shape of each op is in
//   shared/checkin-contract.ts.
//
// The worker only orchestrates; every database, model and push call happens here, with the Supabase
// service role bound to the user id in the body through buildToolKit (the same trust model as
// api/chad.js, except the caller is our own worker, authenticated by the secret, not a browser).
// Every op is idempotent per check-in or offer, so a retried activity cannot double-charge the
// model, double-apply a program edit or double-count a run. Status codes: 400 invalid, 403 not
// eligible, 404 unknown, 409 conflict, 503 upstream. The worker treats 4xx as non-retryable.

import { createHash, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { buildToolKit } from '../mcp/dist/mcp/src/sdk-adapter.js';
import { calculateCurrentWeek } from '../mcp/dist/shared/week-math.js';
import { DRAFT_MAX_ATTEMPTS, checkinLink, offerLink } from '../mcp/dist/shared/checkin-contract.js';
import { captureException, initSentry } from './_sentry.js';
import { configureWebPush, sendToSubscriptions } from './_push.js';
import { createRunner } from './_chad-agent.js';
import { resolveChadModel } from './_chad-core.js';
import { draftCheckin } from './_checkin-agent.js';
import {
  computeCheckinWindow,
  computeSchedule,
  costFor,
  endOfLocalDay,
  findSlideTarget,
  isRestDay,
  jsonEqual,
  localDayName,
  programEditsSchema,
  pushCopy,
  reviewTargetWeeks,
  storedChangeSchema,
  wasDayMissed,
  workerRequestSchema,
} from './_checkin-core.js';
import {
  DbError,
  checkinHandle,
  loadClock,
  loadEligibility,
  loadPrices,
  loadWeekProgram,
  must,
  offerSummary,
  recordEvent,
  recordEventOnce,
  resolveProgramGym,
} from './_checkin-db.js';

initSentry();

// Below the 120 s maxDuration in vercel.json, so a slow model is cut off by us, not by Vercel.
const DRAFT_TIMEOUT_MS = 90_000;
const APPLY_NOTE = 'Weekly check-in from Chad';
const MOVE_NOTE = 'Missed workout moved by Chad';
const REST_DAY = () => ({ focus: 'Rest Day', exercises: [] });

class OpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'OpError';
    this.status = status;
  }
}
const badRequest = (message) => new OpError(400, message);
const notEligible = (message) => new OpError(403, message);
const notFound = (message) => new OpError(404, message);
const conflict = (message) => new OpError(409, message);
const upstream = (message) => new OpError(503, message);

const INELIGIBLE_COPY = {
  disabled: 'The weekly check-in is switched off.',
  rollout: 'Weekly check-ins are not open to this user yet.',
  group_member: 'Only the program owner can use check-ins.',
  no_gym: 'This user owns no program to check in on.',
};

// The kit throws AppError for the cases a caller can act on. A refused or stale edit is a 4xx the
// worker must not retry; anything else is a retryable upstream failure.
function fromKitError(error) {
  if (error instanceof OpError) return error;
  if (error?.name === 'AppError' && typeof error.code === 'string') {
    if (error.code === 'forbidden') return notEligible(error.message);
    if (['invalid_args', 'conflict', 'not_found'].includes(error.code)) return conflict(error.message);
  }
  return error;
}

function secretMatches(header, secret) {
  // Hashing first makes both sides the same length, so the compare leaks neither content nor length.
  const digest = (value) => createHash('sha256').update(String(value ?? '')).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

// ---------------------------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------------------------

async function requireEligible(ctx) {
  const e = await loadEligibility(ctx.supabase, ctx.userId);
  const reason = !e.enabled ? 'disabled' : e.reason;
  if (reason) throw notEligible(INELIGIBLE_COPY[reason]);
  return { gymId: e.gymId };
}

async function loadCheckin(ctx, id) {
  const row = must(
    await ctx.supabase.from('chad_checkins').select('*').eq('id', id).eq('user_id', ctx.userId).maybeSingle(),
    'Reading the check-in',
  );
  if (!row) throw notFound('No such check-in.');
  return row;
}

async function loadOffer(ctx, id) {
  const row = must(
    await ctx.supabase.from('chad_missed_offers').select('*').eq('id', id).eq('user_id', ctx.userId).maybeSingle(),
    'Reading the offer',
  );
  if (!row) throw notFound('No such offer.');
  return row;
}

async function findCheckinByWeek(ctx, targetWeek) {
  return must(
    await ctx.supabase.from('chad_checkins').select('*').eq('user_id', ctx.userId).eq('target_week', targetWeek).maybeSingle(),
    'Reading the check-in',
  );
}

const nowIso = (ctx) => ctx.now.toISOString();
const clip = (value, max) => (typeof value === 'string' ? value.slice(0, max) : value);

// ---------------------------------------------------------------------------------------------
// schedule
// ---------------------------------------------------------------------------------------------

async function opSchedule(ctx) {
  const e = await loadEligibility(ctx.supabase, ctx.userId);
  const reason = !e.enabled ? 'disabled' : e.reason;
  if (reason) return { stop: true, reason };
  const clock = await loadClock(ctx.supabase, ctx.userId, ctx.now);
  return { stop: false, ...computeSchedule({ timeZone: clock.timeZone, now: ctx.now }) };
}

// ---------------------------------------------------------------------------------------------
// review
// ---------------------------------------------------------------------------------------------

// Numbers come out of aggregates over user-entered logs. Clamp them into the ranges the draft
// request accepts, so one odd set can never turn into a 400 at the next step.
const count = (v, max) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));
const amount = (v, max) => Math.min(max, Math.max(0, Number(v) || 0));

function buildReview(reviewWeek, history, overload) {
  const week = history.week_summaries?.[reviewWeek] ?? {};
  return {
    reviewWeek,
    scheduledDays: (week.scheduled_days ?? []).slice(0, 7),
    completedDays: [...new Set(week.completed_days ?? [])].slice(0, 7),
    missedDays: (week.missed_days ?? []).slice(0, 7).map((m) => ({ day: clip(m.day, 20), reason: clip(m.reason ?? null, 200) })),
    sessions: (week.exercise_sessions ?? []).slice(0, 60).map((s) => ({
      day: clip(s.day_name, 20),
      exercise: clip(s.exercise_name, 80),
      sets: count(s.sets_logged, 100),
      avgWeight: amount(s.avg_actual_weight || s.avg_prescribed_weight, 5000),
      avgReps: amount(s.avg_actual_reps, 1000),
      prescribedReps: s.prescribed_reps == null ? null : amount(s.prescribed_reps, 1000),
      outcome: clip(String(s.outcome ?? ''), 30),
    })),
    notes: (history.session_notes ?? [])
      .filter((n) => n.week_number === reviewWeek)
      .slice(0, 30)
      .map((n) => ({ day: clip(n.day_name, 20), label: clip(n.label ?? null, 80), text: clip(n.text ?? '', 600) })),
    recommendations: (overload?.recommendations ?? [])
      .filter((r) => ['increase', 'deload', 'stale'].includes(r.type))
      .slice(0, 20)
      .map((r) => ({
        exercise: clip(r.exercise_name, 80),
        type: r.type,
        message: clip(r.message, 300),
        ...(typeof r.suggested_increment === 'number' ? { increment: amount(r.suggested_increment, 100) } : {}),
      })),
  };
}

async function opReview(ctx, body) {
  const started = Date.now();
  const { gymId } = await requireEligible(ctx);
  const clock = await loadClock(ctx.supabase, ctx.userId, ctx.now);
  const anchor = new Date(body.scheduledFor);
  const { reviewWeek, targetWeek } = reviewTargetWeeks({ programStartDate: clock.programStartDate, anchor, timeZone: clock.timeZone });

  // One run per week, counted here whatever the outcome below. A retry finds the row and adds nothing.
  await recordEventOnce(ctx.supabase, ctx, 'run.started', { step: 'review' }, { kind: 'weekly', week: reviewWeek });

  const skip = async (reason) => {
    await recordEventOnce(ctx.supabase, ctx, 'completed', { step: 'review', metadata: { reason } }, { kind: 'weekly', week: reviewWeek, closed: true });
    return { skip: true, reason };
  };

  // Without a start date every date is "week 1", so there is no week that ended to look at.
  if (!clock.programStartDate) return skip('no_program');

  const { expiresAt } = computeCheckinWindow({ timeZone: clock.timeZone, anchor });
  if (new Date(expiresAt).getTime() <= ctx.now.getTime()) return skip('window_closed');
  if (!(await loadWeekProgram(ctx.supabase, gymId, targetWeek))) return skip('no_next_week');

  // The kit measures "this week" from the real clock. A review that runs late covers more weeks, and
  // only the week that ended is kept.
  const lookback = Math.max(1, clock.currentWeek - reviewWeek + 1);
  let history;
  let overload;
  try {
    [history, overload] = await Promise.all([
      ctx.kit.queries.get_training_history_summary(gymId, lookback),
      ctx.kit.queries.get_overload_recommendations(gymId, 4),
    ]);
  } catch (error) {
    throw fromKitError(error);
  }
  if (!history?.success) throw upstream('Could not read the training history.');

  const review = buildReview(reviewWeek, history.data ?? {}, overload?.success ? overload.data : null);
  await recordEvent(ctx.supabase, ctx, 'step.completed', { step: 'review', durationMs: Date.now() - started, metadata: { week: reviewWeek } });
  return { skip: false, reviewWeek, targetWeek, anchor: anchor.toISOString(), review };
}

// ---------------------------------------------------------------------------------------------
// draft
// ---------------------------------------------------------------------------------------------

async function insertDrafting(ctx, body, gymId) {
  const result = await ctx.supabase
    .from('chad_checkins')
    .insert({
      user_id: ctx.userId,
      gym_id: gymId,
      review_week: body.reviewWeek,
      target_week: body.targetWeek,
      status: 'drafting',
      workflow_id: ctx.workflowId,
    })
    .select()
    .single();
  // A concurrent attempt won the insert (unique user + target week): use its row.
  if (result.error?.code === '23505') return findCheckinByWeek(ctx, body.targetWeek);
  return must(result, 'Creating the check-in');
}

async function opDraft(ctx, body) {
  const { supabase, kit, userId } = ctx;
  const { gymId } = await requireEligible(ctx);

  // Idempotent on (user, target week): a pending or decided check-in is returned as it is, so a
  // retry never pays for the model twice. Only a half-written 'drafting' row is drafted again.
  const existing = await findCheckinByWeek(ctx, body.targetWeek);
  if (existing && existing.status !== 'drafting') return { checkin: checkinHandle(existing), reused: true };

  const program = await loadWeekProgram(supabase, gymId, body.targetWeek);
  if (!program) throw conflict('There is no program for that week to change.');

  const row = existing ?? (await insertDrafting(ctx, body, gymId));
  if (row.status !== 'drafting') return { checkin: checkinHandle(row), reused: true };

  const clock = await loadClock(supabase, userId, ctx.now);
  const window = computeCheckinWindow({ timeZone: clock.timeZone, anchor: new Date(body.anchor) });
  const { data: modelSetting } = await supabase.rpc('get_app_setting', { p_key: 'chad_model' });
  const model = resolveChadModel(modelSetting);
  const prices = await loadPrices(supabase);

  const started = Date.now();
  let drafted;
  try {
    const [maxesResult, equipmentRows] = await Promise.all([
      kit.queries.get_maxes(),
      supabase.from('gym_equipment').select('name').eq('gym_id', gymId),
    ]);
    drafted = await draftCheckin({
      runner: createRunner(),
      model,
      review: body.review,
      targetWeek: body.targetWeek,
      program,
      maxes: maxesResult?.data?.maxes ?? {},
      equipment: (equipmentRows.data ?? []).map((e) => e.name).filter(Boolean).slice(0, 60),
      signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
    });
  } catch (error) {
    await recordEvent(supabase, ctx, 'step.failed', {
      step: 'draft',
      checkinId: row.id,
      model,
      durationMs: Date.now() - started,
      metadata: { error: String(error?.name || 'Error').slice(0, 60) },
    });
    // The workflow gives up after the last attempt; leave a record that says so rather than a
    // 'drafting' row nobody will finish.
    if (ctx.attempt >= DRAFT_MAX_ATTEMPTS) {
      await supabase.from('chad_checkins').update({ status: 'failed', updated_at: nowIso(ctx) }).eq('id', row.id).eq('status', 'drafting');
    }
    throw error instanceof OpError ? error : Object.assign(upstream('The model step failed.'), { cause: error });
  }

  const updated = must(
    await supabase
      .from('chad_checkins')
      .update({
        status: 'pending',
        recap: drafted.recap,
        changes: drafted.changes,
        reminder_at: window.reminderAt,
        expires_at: window.expiresAt,
        workflow_id: ctx.workflowId,
        updated_at: nowIso(ctx),
      })
      .eq('id', row.id)
      .eq('status', 'drafting')
      .select(),
    'Saving the check-in',
  );

  const costUsd = costFor(drafted.usage, prices);
  await recordEvent(supabase, ctx, 'step.completed', {
    step: 'draft',
    checkinId: row.id,
    model: drafted.redFlag ? null : model,
    promptTokens: drafted.usage.promptTokens,
    completionTokens: drafted.usage.completionTokens,
    costUsd,
    durationMs: Date.now() - started,
    metadata: { changes: drafted.changes.length, red_flag: Boolean(drafted.redFlag), ...(prices.valid ? {} : { price_missing: true }) },
  });

  // Someone else finished it between the read and the write: theirs stands.
  if (!updated?.length) return { checkin: checkinHandle(await loadCheckin(ctx, row.id)), reused: true };
  return { checkin: checkinHandle(updated[0]), reused: false };
}

// ---------------------------------------------------------------------------------------------
// notify
// ---------------------------------------------------------------------------------------------

async function pushTo(ctx, payload) {
  const subs = must(
    await ctx.supabase.from('push_subscriptions').select('endpoint, keys').eq('user_id', ctx.userId),
    'Reading push subscriptions',
  );
  if (!subs?.length) return { sent: 0, skipped: 'no_subscriptions' };
  if (!configureWebPush()) {
    console.error('Check-in push skipped: VAPID is not configured.');
    return { sent: 0, skipped: 'push_not_configured' };
  }
  const sent = await sendToSubscriptions(ctx.supabase, subs, payload);
  return sent > 0 ? { sent } : { sent: 0, skipped: 'delivery_failed' };
}

async function opNotify(ctx, body) {
  const started = Date.now();

  if (body.kind === 'missed') {
    const offer = await loadOffer(ctx, body.offerId);
    if (offer.status !== 'pending' || (offer.expires_at && new Date(offer.expires_at) <= ctx.now)) {
      return { sent: 0, skipped: 'not_open' };
    }
    if (offer.notified_at) return { sent: 0, skipped: 'already_notified' };
    const result = await pushTo(ctx, {
      ...pushCopy('missed', { fromDay: offer.from_day, toDay: offer.to_day }),
      url: offerLink(offer.id),
    });
    if (result.sent > 0) {
      must(await ctx.supabase.from('chad_missed_offers').update({ notified_at: nowIso(ctx), updated_at: nowIso(ctx) }).eq('id', offer.id).eq('user_id', ctx.userId), 'Saving the notification');
    }
    await recordEvent(ctx.supabase, ctx, 'step.completed', { step: 'notify', durationMs: Date.now() - started, metadata: { kind: 'missed', sent: result.sent } });
    return result;
  }

  const checkin = await loadCheckin(ctx, body.checkinId);
  const isReady = body.kind === 'ready';
  if (checkin.status !== 'pending' || (checkin.expires_at && new Date(checkin.expires_at) <= ctx.now)) {
    return { sent: 0, skipped: 'not_open' };
  }

  if (isReady) {
    // The check-in is now waiting on the user whether or not a push goes out. Counted once.
    await recordEventOnce(ctx.supabase, ctx, 'waiting_on_human', { step: 'notify', checkinId: checkin.id }, { checkin: checkin.id });
  }
  if (isReady ? checkin.notified_at : checkin.reminded_at) return { sent: 0, skipped: 'already_notified' };
  // Nothing to decide (a quiet week, or the serious recap): the first push said so; no nagging.
  if (!isReady && (checkin.changes ?? []).length === 0) return { sent: 0, skipped: 'no_changes' };

  const copy = isReady
    ? pushCopy('ready', { changeCount: (checkin.changes ?? []).length, tone: checkin.recap?.tone })
    : pushCopy('reminder');
  // Intentionally NOT filtered by the user's push quiet hours (a product decision): the Monday 07:00
  // reminder lands inside the default 22:00 to 08:00 window and is meant to. Do not add a check here.
  const result = await pushTo(ctx, { ...copy, url: checkinLink(checkin.id) });
  if (result.sent > 0) {
    const column = isReady ? 'notified_at' : 'reminded_at';
    must(await ctx.supabase.from('chad_checkins').update({ [column]: nowIso(ctx), updated_at: nowIso(ctx) }).eq('id', checkin.id).eq('user_id', ctx.userId), 'Saving the notification');
  }
  if (!isReady) {
    await recordEvent(ctx.supabase, ctx, 'step.completed', { step: 'notify', checkinId: checkin.id, durationMs: Date.now() - started, metadata: { kind: 'reminder', sent: result.sent } });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------------------------

const DECIDED = ['applied', 'partial', 'declined'];

function storedResult(row) {
  const result = row.result ?? {};
  return { status: row.status, applied: result.applied ?? [], skipped: result.skipped ?? [], alreadyDecided: true };
}

async function opApply(ctx, body) {
  const checkin = await loadCheckin(ctx, body.checkinId);

  if (checkin.status !== 'pending') {
    // 'failed' with a result is "every ticked change conflicted"; without one it never drafted.
    if (DECIDED.includes(checkin.status) || (checkin.status === 'failed' && checkin.result)) return storedResult(checkin);
    throw conflict(`This check-in is ${checkin.status}.`);
  }
  if (checkin.expires_at && new Date(checkin.expires_at) <= ctx.now) throw conflict('This check-in has expired.');

  const changes = (checkin.changes ?? []).map((c) => storedChangeSchema.safeParse(c));
  if (changes.some((c) => !c.success)) throw conflict('This check-in is damaged and cannot be applied.');
  const byId = new Map(changes.map((c) => [c.data.id, c.data]));

  const accepted = [...new Set(body.acceptIds)];
  const unknown = accepted.filter((id) => !byId.has(id));
  if (unknown.length > 0) throw badRequest(`Unknown change id: ${unknown.join(', ')}.`);

  const applied = [];
  const skipped = [];

  if (accepted.length > 0) {
    const stored = await loadWeekProgram(ctx.supabase, checkin.gym_id, checkin.target_week);
    if (!stored) throw conflict('The program for that week is gone.');

    const edits = {};
    for (const id of accepted) {
      const change = byId.get(id);
      // A retry after a crash between the program write and the status write: the day already is
      // what we would write, so count it as applied instead of a conflict with ourselves.
      if (jsonEqual(stored[change.day], change.after)) applied.push({ id, day: change.day });
      else edits[change.day] = { before: change.before, after: change.after };
    }

    if (Object.keys(edits).length > 0) {
      const parsed = programEditsSchema.safeParse(edits);
      if (!parsed.success) throw conflict('This check-in is damaged and cannot be applied.');
      let saved;
      try {
        saved = await ctx.kit.actions.apply_program_days(checkin.target_week, parsed.data, APPLY_NOTE, checkin.gym_id);
      } catch (error) {
        throw fromKitError(error);
      }
      if (!saved?.success) {
        // The program refused the day itself (validation issues): retrying cannot help, and the
        // draft check should have caught it. A permanent conflict, not an outage.
        if (saved?.data?.issues) throw conflict('That edit did not pass the program checks.');
        throw upstream('Could not save the program.');
      }
      const idByDay = new Map(accepted.map((id) => [byId.get(id).day, id]));
      for (const day of saved.data.applied ?? []) applied.push({ id: idByDay.get(day), day });
      for (const s of saved.data.skipped ?? []) skipped.push({ id: idByDay.get(s.day), day: s.day, reason: s.reason });
    }
  }

  // applied: everything proposed went in. declined: the user chose nothing. failed: they chose, but
  // every ticked change hit a conflict (kept out of the approval rate; the card shows result.skipped).
  // partial: the rest.
  let status = 'partial';
  if (accepted.length === 0) status = 'declined';
  else if (applied.length === 0) status = 'failed';
  else if (applied.length === changes.length && skipped.length === 0) status = 'applied';
  const result = { applied, skipped };

  const decided = must(
    await ctx.supabase
      .from('chad_checkins')
      .update({ status, result, decided_at: nowIso(ctx), updated_at: nowIso(ctx) })
      .eq('id', checkin.id)
      .eq('user_id', ctx.userId)
      .eq('status', 'pending')
      .select('id'),
    'Saving the decision',
  );
  // A concurrent apply got there first. Its stored result is the answer.
  if (!decided?.length) return storedResult(await loadCheckin(ctx, checkin.id));

  const metadata = { accepted: accepted.length, applied: applied.length, skipped: skipped.length };
  // 'approved' means the user said yes, even when nothing could be saved (applied: 0 says so).
  await recordEvent(ctx.supabase, ctx, status === 'declined' ? 'declined' : 'approved', { checkinId: checkin.id, step: 'apply', metadata });
  await recordEvent(ctx.supabase, ctx, 'completed', { checkinId: checkin.id, metadata: { outcome: status } });
  return { status, applied, skipped, alreadyDecided: false };
}

// ---------------------------------------------------------------------------------------------
// expire
// ---------------------------------------------------------------------------------------------

async function opExpire(ctx, body) {
  const isOffer = Boolean(body.offerId);
  const table = isOffer ? 'chad_missed_offers' : 'chad_checkins';
  const id = isOffer ? body.offerId : body.checkinId;
  const openStatuses = isOffer ? ['pending'] : ['drafting', 'pending'];

  // Ownership first (404 for someone else's id); expiring is allowed even if the user has since
  // switched check-ins off, because turning it off is what expires what is still open.
  const row = isOffer ? await loadOffer(ctx, id) : await loadCheckin(ctx, id);
  if (!openStatuses.includes(row.status)) return { status: row.status, expired: false };

  const closed = must(
    await ctx.supabase
      .from(table)
      .update({ status: 'expired', updated_at: nowIso(ctx) })
      .eq('id', id)
      .eq('user_id', ctx.userId)
      .in('status', openStatuses)
      .select('id'),
    'Expiring',
  );
  if (!closed?.length) return { status: (isOffer ? await loadOffer(ctx, id) : await loadCheckin(ctx, id)).status, expired: false };

  const fields = { checkinId: isOffer ? null : id, step: 'expire' };
  await recordEvent(ctx.supabase, ctx, 'expired', { ...fields, metadata: isOffer ? { offer: id } : {} });
  await recordEvent(ctx.supabase, ctx, 'completed', { ...fields, metadata: { outcome: 'expired', ...(isOffer ? { offer: id } : {}) } });
  return { status: 'expired', expired: true };
}

// ---------------------------------------------------------------------------------------------
// missed_check
// ---------------------------------------------------------------------------------------------

async function countRows(query, what) {
  const { count, error } = await query;
  if (error) throw new DbError(what, error);
  return count ?? 0;
}

async function opMissedCheck(ctx, body) {
  const { supabase, userId } = ctx;
  const { gymId } = await requireEligible(ctx);
  const clock = await loadClock(supabase, userId, ctx.now);

  const userMarked = body.day !== undefined;
  let week;
  let day;
  if (userMarked) {
    ({ week, day } = body);
  } else {
    // Yesterday in the user's zone. Around 09:00 local, 24 h back is still yesterday's date.
    const yesterday = new Date(ctx.now.getTime() - 24 * 60 * 60 * 1000);
    day = localDayName({ timeZone: clock.timeZone, at: yesterday });
    week = calculateCurrentWeek(clock.programStartDate, { now: yesterday, timeZone: clock.timeZone });
  }

  // run.started is counted only for a real run: an offer was made, or the user themselves marked
  // the day. A daily check that finds nothing to do leaves no trace.
  const key = { kind: 'missed', week, day };
  const instigated = userMarked || ctx.instigation === 'day_missed';
  const noOffer = async (reason) => {
    if (instigated) {
      await recordEventOnce(supabase, ctx, 'run.started', { step: 'missed_check' }, key);
      await recordEventOnce(supabase, ctx, 'completed', { step: 'missed_check', metadata: { reason } }, { ...key, closed: true });
    }
    return { offer: null, created: false, reason };
  };

  // No start date means every date is "week 1": there is no real week to offer a move in.
  if (!clock.programStartDate) return noOffer('no_program');
  if (week !== clock.currentWeek) return noOffer(week > clock.currentWeek ? 'not_current_week' : 'week_boundary');

  const existing = must(
    await supabase.from('chad_missed_offers').select('*').eq('user_id', userId).eq('week', week).eq('from_day', day).maybeSingle(),
    'Reading the offer',
  );
  if (existing) {
    if (existing.status !== 'pending') return { offer: null, created: false, reason: 'already_handled' };
    await recordEventOnce(supabase, ctx, 'run.started', { step: 'missed_check' }, key);
    return { offer: offerSummary(existing), created: false };
  }

  const program = await loadWeekProgram(supabase, gymId, week);
  if (!program) return noOffer('no_program');

  const [loggedCount, completionCount, missedRows] = await Promise.all([
    countRows(supabase.from('workout_logs').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('week_number', week).eq('day_name', day).eq('completed', true), 'Counting logs'),
    countRows(supabase.from('workout_completions').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('week_number', week).eq('day_name', day), 'Counting completions'),
    supabase.from('missed_days').select('reason').eq('user_id', userId).eq('week_number', week).eq('day_name', day).limit(1),
  ]);
  const missedRow = must(missedRows, 'Reading missed days')?.[0];

  const verdict = wasDayMissed({
    planned: !isRestDay(program[day]),
    loggedCount,
    completionCount,
    missedReason: missedRow ? (missedRow.reason ?? null) : undefined,
  });
  if (!verdict.missed) return noOffer(verdict.reason);

  const toDay = findSlideTarget(program, day, clock.dayName);
  if (!toDay) return noOffer('no_rest_day');

  const inserted = await supabase
    .from('chad_missed_offers')
    .insert({
      user_id: userId,
      week,
      from_day: day,
      to_day: toDay,
      status: 'pending',
      expires_at: endOfLocalDay({ timeZone: clock.timeZone, at: ctx.now }),
    })
    .select()
    .single();
  let offer = inserted.data;
  let created = true;
  if (inserted.error?.code === '23505') {
    // A concurrent attempt created it.
    offer = must(await supabase.from('chad_missed_offers').select('*').eq('user_id', userId).eq('week', week).eq('from_day', day).maybeSingle(), 'Reading the offer');
    created = false;
  } else if (inserted.error) {
    throw new DbError('Creating the offer', inserted.error);
  }
  if (offer.status !== 'pending') return { offer: null, created: false, reason: 'already_handled' };

  await recordEventOnce(supabase, ctx, 'run.started', { step: 'missed_check' }, key);
  if (created) await recordEvent(supabase, ctx, 'step.completed', { step: 'missed_check', metadata: { week, from_day: day, to_day: toDay } });
  return { offer: offerSummary(offer), created };
}

// ---------------------------------------------------------------------------------------------
// missed_apply
// ---------------------------------------------------------------------------------------------

async function closeOffer(ctx, offer, status) {
  const closed = must(
    await ctx.supabase
      .from('chad_missed_offers')
      .update({ status, updated_at: nowIso(ctx) })
      .eq('id', offer.id)
      .eq('user_id', ctx.userId)
      .eq('status', 'pending')
      .select('id'),
    'Saving the decision',
  );
  if (!closed?.length) return false;
  await recordEvent(ctx.supabase, ctx, status === 'accepted' ? 'approved' : 'declined', { step: 'missed_apply', metadata: { offer: offer.id } });
  await recordEvent(ctx.supabase, ctx, 'completed', { metadata: { outcome: status, offer: offer.id } });
  return true;
}

const missedReply = (offer, status, alreadyDecided) => ({ status, fromDay: offer.from_day, toDay: offer.to_day, alreadyDecided });

// A permanent conflict (the plan moved on under the offer) ends the offer. It is closed as 'expired',
// not 'declined': the user did not say no, the offer just can no longer be carried out. Without this
// the card would keep offering something that always answers 409.
async function staleOffer(ctx, offer, reason) {
  const closed = must(
    await ctx.supabase
      .from('chad_missed_offers')
      .update({ status: 'expired', updated_at: nowIso(ctx) })
      .eq('id', offer.id)
      .eq('user_id', ctx.userId)
      .eq('status', 'pending')
      .select('id'),
    'Closing the offer',
  );
  if (closed?.length) {
    await recordEvent(ctx.supabase, ctx, 'expired', { step: 'missed_apply', metadata: { offer: offer.id, reason } });
    await recordEvent(ctx.supabase, ctx, 'completed', { metadata: { outcome: 'expired', offer: offer.id, reason } });
  }
  return conflict(reason);
}

async function opMissedApply(ctx, body) {
  const offer = await loadOffer(ctx, body.offerId);

  if (offer.status !== 'pending') {
    // Idempotent: the same answer again returns what was decided; an expired offer is a conflict.
    if (offer.status === 'expired') throw conflict('This offer has expired.');
    return missedReply(offer, offer.status, true);
  }
  if (offer.expires_at && new Date(offer.expires_at) <= ctx.now) throw conflict('This offer has expired.');

  if (!body.accept) {
    if (await closeOffer(ctx, offer, 'declined')) return missedReply(offer, 'declined', false);
    const settled = await loadOffer(ctx, offer.id);
    return missedReply(settled, settled.status, true);
  }

  // The program gym is not on the offer row; resolve it from checked reads (the kit's resolvers
  // hide database errors).
  const { leader, gymId } = await resolveProgramGym(ctx.supabase, ctx.userId);
  if (leader) throw notEligible(INELIGIBLE_COPY.group_member);
  if (!gymId) throw notEligible(INELIGIBLE_COPY.no_gym);

  const stored = await loadWeekProgram(ctx.supabase, gymId, offer.week);
  if (!stored) throw await staleOffer(ctx, offer, 'The program for that week is gone.');
  const from = stored[offer.from_day];
  const to = stored[offer.to_day];

  // A retry after a crash between the program write and the status write: the workout is already
  // gone from its old day and sits on the new one.
  if (isRestDay(from) && !isRestDay(to)) {
    await closeOffer(ctx, offer, 'accepted');
    return missedReply(offer, 'accepted', false);
  }
  if (isRestDay(from)) throw await staleOffer(ctx, offer, 'That workout is no longer on the plan.');
  if (!isRestDay(to)) throw await staleOffer(ctx, offer, `${offer.to_day} is not a rest day anymore.`);

  const edits = {
    [offer.from_day]: { before: from, after: REST_DAY() },
    [offer.to_day]: { before: to ?? null, after: from },
  };
  const parsed = programEditsSchema.safeParse(edits);
  if (!parsed.success) throw await staleOffer(ctx, offer, 'That workout cannot be moved.');

  let saved;
  try {
    saved = await ctx.kit.actions.apply_program_days(offer.week, parsed.data, MOVE_NOTE, gymId);
  } catch (error) {
    throw fromKitError(error);
  }
  if (!saved?.success) {
    if (saved?.data?.issues) throw await staleOffer(ctx, offer, 'That workout cannot be moved.');
    throw upstream('Could not save the program.');
  }

  const wrote = new Set(saved.data.applied ?? []);
  if (wrote.size === 2) {
    await closeOffer(ctx, offer, 'accepted');
    return missedReply(offer, 'accepted', false);
  }

  // One day saved and the other skipped (the user trained on it in the meantime) would copy the
  // workout or lose it. Put the saved day back so the week is exactly as it was. The kit reports a
  // failed save as { success: false }, not a throw, so the result is checked.
  if (wrote.size === 1) {
    const [day] = wrote;
    try {
      const undone = await ctx.kit.actions.apply_program_days(offer.week, { [day]: { before: edits[day].after, after: edits[day].before } }, MOVE_NOTE, gymId);
      if (!undone?.success || !(undone.data?.applied ?? []).includes(day)) throw new Error('rollback not applied');
    } catch (error) {
      console.error('missed_apply rollback failed:', error?.name || 'Error');
      captureException(error, { tags: { endpoint: 'checkin-worker', op: 'missed_apply_rollback' } });
    }
  }
  throw await staleOffer(ctx, offer, 'One of those days changed, so nothing was moved.');
}

// ---------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------

const OPS = {
  schedule: opSchedule,
  review: opReview,
  draft: opDraft,
  notify: opNotify,
  apply: opApply,
  expire: opExpire,
  missed_check: opMissedCheck,
  missed_apply: opMissedApply,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.CHECKIN_WORKER_SECRET;
  if (!secret) return res.status(500).json({ error: 'CHECKIN_WORKER_SECRET not configured.' });
  if (!secretMatches(req.headers.authorization, secret)) return res.status(401).json({ error: 'Unauthorized.' });

  const parsed = workerRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request.' });
  const body = parsed.data;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return res.status(500).json({ error: 'Server misconfigured.' });

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const ctx = {
      supabase,
      // The only source of identity for every call below.
      kit: buildToolKit(supabase, body.userId),
      userId: body.userId,
      instigation: body.instigation,
      workflowId: body.workflowId,
      runId: body.runId,
      attempt: body.attempt,
      now: new Date(),
    };
    return res.status(200).json(await OPS[body.op](ctx, body));
  } catch (raw) {
    const error = fromKitError(raw);
    if (error instanceof OpError && error.status < 500) return res.status(error.status).json({ error: error.message });
    // Provider and database errors can carry request details, so only the name is logged.
    console.error('Check-in worker error:', body.op, error?.name || 'Error');
    captureException(error?.cause ?? error, { tags: { endpoint: 'checkin-worker', op: body.op } });
    return res.status(503).json({ error: 'Upstream failure. Try again.' });
  }
}
