// Pure helpers for Chad's weekly check-in: the card, the missed-day offer and the settings switch.
// No React imports, so they run under Vitest in Node. The rows come from src/lib/repositories/
// checkins.js (snake_case, as stored); the shapes are pinned in shared/checkin-contract.ts.

const SKIP_COPY = {
  changed_since_draft: 'that day changed after the draft',
  already_logged: 'you already started it',
};

/** Plain words for why a ticked change was not saved. */
export function skipReasonCopy(reason) {
  return SKIP_COPY[reason] || 'it could not be applied';
}

const INELIGIBLE_COPY = {
  rollout: "Weekly check-ins aren't open to everyone yet.",
  group_member: 'Only your program owner can use check-ins.',
  no_gym: 'Set up your program first, then Chad can check in on it.',
};

/** Why this user cannot turn check-ins on. Same words the server uses on a 403. */
export function ineligibleCopy(reason) {
  return INELIGIBLE_COPY[reason] || "Check-ins aren't available for your account.";
}

/**
 * What the settings card shows for a status from /api/checkin.
 * `pushEnabled`: true, false, or null when unknown (or push is not supported).
 */
export function checkinSettingsView(status, { pushEnabled = null } = {}) {
  // No status yet, or the server has no Temporal set up (a 503): the card stays hidden.
  if (!status || status.configured === false) return { show: false };
  // 'disabled' means eligible with the switch off; the API reports that as enabled: false.
  const reason = status.reason && status.reason !== 'disabled' ? status.reason : null;
  // During the admin-only rollout everyone else would see a dead card; say nothing instead.
  if (reason === 'rollout') return { show: false };
  if (reason) {
    return { show: true, canToggle: false, enabled: false, explanation: ineligibleCopy(reason), pushHint: null };
  }
  return {
    show: true,
    canToggle: true,
    enabled: status.enabled === true,
    explanation: null,
    pushHint: pushEnabled === false
      ? 'Turn on workout reminders above so Chad can nudge you when a check-in is ready.'
      : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------

function dayParts(date, timeZone) {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'long' };
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', timeZone ? { ...options, timeZone } : options);
  } catch {
    // An unknown zone name from stored data: fall back to the device's own zone.
    formatter = new Intl.DateTimeFormat('en-US', options);
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return { key: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday };
}

/** True when a pending row has run past its deadline (the worker has not swept it yet). */
export function isPastExpiry(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  return Number.isFinite(ms) && ms <= now;
}

/**
 * "Expires tonight", "Expires Monday night", "Expires in 40 min", or "Expired".
 * `timeZone` is an IANA name (the user's, where known); without one the device's zone is used.
 */
export function expiryLabel(expiresAt, now = Date.now(), timeZone = undefined) {
  if (!expiresAt) return null;
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return null;
  if (expiry <= now) return 'Expired';
  const minutes = Math.ceil((expiry - now) / 60000);
  if (minutes < 60) return `Expires in ${minutes} min`;
  const today = dayParts(new Date(now), timeZone);
  const target = dayParts(new Date(expiry), timeZone);
  return today.key === target.key ? 'Expires tonight' : `Expires ${target.weekday} night`;
}

// ---------------------------------------------------------------------------------------------
// Picking what to show
// ---------------------------------------------------------------------------------------------

/**
 * Which check-in the card shows: the newest one still open, otherwise one the user just decided
 * in this session (so the result stays on screen). `rows` are newest first.
 */
export function pickCheckin(rows, { now = Date.now(), seenIds = [] } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const open = list.find((row) => row.status === 'pending' && !isPastExpiry(row.expires_at, now));
  if (open) return open;
  return list.find((row) => seenIds.includes(row.id) && row.status !== 'pending' && row.status !== 'drafting') || null;
}

/** The newest missed-day offer that is still open. `rows` are newest first. */
export function pickOffer(rows, now = Date.now()) {
  const list = Array.isArray(rows) ? rows : [];
  return list.find((row) => row.status === 'pending' && !isPastExpiry(row.expires_at, now)) || null;
}

// ---------------------------------------------------------------------------------------------
// Selection and labels
// ---------------------------------------------------------------------------------------------

/** Every change starts ticked. */
export function defaultSelectedIds(changes) {
  return (Array.isArray(changes) ? changes : []).map((change) => change.id);
}

/** Flip one id, keeping the order of `changes` so acceptIds is stable. */
export function toggleSelected(selectedIds, changeId, changes) {
  const next = new Set(selectedIds);
  if (next.has(changeId)) next.delete(changeId);
  else next.add(changeId);
  return (Array.isArray(changes) ? changes : []).map((change) => change.id).filter((id) => next.has(id));
}

/** Drop ids that are no longer in the check-in (a refreshed card). */
export function pruneSelected(selectedIds, changes) {
  const valid = new Set((Array.isArray(changes) ? changes : []).map((change) => change.id));
  return selectedIds.filter((id) => valid.has(id));
}

/** "Apply 2 changes", "Apply 1 change", or the idle "Apply changes" when nothing is ticked. */
export function applyButtonLabel(count) {
  if (!count) return 'Apply changes';
  return `Apply ${count} ${count === 1 ? 'change' : 'changes'}`;
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

/**
 * One plain sentence or two for a decided check-in: "Applied 2. Skipped Friday: you already
 * started it." `result` is { applied, skipped } (the stored row or the decide response).
 */
export function describeResult(status, result, { ackOnly = false } = {}) {
  const applied = Array.isArray(result?.applied) ? result.applied : [];
  const skipped = Array.isArray(result?.skipped) ? result.skipped : [];
  const skippedText = skipped.map((item) => `Skipped ${item.day}: ${skipReasonCopy(item.reason)}.`);

  switch (status) {
    case 'applied':
    case 'partial':
      return [`Applied ${applied.length}.`, ...skippedText].join(' ');
    case 'failed':
      return ['Nothing was saved.', ...skippedText].join(' ');
    case 'declined':
      return ackOnly ? 'Got it. Nothing to change this week.' : 'Skipped this week. Nothing changed.';
    case 'expired':
      return 'This check-in expired. Nothing changed.';
    default:
      return '';
  }
}

/**
 * What a decided row says, in the shape of a decide response. Used after a timeout, when the row is
 * all we have to go on. null while the row is still open.
 */
export function decisionFromRow(row) {
  if (!row || row.status === 'pending' || row.status === 'drafting') return null;
  return {
    status: row.status,
    applied: Array.isArray(row.result?.applied) ? row.result.applied : [],
    skipped: Array.isArray(row.result?.skipped) ? row.result.skipped : [],
  };
}

/** Same for a missed-day offer: { status, fromDay, toDay } once answered, else null. */
export function offerAnswerFromRow(row) {
  if (!row || (row.status !== 'accepted' && row.status !== 'declined')) return null;
  return { status: row.status, fromDay: row.from_day, toDay: row.to_day };
}

/** The toast after a decision, with its tone. */
export function describeDecisionToast(decision, { ackOnly = false } = {}) {
  const text = describeResult(decision.status, decision, { ackOnly });
  const tone = decision.status === 'applied' || decision.status === 'partial'
    ? 'success'
    : decision.status === 'failed' ? 'warning' : 'info';
  return { tone, text };
}

/** The toast after answering a missed-day offer. */
export function describeOfferResult(result) {
  if (result.status === 'accepted') return `Moved ${result.fromDay} to ${result.toDay}.`;
  return `Skipped ${result.fromDay} this week.`;
}

// ---------------------------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------------------------

/** A quiet week or a serious recap has nothing to decide: the card offers "Got it". */
export function isAckOnly(row) {
  const changes = Array.isArray(row?.changes) ? row.changes : [];
  return changes.length === 0 || row?.recap?.tone === 'serious';
}

/**
 * Everything the card needs from a chad_checkins row.
 * `localResult` is the decide response from this session, which can carry more than the row.
 */
export function buildCheckinView(row, { now = Date.now(), timeZone = undefined, localResult = null } = {}) {
  const recap = row.recap || {};
  const changes = Array.isArray(row.changes) ? row.changes : [];
  const ackOnly = isAckOnly(row);
  const expired = row.status === 'pending' && isPastExpiry(row.expires_at, now);
  // A decision made in this session closes the card even if the re-read of the row has not landed.
  const open = row.status === 'pending' && !expired && !localResult;
  const status = localResult?.status || row.status;
  const result = localResult || row.result;

  return {
    id: row.id,
    status,
    reviewWeek: row.review_week,
    targetWeek: row.target_week,
    headline: recap.headline || `Week ${row.review_week} check-in`,
    wins: Array.isArray(recap.wins) ? recap.wins : [],
    watch: Array.isArray(recap.watch) ? recap.watch : [],
    serious: recap.tone === 'serious',
    // A serious recap never offers changes, even if some were stored.
    changes: ackOnly && recap.tone === 'serious' ? [] : changes,
    ackOnly,
    open,
    expiryLabel: open ? expiryLabel(row.expires_at, now, timeZone) : null,
    resultSummary: open ? null : describeResult(status, result, { ackOnly }),
  };
}

/** The short first message "Talk to Chad about it" sends. The server adds the check-in context. */
export function checkinChatSeed(view) {
  return `Let's talk about my Week ${view.reviewWeek} check-in`;
}

/** Everything the missed-day card needs from a chad_missed_offers row. */
export function buildOfferView(row) {
  return {
    id: row.id,
    week: row.week,
    fromDay: row.from_day,
    toDay: row.to_day,
    title: `No ${row.from_day} session logged`,
    acceptLabel: `Move to ${row.to_day}`,
    declineLabel: 'Skip it this week',
  };
}
