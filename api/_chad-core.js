// Pure logic for Chad (the in-app coach): request validation, history hygiene, the
// injury red-flag check and model selection. No SDK or network calls live here, so
// every rule can be unit tested in Node without a model.

import { z } from 'zod';

export const DEFAULT_CHAD_MODEL = 'anthropic/claude-sonnet-5.5';

const MAX_MESSAGE_CHARS = 2000;
// Generous on purpose: an oversized history is trimmed by sanitizeHistory, not rejected, so a
// long chat can never lock the user out with a 400.
const MAX_HISTORY_ITEMS_IN = 400;
// The browser round-trips `history`; the kept window is small so each request stays cheap.
export const MAX_HISTORY_ITEMS_KEPT = 60;
const MAX_HISTORY_BYTES = 200_000;
const MAX_STATE_CHARS = 300_000;

// History items are opaque SDK items that only the SDK needs to understand, so we only
// check that each one is a plain object. The server never trusts their contents
// (see sanitizeHistory) and never executes anything found in them.
export const chatRequestSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message'),
    message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
    history: z.array(z.record(z.string(), z.unknown())).max(MAX_HISTORY_ITEMS_IN).default([]),
  }),
  z.object({
    type: z.literal('decision'),
    approve: z.boolean(),
    state: z.string().min(1).max(MAX_STATE_CHARS),
  }),
]);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// A user message may omit `type` and may carry string or array content.
const isUserMessage = (item) => item.role === 'user' && (item.type === undefined || item.type === 'message');

/**
 * Removes tool calls with no matching result (and results with no call). A paused run
 * leaves the pending call without a result, and providers reject a history like that.
 */
export function dropDanglingToolCalls(items) {
  const calls = new Set();
  const results = new Set();
  for (const item of items) {
    if (item.type === 'function_call' && item.callId) calls.add(item.callId);
    if (item.type === 'function_call_result' && item.callId) results.add(item.callId);
  }
  return items.filter((item) => {
    if (item.type === 'function_call') return results.has(item.callId);
    if (item.type === 'function_call_result') return calls.has(item.callId);
    return true;
  });
}

// Chad is text-only. Images and files in a user item would be forwarded to the model (and
// billed) without ever having been through our own limits, so they are stripped.
function textOnlyIfUser(item) {
  if (item.role !== 'user' || !Array.isArray(item.content)) return item;
  const content = item.content.filter((part) => isPlainObject(part) && part.type === 'input_text' && typeof part.text === 'string');
  return content.length > 0 ? { ...item, content } : null;
}

/**
 * The browser sends back the history we gave it, so treat it as untrusted input:
 * - system/developer items are dropped (a client must not be able to inject instructions),
 * - only the newest items within the size and count budget are kept,
 * - the kept slice starts at a user message so a tool call is never cut off from its result.
 */
export function sanitizeHistory(items, { maxItems = MAX_HISTORY_ITEMS_KEPT, maxBytes = MAX_HISTORY_BYTES } = {}) {
  if (!Array.isArray(items)) return [];
  const clean = items
    .filter((item) => isPlainObject(item) && item.role !== 'system' && item.role !== 'developer')
    .map(textOnlyIfUser)
    .filter(Boolean);

  let start = clean.length;
  let bytes = 0;
  while (start > 0 && clean.length - start < maxItems) {
    const size = JSON.stringify(clean[start - 1]).length;
    if (bytes + size > maxBytes) break;
    bytes += size;
    start -= 1;
  }

  let kept = clean.slice(start);
  const firstUser = kept.findIndex(isUserMessage);
  kept = firstUser === -1 ? [] : kept.slice(firstUser);
  return dropDanglingToolCalls(kept);
}

