// Pure logic for Chad's weekly check-in (ADR-006): request schemas, the wall-clock math for the
// worker's wake-up times, the slide-target and missed-day rules, metering cost, and the cleanup that
// turns a model draft into something safe to store. No network, database or SDK calls, so every rule
// is unit tested in Node. The names and shapes shared with the worker live in
// shared/checkin-contract.ts.

import { z } from 'zod';
import {
  DEFAULT_TIME_ZONE,
  calculateCurrentWeek,
  isValidTimeZone,
} from '../mcp/dist/shared/week-math.js';
import { PROGRAM_DAYS } from '../mcp/dist/shared/checkin-contract.js';
// The program's own day check (a zod 3 schema, used only through safeParse), so a day the model drafts
// is held to exactly what the save will hold it to.
import { ProgramDaySchema } from '../mcp/dist/mcp/src/tools/actions.js';

const MAX_CHANGES = 4;
const MAX_HEADLINE = 80;
const MAX_SUMMARY = 120;
const MAX_REASON = 160;
const MAX_BULLET = 120;
const MAX_BULLETS = 3;

const INSTIGATIONS = ['schedule', 'day_missed', 'user_action', 'user_message'];
const dayName = z.enum(PROGRAM_DAYS);

// ---------------------------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------------------------

const changeIdList = z.array(z.string().regex(/^c[1-4]$/)).max(MAX_CHANGES);

/** POST /api/checkin. The user id is never in the body: it comes from the verified JWT. */
export const checkinRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status') }),
  z.object({ action: z.literal('settings'), enabled: z.boolean() }),
  z.object({ action: z.literal('decide'), checkinId: z.uuid(), acceptIds: changeIdList }),
  z.object({ action: z.literal('missed'), offerId: z.uuid(), accept: z.boolean() }),
  z.object({ action: z.literal('event'), type: z.literal('day_missed'), week: z.number().int().min(1).max(520), day: dayName }),
]);

const shortText = (max) => z.string().max(max);

// The review is produced by our own `review` op and handed back by the worker, but the endpoint
// still treats it as untrusted: it is bounded and re-parsed before it reaches a prompt.
export const weekReviewSchema = z.object({
  reviewWeek: z.number().int().min(1),
  scheduledDays: z.array(shortText(20)).max(7),
  completedDays: z.array(shortText(20)).max(7),
  missedDays: z.array(z.object({ day: shortText(20), reason: shortText(200).nullable() })).max(7),
  sessions: z.array(z.object({
    day: shortText(20),
    exercise: shortText(80),
    sets: z.number().int().min(0).max(100),
    avgWeight: z.number().min(0).max(5000),
    avgReps: z.number().min(0).max(1000),
    prescribedReps: z.number().min(0).max(1000).nullable(),
    outcome: shortText(30),
  })).max(60),
  notes: z.array(z.object({ day: shortText(20), label: shortText(80).nullable(), text: shortText(600) })).max(30),
  recommendations: z.array(z.object({
    exercise: shortText(80),
    type: z.enum(['increase', 'deload', 'stale']),
    message: shortText(300),
    increment: z.number().min(0).max(100).optional(),
  })).max(20),
});

const dayObject = z.record(z.string(), z.unknown());

/** A change as stored in chad_checkins.changes, re-checked before it is turned into a program edit. */
export const storedChangeSchema = z.object({
  id: z.string().regex(/^c[1-4]$/),
  day: dayName,
  before: dayObject.nullable(),
  after: dayObject.refine((d) => Array.isArray(d.exercises) && d.exercises.length > 0, { message: 'a changed day needs exercises' }),
});

/** What apply_program_days receives: day name to { before, after }. At least one day. */
export const programEditsSchema = z
  .partialRecord(dayName, z.object({ before: dayObject.nullable(), after: dayObject }))
  .refine((edits) => Object.keys(edits).length > 0, { message: 'at least one day' });

const envelope = {
  userId: z.uuid(),
  instigation: z.enum(INSTIGATIONS),
  workflowId: z.string().min(1).max(200),
  runId: z.string().min(1).max(200),
  attempt: z.number().int().min(1).max(100),
};

const isoUtc = z.iso.datetime();

