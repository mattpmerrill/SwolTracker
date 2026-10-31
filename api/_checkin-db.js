// Database helpers shared by /api/checkin (status, settings) and /api/checkin-worker. All of them
// take a service-role Supabase client plus a kit bound to the verified user id, and scope every
// query by that id. The pure rules are in api/_checkin-core.js.

import { resolveUserClock } from '../mcp/dist/mcp/src/user-clock.js';
import { parsePrices } from './_checkin-core.js';

const ROLLOUT_ALL = 'all';

/** A database error in a form the callers can throw. The message stays server-side. */
export class DbError extends Error {
  constructor(what, error) {
    super(`${what} failed${error?.code ? ` (${error.code})` : ''}`);
    this.name = 'DbError';
    this.cause = error;
  }
}

export function must(result, what) {
  if (result?.error) throw new DbError(what, result.error);
  return result?.data ?? null;
}

/**
 * The gym whose program the user can edit, found the way the kit's getMyGyms does (oldest membership
 * first, gym_id as the tie-break) but with every read checked. The kit's own resolvers swallow a
 * database error and answer "no gym", which would stop a user's workflow for good on a blip; here a
 * failed read throws (a retryable 503) instead.
 *   leader: the user follows a group leader's program, which they cannot edit.
 *   gymId:  the gym they own (or lead), or null.
 */
export async function resolveProgramGym(supabase, userId) {
  const leaderGym = must(await supabase.rpc('get_leader_gym_id', { p_member_id: userId }), 'Reading the group leader');
  if (leaderGym != null && leaderGym !== '') return { leader: true, gymId: null };
  const memberships = must(
    await supabase
      .from('gym_members')
      .select('gym_id, role')
      .eq('user_id', userId)
      .order('joined_at', { ascending: true })
      .order('gym_id', { ascending: true }),
    'Reading gyms',
  );
  const writable = (memberships ?? []).find((m) => m.role === 'owner' || m.role === 'leader');
  return { leader: false, gymId: writable?.gym_id ?? null };
}

/**
 * resolveUserClock, but a failed profile read throws. The kit's clock swallows it and falls back to
 * "no start date, week 1", which would review the wrong week.
 */
export async function loadClock(supabase, userId, now) {
  must(await supabase.from('profiles').select('program_start_date').eq('id', userId).maybeSingle(), 'Reading the profile');
  return resolveUserClock(supabase, userId, now);
}

/**
 * Who may use check-ins, in the order the UI explains it:
 *   rollout       app_settings chad_checkin_rollout is "admin" (the default) and the user is not the admin
 *   group_member  the user follows a leader's program, which they cannot edit
 *   no_gym        the user owns no gym with a program
 * `reason` is null when the user is eligible. `enabled` is the user's own switch; it is separate so
 * the settings screen can show a switch for an eligible user who has not turned it on yet.
 * The leader check comes first among the program checks because a group member owns a personal gym
 * too, and would otherwise look eligible for a program they do not follow.
 */
export async function loadEligibility(supabase, userId) {
  const settings = must(
    await supabase.from('chad_coach_settings').select('weekly_checkin').eq('user_id', userId).maybeSingle(),
    'Reading check-in settings',
  );
  const enabled = settings?.weekly_checkin === true;

  const rollout = must(await supabase.rpc('get_app_setting', { p_key: 'chad_checkin_rollout' }), 'Reading rollout');
  let allowed = typeof rollout === 'string' && rollout.trim().toLowerCase() === ROLLOUT_ALL;
  if (!allowed) {
    // The default is admin only. is_admin takes the id as an argument, so the service role can ask
    // about any user.
    allowed = must(await supabase.rpc('is_admin', { p_user_id: userId }), 'Reading admin flag') === true;
  }
  if (!allowed) return { enabled, reason: 'rollout', gymId: null };

  const { leader, gymId } = await resolveProgramGym(supabase, userId);
  if (leader) return { enabled, reason: 'group_member', gymId: null };
  if (!gymId) return { enabled, reason: 'no_gym', gymId: null };
  return { enabled, reason: null, gymId };
}

export async function loadPrices(supabase) {
  const { data } = await supabase.rpc('get_app_setting', { p_key: 'chad_price_per_mtok' });
  return parsePrices(data);
}

/** The stored program_data of one week, or null when the week does not exist. */
export async function loadWeekProgram(supabase, gymId, week) {
  const data = must(
    await supabase.from('workout_programs').select('program_data').eq('gym_id', gymId).eq('week_number', week).maybeSingle(),
    'Reading the program',
  );
  return data?.program_data ?? null;
}

/**
 * One metering row. Metering never breaks the work it describes: a failed insert is logged (without
 * the row) and swallowed, because a user's Apply must not fail on a log table.
 */
export async function recordEvent(supabase, ctx, event, fields = {}) {
  try {
    const { error } = await supabase.from('chad_events').insert({
      user_id: ctx.userId,
      workflow_id: ctx.workflowId ?? null,
      run_id: ctx.runId ?? null,
      checkin_id: fields.checkinId ?? null,
      instigation: ctx.instigation,
      event,
      step: fields.step ?? null,
      model: fields.model ?? null,
      prompt_tokens: fields.promptTokens ?? 0,
      completion_tokens: fields.completionTokens ?? 0,
      cost_usd: fields.costUsd ?? 0,
      attempt: ctx.attempt ?? 1,
      duration_ms: fields.durationMs == null ? null : Math.max(0, Math.round(fields.durationMs)),
      metadata: fields.metadata ?? {},
    });
    if (error) console.error('chad_events insert failed:', error.message);
  } catch (error) {
    console.error('chad_events insert failed:', error?.message);
  }
}

/**
 * recordEvent, but only once per (run, instigation, event, key). The key is a few metadata fields
 * that name the unit of work (kind, week, day), so an activity retry after a lost response does not
 * count a second run.
 */
export async function recordEventOnce(supabase, ctx, event, fields, key) {
  try {
    const { data, error } = await supabase
      .from('chad_events')
      .select('id')
      .eq('user_id', ctx.userId)
      .eq('workflow_id', ctx.workflowId)
      .eq('run_id', ctx.runId)
      .eq('instigation', ctx.instigation)
      .eq('event', event)
      .contains('metadata', key)
      .limit(1);
    if (!error && data?.length > 0) return false;
  } catch (error) {
    console.error('chad_events lookup failed:', error?.message);
  }
  await recordEvent(supabase, ctx, event, { ...fields, metadata: { ...fields?.metadata, ...key } });
  return true;
}

/** What crosses into Temporal: no proposed days, only what the workflow needs to schedule. */
export function checkinHandle(row) {
  return {
    id: row.id,
    status: row.status,
    reminderAt: row.reminder_at ?? null,
    expiresAt: row.expires_at ?? null,
    changeCount: Array.isArray(row.changes) ? row.changes.length : 0,
  };
}

export function offerSummary(row) {
  return {
    id: row.id,
    week: row.week,
    fromDay: row.from_day,
    toDay: row.to_day,
    status: row.status,
    expiresAt: row.expires_at ?? null,
  };
}
