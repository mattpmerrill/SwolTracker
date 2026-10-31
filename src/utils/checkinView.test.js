import { describe, it, expect } from 'vitest';
import {
  skipReasonCopy,
  ineligibleCopy,
  checkinSettingsView,
  isPastExpiry,
  expiryLabel,
  pickCheckin,
  pickOffer,
  defaultSelectedIds,
  toggleSelected,
  pruneSelected,
  applyButtonLabel,
  describeResult,
  describeDecisionToast,
  describeOfferResult,
  isAckOnly,
  buildCheckinView,
  buildOfferView,
  decisionFromRow,
  offerAnswerFromRow,
  checkinChatSeed,
} from './checkinView';

const change = (id, day = 'Monday') => ({ id, day, summary: 's', reason: 'r', before: null, after: { exercises: [] } });
const row = (over = {}) => ({
  id: 'c1',
  review_week: 3,
  target_week: 4,
  status: 'pending',
  recap: { headline: 'Solid week', wins: ['Bench PR'], watch: ['Sleep'], tone: 'normal' },
  changes: [change('c1'), change('c2', 'Friday')],
  result: null,
  expires_at: '2026-11-03T07:59:59Z', // Monday 23:59:59 in Los Angeles
  ...over,
});

// Sunday 2026-11-01 20:00 in Los Angeles (PST, UTC-8).
const SUNDAY_EVENING = Date.parse('2026-11-02T04:00:00Z');
const LA = 'America/Los_Angeles';

describe('copy', () => {
  it('maps skip reasons to plain words, with a safe fallback', () => {
    expect(skipReasonCopy('already_logged')).toBe('you already started it');
    expect(skipReasonCopy('changed_since_draft')).toBe('that day changed after the draft');
    expect(skipReasonCopy('whatever')).toBe('it could not be applied');
  });

  it('explains why a user cannot use check-ins', () => {
    expect(ineligibleCopy('group_member')).toBe('Only your program owner can use check-ins.');
    expect(ineligibleCopy('no_gym')).toContain('Set up your program');
    expect(ineligibleCopy('rollout')).toContain("aren't open to everyone");
    expect(ineligibleCopy('???')).toContain("aren't available");
  });
});

describe('checkinSettingsView', () => {
  it('hides the card until status is known and when the server has no Temporal', () => {
    expect(checkinSettingsView(null).show).toBe(false);
    expect(checkinSettingsView({ configured: false, eligible: false, enabled: false }).show).toBe(false);
  });

  it('shows the switch for an eligible user, on or off', () => {
    expect(checkinSettingsView({ configured: true, eligible: true, enabled: true })).toMatchObject({ show: true, canToggle: true, enabled: true });
    expect(checkinSettingsView({ configured: true, eligible: true, enabled: false })).toMatchObject({ canToggle: true, enabled: false });
    expect(checkinSettingsView({ configured: true, eligible: false, reason: 'disabled', enabled: false }).canToggle).toBe(true);
  });

  it('hides the card entirely while the rollout is admin only', () => {
    expect(checkinSettingsView({ configured: true, eligible: false, reason: 'rollout', enabled: false })).toEqual({ show: false });
  });

  it('explains instead of toggling for a group member', () => {
    const view = checkinSettingsView({ configured: true, eligible: false, reason: 'group_member', enabled: false });
    expect(view.canToggle).toBe(false);
    expect(view.explanation).toBe('Only your program owner can use check-ins.');
  });

  it('hints at reminders only when push is known to be off', () => {
    const status = { configured: true, eligible: true, enabled: true };
    expect(checkinSettingsView(status, { pushEnabled: false }).pushHint).toContain('workout reminders');
    expect(checkinSettingsView(status, { pushEnabled: true }).pushHint).toBeNull();
    expect(checkinSettingsView(status, { pushEnabled: null }).pushHint).toBeNull();
  });
});

describe('expiry', () => {
  it('detects a deadline in the past', () => {
    expect(isPastExpiry('2026-11-03T07:59:59Z', Date.parse('2026-11-03T08:00:00Z'))).toBe(true);
    expect(isPastExpiry('2026-11-03T07:59:59Z', SUNDAY_EVENING)).toBe(false);
    expect(isPastExpiry(null, SUNDAY_EVENING)).toBe(false);
  });

  it('says "tonight" on the day of the deadline, in the given zone', () => {
    const mondayMorning = Date.parse('2026-11-02T15:00:00Z'); // Monday 07:00 in Los Angeles
    expect(expiryLabel(row().expires_at, mondayMorning, LA)).toBe('Expires tonight');
  });

  it('names the weekday when the deadline is on another day', () => {
    expect(expiryLabel(row().expires_at, SUNDAY_EVENING, LA)).toBe('Expires Monday night');
  });

  it('counts minutes in the last hour, and says Expired afterwards', () => {
    const fortyMinBefore = Date.parse('2026-11-03T07:19:59Z');
    expect(expiryLabel(row().expires_at, fortyMinBefore, LA)).toBe('Expires in 40 min');
    expect(expiryLabel(row().expires_at, Date.parse('2026-11-03T09:00:00Z'), LA)).toBe('Expired');
  });

  it('survives a bad zone name and a missing or bad date', () => {
    expect(expiryLabel(row().expires_at, SUNDAY_EVENING, 'Not/AZone')).toMatch(/^Expires /);
    expect(expiryLabel(null, SUNDAY_EVENING)).toBeNull();
    expect(expiryLabel('nope', SUNDAY_EVENING)).toBeNull();
  });
});

