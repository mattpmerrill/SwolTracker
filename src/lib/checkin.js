// Chad weekly check-in client: calls the server-side /api/checkin endpoint (ADR-006). The check-in
// card itself reads Supabase through RLS (db.getRecentCheckins); this file only does the things that
// need the server: the status, the switch, and the decisions.
import { supabase } from './supabase';
import {
  checkinStatusResponseSchema,
  checkinSettingsResponseSchema,
  checkinDecideResultSchema,
  checkinMissedResultSchema,
  checkinEventResponseSchema,
} from './validation';

// The server gives an Update about 15 s to find a worker, so wait a little longer than that.
const TIMEOUT_MS = 25000;
// A mark-missed ping must never hold anything up.
const EVENT_TIMEOUT_MS = 8000;

const FRIENDLY = {
  conflict: 'This check-in changed. Pull it up again.',
  conflictOffer: 'That offer changed. Pull it up again.',
  notEligible: "Check-ins aren't available for your account.",
  notFound: "I can't find that one. Pull it up again.",
  offline: "Chad's offline right now. Try again in a bit.",
  timeout: 'Chad took too long to answer. Check the card, then try again.',
  network: "Couldn't reach Chad. Check your connection and try again.",
  rateLimit: "Chad needs a rest day. That's a lot of check-in taps, come back tomorrow.",
  auth: 'Your session expired. Sign in again to keep going.',
  default: 'Chad hit a snag. Try again in a moment.',
};

// The server's 4xx/503 bodies are short, written-for-people sentences (api/checkin.js). Anything
// longer or not a string is a proxy page or a stack and never reaches the screen.
function serverCopy(body) {
  const text = body?.error;
  return typeof text === 'string' && text.length > 0 && text.length <= 200 ? text : null;
}

function categorize(error, { offer = false } = {}) {
  if (error.name === 'AbortError') return { type: 'timeout', message: FRIENDLY.timeout, mayHaveRun: true };
  if (typeof error.status !== 'number') return { type: 'network', message: FRIENDLY.network, mayHaveRun: true };
  switch (error.status) {
    case 401: return { type: 'auth', message: FRIENDLY.auth, mayHaveRun: false };
    case 403: return { type: 'not_eligible', message: error.serverMessage || FRIENDLY.notEligible, mayHaveRun: false };
    case 404: return { type: 'not_found', message: FRIENDLY.notFound, mayHaveRun: false };
    case 409: return { type: 'conflict', message: offer ? FRIENDLY.conflictOffer : FRIENDLY.conflict, mayHaveRun: false };
    case 429: return { type: 'rate_limit', message: error.serverMessage || FRIENDLY.rateLimit, mayHaveRun: false };
    // A 503 after an Update timeout may still have run on the worker: callers re-read Supabase.
    case 503: return { type: 'offline', message: error.serverMessage || FRIENDLY.offline, mayHaveRun: true };
    case 504: return { type: 'timeout', message: FRIENDLY.timeout, mayHaveRun: true };
    // A 2xx here is a reply we could not read: the action ran, so a re-read is warranted.
    default: return { type: 'default', message: FRIENDLY.default, mayHaveRun: error.status >= 200 && error.status < 300 };
  }
}

async function post(body, schema, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    }
    const response = await fetch('/api/checkin', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const err = new Error(serverCopy(errorData) || `Check-in request failed: ${response.status}`);
      err.status = response.status;
      err.serverMessage = serverCopy(errorData);
      err.reason = typeof errorData?.reason === 'string' ? errorData.reason : null;
      throw err;
    }
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) {
      // The server answered 200, so the action ran; only the reply was unreadable.
      const err = new Error('Check-in returned an unexpected response shape');
      err.status = response.status;
      throw err;
    }
    return parsed.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Wraps a failure in an Error whose message is safe to show. `errorType` names the case,
// `mayHaveRun` says a re-read of Supabase is needed before believing nothing happened.
async function call(body, schema, { offer = false, timeoutMs } = {}) {
  try {
    return await post(body, schema, timeoutMs);
  } catch (error) {
    const { type, message, mayHaveRun } = categorize(error, { offer });
    const friendly = new Error(message);
    friendly.originalError = error;
    friendly.errorType = type;
    friendly.status = error.status ?? null;
    friendly.reason = error.reason ?? null;
    friendly.mayHaveRun = mayHaveRun;
    throw friendly;
  }
}

/**
 * Eligibility and the switch. A 503 means check-ins are not set up on the server: callers hide the
 * settings card on that (errorType 'offline').
 * @returns {Promise<{ eligible: boolean, reason?: string, enabled: boolean, configured: boolean }>}
 */
export function getCheckinStatus() {
  return call({ action: 'status' }, checkinStatusResponseSchema);
}

/** Turn the weekly check-in on or off. @returns {Promise<{ enabled: boolean }>} */
export function setWeeklyCheckin(enabled) {
  return call({ action: 'settings', enabled: Boolean(enabled) }, checkinSettingsResponseSchema);
}

/**
 * Apply the ticked changes. An empty `acceptIds` is "skip this week" (and "Got it").
 * @returns {Promise<{ status: string, applied: Array<{id: string, day: string}>, skipped: Array<{id: string, day: string, reason: string}> }>}
 */
export function decideCheckin({ checkinId, acceptIds }) {
  return call({ action: 'decide', checkinId, acceptIds }, checkinDecideResultSchema);
}

/** Move a missed workout to its rest day (accept) or let it go. */
export function answerMissedDay({ offerId, accept }) {
  return call({ action: 'missed', offerId, accept: Boolean(accept) }, checkinMissedResultSchema, { offer: true });
}

/**
 * Tell Chad the user marked a day missed. Fire and forget: it never throws and never toasts, because
 * the skip itself already succeeded and this only lets Chad offer to move it.
 * @returns {Promise<boolean>} true when a workflow took the signal
 */
export async function reportDayMissed({ week, day }) {
  try {
    const result = await post({ action: 'event', type: 'day_missed', week, day }, checkinEventResponseSchema, EVENT_TIMEOUT_MS);
    return result.queued;
  } catch (error) {
    console.warn('Check-in: could not report a missed day', error?.message);
    return false;
  }
}

/**
 * Mark-missed hook-up: tell Chad about a missed day, but only for a user who turned the weekly
 * check-in on. Everyone else would just get a pointless request. Fire and forget: never throws.
 * `db` is passed in so this stays testable without the Supabase client.
 * @returns {Promise<boolean>} true when a workflow took the signal
 */
export async function noteDayMissed({ db, userId, week, day }) {
  try {
    if (!userId || (await db.getWeeklyCheckinSetting(userId)) !== true) return false;
    return await reportDayMissed({ week, day });
  } catch (error) {
    console.warn('Check-in: could not note a missed day', error?.message);
    return false;
  }
}