/** POST /api/checkin-worker body, validated after the bearer secret. */
export const workerRequestSchema = z.discriminatedUnion('op', [
  z.object({ ...envelope, op: z.literal('schedule') }),
  z.object({ ...envelope, op: z.literal('review'), scheduledFor: isoUtc }),
  z.object({
    ...envelope,
    op: z.literal('draft'),
    reviewWeek: z.number().int().min(1),
    targetWeek: z.number().int().min(2),
    anchor: isoUtc,
    review: weekReviewSchema,
  }).refine((v) => v.targetWeek === v.reviewWeek + 1, { message: 'targetWeek must be reviewWeek + 1' }),
  z.object({
    ...envelope,
    op: z.literal('notify'),
    kind: z.enum(['ready', 'reminder', 'missed']),
    checkinId: z.uuid().optional(),
    offerId: z.uuid().optional(),
  }).refine((v) => (v.kind === 'missed' ? Boolean(v.offerId) : Boolean(v.checkinId)), {
    message: 'ready and reminder need checkinId, missed needs offerId',
  }),
  z.object({ ...envelope, op: z.literal('apply'), checkinId: z.uuid(), acceptIds: changeIdList }),
  z.object({
    ...envelope,
    op: z.literal('expire'),
    checkinId: z.uuid().optional(),
    offerId: z.uuid().optional(),
  }).refine((v) => Boolean(v.checkinId) !== Boolean(v.offerId), { message: 'exactly one of checkinId, offerId' }),
  z.object({
    ...envelope,
    op: z.literal('missed_check'),
    week: z.number().int().min(1).max(520).optional(),
    day: dayName.optional(),
  }).refine((v) => (v.week === undefined) === (v.day === undefined), { message: 'week and day come together' }),
  z.object({ ...envelope, op: z.literal('missed_apply'), offerId: z.uuid(), accept: z.boolean() }),
]);

// ---------------------------------------------------------------------------------------------
// Wall-clock math (all in the user's zone, all returned as ISO UTC)
// ---------------------------------------------------------------------------------------------

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The zone if Intl accepts it, otherwise the app default (profile zones are often null). */
function resolveTimeZone(timeZone) {
  return typeof timeZone === 'string' && isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

function wallParts(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAY_INDEX[parts.weekday],
  };
}