describe('picking', () => {
  it('shows the newest open check-in', () => {
    const rows = [row({ id: 'new' }), row({ id: 'old' })];
    expect(pickCheckin(rows, { now: SUNDAY_EVENING }).id).toBe('new');
  });

  it('ignores drafting, decided and expired-but-unswept rows', () => {
    const rows = [
      row({ id: 'a', status: 'drafting' }),
      row({ id: 'b', status: 'applied' }),
      row({ id: 'c', expires_at: '2026-11-01T00:00:00Z' }),
    ];
    expect(pickCheckin(rows, { now: SUNDAY_EVENING })).toBeNull();
  });

  it('keeps a check-in the user just decided so the result stays visible', () => {
    const rows = [row({ id: 'b', status: 'partial', result: { applied: [], skipped: [] } })];
    expect(pickCheckin(rows, { now: SUNDAY_EVENING, seenIds: ['b'] }).id).toBe('b');
    expect(pickCheckin(rows, { now: SUNDAY_EVENING, seenIds: [] })).toBeNull();
  });

  it('prefers an open check-in over a decided one', () => {
    const rows = [row({ id: 'open' }), row({ id: 'done', status: 'applied' })];
    expect(pickCheckin(rows, { now: SUNDAY_EVENING, seenIds: ['done'] }).id).toBe('open');
  });

  it('handles non-arrays', () => {
    expect(pickCheckin(null)).toBeNull();
    expect(pickOffer(undefined)).toBeNull();
  });

  it('picks the newest open offer', () => {
    const offers = [
      { id: 'o3', status: 'accepted', expires_at: null },
      { id: 'o2', status: 'pending', expires_at: '2026-11-03T07:59:59Z' },
      { id: 'o1', status: 'pending', expires_at: null },
    ];
    expect(pickOffer(offers, SUNDAY_EVENING).id).toBe('o2');
    expect(pickOffer([{ id: 'x', status: 'pending', expires_at: '2026-11-01T00:00:00Z' }], SUNDAY_EVENING)).toBeNull();
  });
});

describe('selection', () => {
  const changes = [change('c1'), change('c2'), change('c3')];

  it('starts with every change ticked', () => {
    expect(defaultSelectedIds(changes)).toEqual(['c1', 'c2', 'c3']);
    expect(defaultSelectedIds(undefined)).toEqual([]);
  });

  it('toggles an id and keeps the order of the changes', () => {
    expect(toggleSelected(['c1', 'c2', 'c3'], 'c2', changes)).toEqual(['c1', 'c3']);
    expect(toggleSelected(['c1', 'c3'], 'c2', changes)).toEqual(['c1', 'c2', 'c3']);
  });

  it('ignores an id that is not a change', () => {
    expect(toggleSelected(['c1'], 'zzz', changes)).toEqual(['c1']);
  });

  it('prunes ids a refreshed card no longer has', () => {
    expect(pruneSelected(['c1', 'gone'], changes)).toEqual(['c1']);
  });

  it('labels the apply button', () => {
    expect(applyButtonLabel(0)).toBe('Apply changes');
    expect(applyButtonLabel(1)).toBe('Apply 1 change');
    expect(applyButtonLabel(4)).toBe('Apply 4 changes');
  });
});

describe('results', () => {
  it('summarises applied and skipped changes', () => {
    const result = { applied: [{ id: 'c1', day: 'Monday' }, { id: 'c2', day: 'Wednesday' }], skipped: [{ id: 'c3', day: 'Friday', reason: 'already_logged' }] };
    expect(describeResult('partial', result)).toBe('Applied 2. Skipped Friday: you already started it.');
    expect(describeResult('applied', { applied: [{ id: 'c1', day: 'Monday' }], skipped: [] })).toBe('Applied 1.');
  });

  it('says nothing was saved when every ticked change conflicted', () => {
    const result = { applied: [], skipped: [{ id: 'c1', day: 'Monday', reason: 'changed_since_draft' }] };
    expect(describeResult('failed', result)).toBe('Nothing was saved. Skipped Monday: that day changed after the draft.');
  });

  it('words a skip, a Got it and an expiry', () => {
    expect(describeResult('declined', null)).toBe('Skipped this week. Nothing changed.');
    expect(describeResult('declined', null, { ackOnly: true })).toBe('Got it. Nothing to change this week.');
    expect(describeResult('expired', null)).toBe('This check-in expired. Nothing changed.');
    expect(describeResult('pending', null)).toBe('');
  });

  it('picks a toast tone', () => {
    expect(describeDecisionToast({ status: 'applied', applied: [{ id: 'c1', day: 'Monday' }], skipped: [] }).tone).toBe('success');
    expect(describeDecisionToast({ status: 'failed', applied: [], skipped: [] }).tone).toBe('warning');
    expect(describeDecisionToast({ status: 'declined', applied: [], skipped: [] }).tone).toBe('info');
  });

  it('words the missed-day answers', () => {
    expect(describeOfferResult({ status: 'accepted', fromDay: 'Tuesday', toDay: 'Saturday' })).toBe('Moved Tuesday to Saturday.');
    expect(describeOfferResult({ status: 'declined', fromDay: 'Tuesday', toDay: 'Saturday' })).toBe('Skipped Tuesday this week.');
  });
});

