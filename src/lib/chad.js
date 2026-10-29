// Chad client: calls the server-side /api/chad endpoint (the model key stays server-side).
import { logError, ErrorCategory, ErrorSeverity } from './errorService';
import { supabase } from './supabase';
import { chadResponseSchema } from './validation';

// Slightly longer than the server's 60 s function limit so the server answers first.
const TIMEOUT_MS = 70000;

const FRIENDLY = {
  timeout: 'Chad took too long to answer. Give it another shot.',
  rate_limit: "You've hit Chad's daily limit. Come back tomorrow.",
  auth: 'Your session expired. Sign in again to keep talking to Chad.',
  unavailable: 'Chad is off the clock right now. Try again later.',
  default: 'Chad hit a snag. Try again in a moment.',
};

function categorize(error) {
  if (error.name === 'AbortError' || error.status === 'timeout') {
    return { type: 'timeout', severity: ErrorSeverity.WARNING };
  }
  switch (error.status) {
    case 401: return { type: 'auth', severity: ErrorSeverity.WARNING };
    case 429: return { type: 'rate_limit', severity: ErrorSeverity.WARNING };
    case 504: return { type: 'timeout', severity: ErrorSeverity.WARNING };
    case 503: return { type: 'unavailable', severity: ErrorSeverity.WARNING };
    default: return { type: 'default', severity: ErrorSeverity.ERROR };
  }
}

async function postToChad(body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    }

    const response = await fetch('/api/chad', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const err = new Error(errorData.error || `Chad request failed: ${response.status}`);
      err.status = response.status;
      throw err;
    }
    const parsed = chadResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      // A 200 with the wrong shape is a server bug; treat it like any other failure.
      throw new Error('Chad returned an unexpected response shape');
    }
    return parsed.data;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callChad(body, operation, { db = null, userId = null } = {}) {
  try {
    return await postToChad(body);
  } catch (error) {
    const { type, severity } = categorize(error);

    if (db) {
      await logError(db, {
        category: ErrorCategory.LLM,
        message: error.message,
        severity,
        userId,
        component: 'chad.js',
        operation,
        originalError: error,
        context: { status: error.status ?? null, type },
      });
    }

    // Raw provider or network text never reaches the UI; only these strings do.
    const enhancedError = new Error(FRIENDLY[type] || FRIENDLY.default);
    enhancedError.originalError = error;
    enhancedError.category = ErrorCategory.LLM;
    enhancedError.errorType = type;
    throw enhancedError;
  }
}

/**
 * Send a chat message to Chad.
 * @param {{ message: string, history: Array<object>, db?: object, userId?: string }} args
 *   `history` is opaque: pass back exactly what the last response returned.
 * @returns {Promise<{ reply: string, history: Array<object>, pending: null | object, changed: boolean }>}
 */
export function sendChadMessage({ message, history, db = null, userId = null }) {
  return callChad({ type: 'message', message, history }, 'sendChadMessage', { db, userId });
}

/**
 * Approve or reject the edit Chad proposed.
 * @param {{ approve: boolean, state: string, db?: object, userId?: string }} args
 *   `state` is `pending.state` from the last response.
 */
export function sendChadDecision({ approve, state, db = null, userId = null }) {
  return callChad({ type: 'decision', approve, state }, 'sendChadDecision', { db, userId });
}