/** The calendar date `days` after y-m-d, with no zone involved. */
function addCalendarDays({ year, month, day }, days) {
  const t = new Date(Date.UTC(year, month - 1, day + days));
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/**
 * The UTC instant at which the wall clock in `timeZone` reads y-m-d hh:mm:ss. The offset depends on
 * the instant (DST), so it is found by correcting a guess until the zone reads the wanted time.
 * A wall time that does not exist (the spring-forward gap) settles on the nearest real instant.
 */
function zonedWallToUtc({ year, month, day }, hour, minute, second, timeZone) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wanted;
  for (let i = 0; i < 4; i += 1) {
    const p = wallParts(new Date(guess), timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = wanted - shown;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/**
 * The next Sunday 18:00 and the next 09:00 in the user's zone, both strictly after `now`.
 * An instant exactly at 09:00 or 18:00 counts as passed, so the same wake-up never fires twice.
 */
export function computeSchedule({ timeZone, now = new Date() }) {
  const zone = resolveTimeZone(timeZone);
  const today = wallParts(now, zone);

  let daily = zonedWallToUtc(today, 9, 0, 0, zone);
  if (daily.getTime() <= now.getTime()) daily = zonedWallToUtc(addCalendarDays(today, 1), 9, 0, 0, zone);

  const untilSunday = (7 - today.weekday) % 7;
  let checkin = zonedWallToUtc(addCalendarDays(today, untilSunday), 18, 0, 0, zone);
  if (checkin.getTime() <= now.getTime()) checkin = zonedWallToUtc(addCalendarDays(today, untilSunday + 7), 18, 0, 0, zone);

  return { timeZone: zone, nextCheckinAt: checkin.toISOString(), nextDailyAt: daily.toISOString() };
}

/**
 * Monday 07:00 (the reminder) and Monday 23:59:59 (the expiry) that follow `anchor`, the Sunday
 * 18:00 the check-in was scheduled for. A run that wakes late on Monday still gets that Monday.
 */
export function computeCheckinWindow({ timeZone, anchor }) {
  const zone = resolveTimeZone(timeZone);
  const p = wallParts(anchor, zone);
  const monday = addCalendarDays(p, (8 - p.weekday) % 7);
  return {
    reminderAt: zonedWallToUtc(monday, 7, 0, 0, zone).toISOString(),
    expiresAt: zonedWallToUtc(monday, 23, 59, 59, zone).toISOString(),
  };
}

/** The end of the user's local day that contains `at` (23:59:59). Missed-day offers expire then. */
export function endOfLocalDay({ timeZone, at }) {
  const zone = resolveTimeZone(timeZone);
  return zonedWallToUtc(wallParts(at, zone), 23, 59, 59, zone).toISOString();
}

/** The user's local weekday name for an instant. */
export function localDayName({ timeZone, at }) {
  const index = wallParts(at, resolveTimeZone(timeZone)).weekday;
  return PROGRAM_DAYS[(index + 6) % 7];
}

/**
 * The week that ended at `anchor` (a Sunday 18:00 local) and the one after it. calculateCurrentWeek
 * reads the date in the user's zone: on a UTC server Sunday 18:00 Denver is already Monday, which
 * would review the week that has not started.
 */
export function reviewTargetWeeks({ programStartDate, anchor, timeZone }) {
  const reviewWeek = calculateCurrentWeek(programStartDate ?? null, { now: anchor, timeZone: resolveTimeZone(timeZone) });
  return { reviewWeek, targetWeek: reviewWeek + 1 };
}

// ---------------------------------------------------------------------------------------------
// Rest days, slide targets, missed days
// ---------------------------------------------------------------------------------------------

/** A rest day is a missing day, an empty exercise list, or a day whose focus says so. */
export function isRestDay(day) {
  if (!day || typeof day !== 'object') return true;
  if (!Array.isArray(day.exercises) || day.exercises.length === 0) return true;
  return String(day.focus ?? '').trim().toLowerCase() === 'rest day';
}

/** The first rest day strictly after today in the same Monday-Sunday week, or null. */
export function findSlideTarget(weekProgram, fromDay, todayDayName) {
  const todayIndex = PROGRAM_DAYS.indexOf(todayDayName);
  if (todayIndex === -1 || !PROGRAM_DAYS.includes(fromDay)) return null;
  for (let i = todayIndex + 1; i < PROGRAM_DAYS.length; i += 1) {
    const candidate = PROGRAM_DAYS[i];
    if (candidate !== fromDay && isRestDay(weekProgram?.[candidate])) return candidate;
  }
  return null;
}

const INJURY_OR_ILLNESS = /\b(?:injur\w*|illness|ill|sick\w*)\b/i;

/**
 * Whether a planned workout counts as missed, using the same four counts as the daily reminder
 * (api/cron/reminders.js): the plan, completed log rows, a completion, and a missed_days row. The
 * order differs on purpose: logged sets are checked before the missed mark.
 * `missedReason` is undefined when there is no missed_days row, and null or text when there is.
 * A day the user marked missed for an injury or illness is not offered a move: Chad should not
 * nudge someone to train through it.
 */
export function wasDayMissed({ planned, loggedCount = 0, completionCount = 0, missedReason }) {
  if (!planned) return { missed: false, reason: 'rest_day' };
  if (completionCount > 0) return { missed: false, reason: 'completed' };
  // Sets on the board mean the user trained, whatever a missed mark says: moving the workout would
  // schedule it twice. (The daily reminder checks the mark first, but it only decides whether to nag.)
  if (loggedCount > 0) return { missed: false, reason: 'already_logged' };
  if (missedReason !== undefined) {
    if (typeof missedReason === 'string' && INJURY_OR_ILLNESS.test(missedReason)) {
      return { missed: false, reason: 'injury_or_illness' };
    }
    return { missed: true, reason: 'marked_missed' };
  }
  return { missed: true, reason: 'unlogged' };
}

/** Key order and `undefined` do not matter; null and undefined are the same value (a jsonb round trip). */
export function jsonEqual(a, b) {
  if (a == null || b == null) return a == null && b == null;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!jsonEqual(a[key], b[key])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Metering
// ---------------------------------------------------------------------------------------------

/**
 * `chad_price_per_mtok` in app_settings: JSON {"input": n, "output": n}, dollars per million tokens.
 * Missing or malformed prices cost 0 and say so (`valid: false`), so metering never throws.
 */
export function parsePrices(setting) {
  try {
    const parsed = typeof setting === 'string' ? JSON.parse(setting) : setting;
    const input = Number(parsed?.input);
    const output = Number(parsed?.output);
    if (Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0) {
      return { input, output, valid: true };
    }
  } catch {
    // Falls through to the unpriced result.
  }
  return { input: 0, output: 0, valid: false };
}

/** Dollars for one call, rounded to the six decimals chad_events.cost_usd stores. */
export function costFor({ promptTokens = 0, completionTokens = 0 }, prices) {
  const input = Number(prices?.input) || 0;
  const output = Number(prices?.output) || 0;
  const dollars = (Math.max(0, promptTokens) * input + Math.max(0, completionTokens) * output) / 1_000_000;
  return Math.round(dollars * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------------------------
// Draft cleanup
// ---------------------------------------------------------------------------------------------

/**
 * Trim, collapse whitespace, drop em and en dashes (Chad never writes them), cap the length.
 * A cap cuts at a word edge when it can.
 */
export function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  const flat = value
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const edge = cut.lastIndexOf(' ');
  return (edge > max * 0.6 ? cut.slice(0, edge) : cut).replace(/[\s,;:]+$/, '');
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The day as the save would store it: validated by the program's own schema, unknown keys stripped.
// Null when it does not pass, or has no exercises (a change never turns a training day into rest).
function canonicalDay(day) {
  const parsed = ProgramDaySchema.safeParse(day);
  return parsed.success && parsed.data.exercises.length > 0 ? parsed.data : null;
}

function cleanList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, MAX_BULLET))
    .filter(Boolean)
    .slice(0, MAX_BULLETS);
}

/**
 * A model draft in, a storable one out:
 *  - at most four changes, at most one per day, ids c1..c4 in Monday-to-Sunday order;
 *  - only days that are really in next week's stored program and are training days;
 *  - `before` comes from the stored program, never from the model (the card and the conflict check
 *    both trust it), and a change whose `after` equals it is dropped;
 *  - each `after` must pass the program's DaySchema (sets, reps length, block indexes) and is stored in
 *    its parsed form, so a draft that could not be saved never reaches the user;
 *  - strings are trimmed and capped; anything unparseable is dropped rather than repaired.
 */
export function normalizeDraft(raw, targetWeekProgram) {
  const draft = isPlainObject(raw) ? raw : {};
  const program = isPlainObject(targetWeekProgram) ? targetWeekProgram : {};

  const recap = {
    headline: cleanText(draft.recap?.headline, MAX_HEADLINE) || 'Week reviewed',
    wins: cleanList(draft.recap?.wins),
    watch: cleanList(draft.recap?.watch),
    tone: 'normal',
  };

  const seen = new Set();
  const kept = [];
  for (const item of Array.isArray(draft.changes) ? draft.changes : []) {
    if (kept.length >= MAX_CHANGES) break;
    if (!isPlainObject(item)) continue;
    const day = item.day;
    if (!PROGRAM_DAYS.includes(day) || seen.has(day)) continue;
    const before = program[day];
    if (isRestDay(before)) continue;
    // Stored as the canonical form, so the conflict check and the crash-retry "already equals after"
    // check compare like with like. `before` is compared in its canonical form too.
    const after = canonicalDay(item.day_data ?? item.after);
    if (!after || jsonEqual(canonicalDay(before) ?? before, after)) continue;
    const summary = cleanText(item.summary, MAX_SUMMARY);
    if (!summary) continue;
    seen.add(day);
    kept.push({ day, summary, reason: cleanText(item.reason, MAX_REASON), before, after });
  }

  kept.sort((a, b) => PROGRAM_DAYS.indexOf(a.day) - PROGRAM_DAYS.indexOf(b.day));
  const changes = kept.map((change, index) => ({ id: `c${index + 1}`, ...change }));
  return { recap, changes };
}

/** The recap when a note in the week mentions something that needs a professional. No model, no changes. */
export function seriousRecap(reason, stats) {
  const what = typeof reason === 'string' && reason ? reason : 'something that needs checking';
  return {
    headline: 'Real talk, no program changes',
    wins: [],
    watch: [`Your notes mention ${what}. Get it checked by a doctor or physical therapist before you lift on it again.`],
    tone: 'serious',
    ...(stats ? { stats } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Push copy (Chad's voice; no em-dashes)
// ---------------------------------------------------------------------------------------------

export function pushCopy(kind, { changeCount = 0, fromDay, toDay, tone = 'normal' } = {}) {
  if (kind === 'ready') {
    if (tone === 'serious') {
      return { title: 'Chad has a note on your week', body: 'No changes this week. Tap to read what I flagged.' };
    }
    return changeCount > 0
      ? {
          title: 'Chad reviewed your week',
          body: `I've got ${changeCount} ${changeCount === 1 ? 'change' : 'changes'} lined up for next week. Tap to take a look.`,
        }
      : { title: 'Chad reviewed your week', body: "Nothing to change for next week, you're on track. Tap for the recap." };
  }
  if (kind === 'reminder') {
    return { title: "Chad's changes are still waiting", body: 'They expire tonight. Tap to approve what you like or skip them.' };
  }
  return {
    title: `Missed ${fromDay}?`,
    body: `Want me to move that workout to ${toDay}? Tap to decide.`,
  };
}