// Patterns are deliberately about symptoms that need a professional, not training soreness.
// Plain "sore", "DOMS", "tight" or "burning" must not match. The check is intentionally
// cautious: a false alarm costs one serious reply, a miss costs far more.
// `inner: true` also treats a negator inside the match ("sharp form today, no pain") as a denial.
const BODY_PART = '(?:left\\s+|right\\s+)?(?:leg|foot|ankle|knee|hip|heel|toe|toes)';
const RED_FLAG_PATTERNS = [
  [/\bchest\s+(?:pain|pains|pressure|tightness|hurts|hurting)\b|\bchest\s+feels\s+(?:tight|heavy)\b/, 'chest pain or pressure'],
  [/\b(?:pain|pressure|tightness)\s+(?:in|across|on)\s+(?:my|the)\s+chest\b/, 'chest pain or pressure'],
  [/\b(?:tight|heavy)\s+(?:feeling\s+)?in\s+(?:my|the)\s+chest\b/, 'chest pain or pressure'],
  [/\bshort(?:ness)?\s+of\s+breath\b|\bcan'?t\s+breathe\b/, 'trouble breathing'],
  [/\bheart\s+(?:is\s+)?(?:racing|pounding)\b|\bpalpitations?\b/, 'racing heart'],
  [/\bnumb(?:ness)?\b|\btingl(?:e|es|ing|y)\b|\bpins\s+and\s+needles\b/, 'numbness or tingling'],
  [/\b(?:heard|hear|felt|feel)\s+(?:a\s+|an\s+|something\s+|my\s+\w+\s+)?(?:loud\s+)?(?:pop|snap|tear|rip)\b(?!\s+(?:music|song|songs|culture))/, 'a pop, snap or tear'],
  [/\b(?:heard|felt)\s+a\s+crack\b/, 'a pop, snap or tear'],
  [/\b(?:something|it|my\s+\w+)\s+(?:popped|snapped|tore|ripped)\b/, 'a pop, snap or tear'],
  [/\b(?:sharp|shooting|stabbing|searing|electric)\b[^.!?\n]{0,30}\bpain\b/, 'sharp or shooting pain', { inner: true }],
  [/\bpain\b[^.!?\n]{0,25}\b(?:sharp|shooting|stabbing|radiating)\b/, 'sharp or shooting pain', { inner: true }],
  [/\b(?:faint(?:ed|ing)|(?:feel|felt|feeling)\s+faint|pass(?:ed|ing)\s+out|black(?:ed|ing)\s+out|lost\s+consciousness)\b/, 'fainting'],
  [/\b(?:dizz(?:y|iness)|light[-\s]?headed(?:ness)?|room\s+(?:is\s+|was\s+)?spinning)\b/, 'dizziness'],
  // "put weight on the bar" is a lifting phrase; only a body part or "it" is an injury.
  [new RegExp(`\\b(?:can(?:'|no)?t|cannot|can\\s+not|unable\\s+to|couldn'?t)\\s+(?:even\\s+)?(?:bear\\s+(?:any\\s+)?weight\\b|(?:put|place)\\s+(?:any\\s+)?weight\\s+on\\s+(?:it\\b|(?:my|the)\\s+${BODY_PART}\\b)|stand\\s+on\\s+(?:it\\b|(?:my|the)\\s+${BODY_PART}\\b))`), "can't bear weight"],
  [/\b(?:can(?:'|no)?t|cannot|unable\s+to)\s+walk\s+on\b/, "can't bear weight"],
  [/\b(?:severe|massive|huge|sudden|rapid)\s+swelling\b/, 'severe swelling'],
  [/\b(?:swelled|swollen|swelling)\s+(?:up\s+)?(?:a\s+lot|badly|fast|quickly|like)\b/, 'severe swelling'],
];

// "never" and "without" stay out on purpose: "never had chest pain like this" and "without warning
// I felt a pop" report a new symptom, and a missed red flag costs far more than a false alarm.
const NEGATORS = /^(?:no|not|don't|didn't|isn't|wasn't|dont|didnt)$/;

// "no numbness or tingling", "didn't feel dizzy": a denial within three words earlier in the same
// clause. "but" starts a new clause so "no idea but felt a pop" still flags.
function isNegated(text, index, matched, inner) {
  const clause = text.slice(Math.max(0, index - 40), index).split(/[.,;:!?\n]|\bbut\b/).pop();
  const lead = clause.trim().split(/\s+/).filter(Boolean).slice(-3);
  if (lead.some((word) => NEGATORS.test(word))) return true;
  return inner && matched.split(/\s+/).some((word) => NEGATORS.test(word));
}

export function detectRedFlags(text) {
  if (typeof text !== 'string' || text === '') return { flagged: false, reason: null };
  // Phones type curly apostrophes, which would defeat the can't patterns.
  const normalized = text.toLowerCase().replace(/[‘’]/g, "'");
  for (const [pattern, reason, options] of RED_FLAG_PATTERNS) {
    const global = new RegExp(pattern.source, 'g');
    for (const match of normalized.matchAll(global)) {
      if (!isNegated(normalized, match.index, match[0], options?.inner === true)) return { flagged: true, reason };
    }
  }
  return { flagged: false, reason: null };
}

// Drops the gym-bro act on purpose: this is the one place tone must not be a joke.
export const RED_FLAG_REPLY =
  "Okay, real talk, no hype. Stop training that movement right now. What you described can be something serious, and I can't tell you what it is. " +
  "Get it checked by a doctor or a physical therapist before you lift on it again. " +
  "If it's chest pain or pressure, trouble breathing, or you feel like you might pass out, get urgent medical help now. " +
  "Once you're cleared, I'm here to help you rebuild the plan around it.";

// OpenRouter ids look like "provider/model" with optional ":variant" suffixes. The id is an admin
// setting, so this only guards against junk, not against a model that doesn't exist.
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:+-]*$/i;

export function resolveChadModel(setting) {
  if (typeof setting !== 'string') return DEFAULT_CHAD_MODEL;
  const trimmed = setting.trim();
  if (trimmed.length === 0 || trimmed.length > 100 || !MODEL_ID_PATTERN.test(trimmed)) return DEFAULT_CHAD_MODEL;
  return trimmed;
}