describe('view models', () => {
  it('builds an open card with an expiry label', () => {
    const view = buildCheckinView(row(), { now: SUNDAY_EVENING, timeZone: LA });
    expect(view).toMatchObject({
      id: 'c1',
      headline: 'Solid week',
      wins: ['Bench PR'],
      watch: ['Sleep'],
      ackOnly: false,
      open: true,
      expiryLabel: 'Expires Monday night',
      resultSummary: null,
    });
    expect(view.changes).toHaveLength(2);
  });

  it('treats zero changes as "Got it" only', () => {
    const quiet = row({ changes: [] });
    expect(isAckOnly(quiet)).toBe(true);
    expect(buildCheckinView(quiet, { now: SUNDAY_EVENING }).ackOnly).toBe(true);
  });

  it('treats a serious recap as "Got it" only and drops stored changes', () => {
    const serious = row({ recap: { headline: 'Check on that knee', wins: [], watch: [], tone: 'serious' } });
    const view = buildCheckinView(serious, { now: SUNDAY_EVENING });
    expect(view.ackOnly).toBe(true);
    expect(view.serious).toBe(true);
    expect(view.changes).toEqual([]);
  });

  it('shows the stored result of a decided check-in, or the session result when there is one', () => {
    const decided = row({ status: 'applied', result: { applied: [{ id: 'c1', day: 'Monday' }], skipped: [] } });
    const view = buildCheckinView(decided, { now: SUNDAY_EVENING });
    expect(view.open).toBe(false);
    expect(view.resultSummary).toBe('Applied 1.');
    const local = { status: 'partial', applied: [{ id: 'c1', day: 'Monday' }], skipped: [{ id: 'c2', day: 'Friday', reason: 'already_logged' }] };
    expect(buildCheckinView(decided, { now: SUNDAY_EVENING, localResult: local }).resultSummary)
      .toBe('Applied 1. Skipped Friday: you already started it.');
  });

  it('closes the card on a session decision even if the stored row still says pending', () => {
    const local = { status: 'declined', applied: [], skipped: [] };
    const view = buildCheckinView(row(), { now: SUNDAY_EVENING, localResult: local });
    expect(view.open).toBe(false);
    expect(view.resultSummary).toBe('Skipped this week. Nothing changed.');
  });

  it('is not open once the deadline passed, even if the worker has not swept it', () => {
    const view = buildCheckinView(row(), { now: Date.parse('2026-11-03T09:00:00Z') });
    expect(view.open).toBe(false);
  });

  it('falls back to a plain headline', () => {
    const view = buildCheckinView(row({ recap: {} }), { now: SUNDAY_EVENING });
    expect(view.headline).toBe('Week 3 check-in');
    expect(view.wins).toEqual([]);
  });

  it('seeds the chat with a short check-in line', () => {
    expect(checkinChatSeed(buildCheckinView(row(), { now: SUNDAY_EVENING }))).toBe("Let's talk about my Week 3 check-in");
  });

  it('builds the missed-day card copy', () => {
    expect(buildOfferView({ id: 'o1', week: 3, from_day: 'Tuesday', to_day: 'Saturday' })).toEqual({
      id: 'o1',
      week: 3,
      fromDay: 'Tuesday',
      toDay: 'Saturday',
      title: 'No Tuesday session logged',
      acceptLabel: 'Move to Saturday',
      declineLabel: 'Skip it this week',
    });
  });
});

describe('rows read back after a timeout', () => {
  it('turns a decided row into a decide-shaped answer, and an open row into null', () => {
    expect(decisionFromRow(row({ status: 'applied', result: { applied: [{ id: 'c1', day: 'Monday' }], skipped: [] } })))
      .toEqual({ status: 'applied', applied: [{ id: 'c1', day: 'Monday' }], skipped: [] });
    expect(decisionFromRow(row({ status: 'declined', result: null }))).toEqual({ status: 'declined', applied: [], skipped: [] });
    expect(decisionFromRow(row())).toBeNull();
    expect(decisionFromRow(undefined)).toBeNull();
  });

  it('turns an answered offer into a result, and anything else into null', () => {
    const offer = { id: 'o1', from_day: 'Tuesday', to_day: 'Saturday' };
    expect(offerAnswerFromRow({ ...offer, status: 'accepted' })).toEqual({ status: 'accepted', fromDay: 'Tuesday', toDay: 'Saturday' });
    expect(offerAnswerFromRow({ ...offer, status: 'pending' })).toBeNull();
    expect(offerAnswerFromRow({ ...offer, status: 'expired' })).toBeNull();
  });
});
