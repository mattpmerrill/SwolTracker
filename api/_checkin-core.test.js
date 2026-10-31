import { describe, it, expect } from 'vitest';
import {
  checkinRequestSchema,
  cleanText,
  computeCheckinWindow,
  computeSchedule,
  costFor,
  endOfLocalDay,
  findSlideTarget,
  isRestDay,
  jsonEqual,
  localDayName,
  normalizeDraft,
  parsePrices,
  pushCopy,
  reviewTargetWeeks,
  seriousRecap,
  wasDayMissed,
  weekReviewSchema,
  workerRequestSchema,
} from './_checkin-core.js';

const UID = '3f2b7a52-5d0a-4f3e-9c11-0a6f6a0e8a11';
const CID = '5b8e6f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';
const envelope = { userId: UID, instigation: 'schedule', workflowId: `coach-${UID}`, runId: 'run-1', attempt: 1 };

describe('checkinRequestSchema', () => {
  it('accepts each action', () => {
    for (const body of [
      { action: 'status' },
      { action: 'settings', enabled: true },
      { action: 'decide', checkinId: CID, acceptIds: ['c1', 'c3'] },
      { action: 'decide', checkinId: CID, acceptIds: [] },
      { action: 'missed', offerId: CID, accept: false },
      { action: 'event', type: 'day_missed', week: 4, day: 'Wednesday' },
    ]) {
      expect(checkinRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(true);
    }
  });

  it('rejects bad shapes', () => {
    for (const body of [
      undefined,
      {},
      { action: 'nope' },
      { action: 'settings', enabled: 'yes' },
      { action: 'decide', checkinId: 'not-a-uuid', acceptIds: [] },
      { action: 'decide', checkinId: CID, acceptIds: ['c9'] },
      { action: 'decide', checkinId: CID, acceptIds: ['c1', 'c2', 'c3', 'c4', 'c1'] },
      { action: 'decide', checkinId: CID },
      { action: 'event', type: 'day_missed', week: 0, day: 'Monday' },
      { action: 'event', type: 'day_missed', week: 3, day: 'Someday' },
    ]) {
      expect(checkinRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('never carries a user id through', () => {
    const parsed = checkinRequestSchema.parse({ action: 'settings', enabled: true, userId: 'attacker' });
    expect(parsed).toEqual({ action: 'settings', enabled: true });
  });
});

describe('workerRequestSchema', () => {
  const review = {
    reviewWeek: 3, scheduledDays: ['Monday'], completedDays: ['Monday'], missedDays: [],
    sessions: [], notes: [], recommendations: [],
  };

  it('accepts each op', () => {
    for (const body of [
      { ...envelope, op: 'schedule' },
      { ...envelope, op: 'review', scheduledFor: '2026-03-09T00:00:00.000Z' },
      { ...envelope, op: 'draft', reviewWeek: 3, targetWeek: 4, anchor: '2026-03-09T00:00:00.000Z', review },
      { ...envelope, op: 'notify', kind: 'ready', checkinId: CID },
      { ...envelope, op: 'notify', kind: 'missed', offerId: CID },
      { ...envelope, op: 'apply', checkinId: CID, acceptIds: ['c1'] },
      { ...envelope, op: 'expire', checkinId: CID },
      { ...envelope, op: 'expire', offerId: CID },
      { ...envelope, op: 'missed_check' },
      { ...envelope, op: 'missed_check', week: 3, day: 'Tuesday' },
      { ...envelope, op: 'missed_apply', offerId: CID, accept: true },
    ]) {
      const result = workerRequestSchema.safeParse(body);
      expect(result.success, `${body.op}: ${result.error?.message}`).toBe(true);
    }
  });

  it('rejects incomplete or inconsistent requests', () => {
    for (const body of [
      { ...envelope, op: 'unknown' },
      { ...envelope, op: 'review' },
      { ...envelope, op: 'review', scheduledFor: 'sunday evening' },
      { ...envelope, op: 'apply', acceptIds: [] },
      { ...envelope, op: 'apply', checkinId: CID, acceptIds: ['x'] },
      { ...envelope, op: 'draft', reviewWeek: 3, targetWeek: 5, anchor: '2026-03-09T00:00:00.000Z', review },
      { ...envelope, op: 'draft', reviewWeek: 3, targetWeek: 4, anchor: 'tomorrow', review },
      { ...envelope, op: 'notify', kind: 'ready' },
      { ...envelope, op: 'notify', kind: 'missed', checkinId: CID },
      { ...envelope, op: 'expire' },
      { ...envelope, op: 'expire', checkinId: CID, offerId: CID },
      { ...envelope, op: 'missed_check', week: 3 },
      { ...envelope, op: 'missed_apply', offerId: CID },
      { ...envelope, op: 'schedule', userId: 'nope' },
      { ...envelope, op: 'schedule', attempt: 0 },
      { ...envelope, op: 'schedule', instigation: 'cron' },
    ]) {
      expect(workerRequestSchema.safeParse(body).success, JSON.stringify(body)).toBe(false);
    }
  });

  it('bounds the review the worker hands back', () => {
    const huge = { ...review, notes: [{ day: 'Monday', label: null, text: 'x'.repeat(601) }] };
    expect(weekReviewSchema.safeParse(huge).success).toBe(false);
  });
});

describe('computeSchedule', () => {
  const at = (iso, timeZone) => computeSchedule({ timeZone, now: new Date(iso) });

  it('finds the next Sunday 18:00 and next 09:00 in Denver across the spring-forward', () => {
    // Sat Mar 7 12:00 MST. Sunday Mar 8 is the day the clocks jump (2 AM), so Sunday is MDT.
    const s = at('2026-03-07T19:00:00Z', 'America/Denver');
    expect(s).toEqual({
      timeZone: 'America/Denver',
      nextDailyAt: '2026-03-08T15:00:00.000Z', // 09:00 MDT
      nextCheckinAt: '2026-03-09T00:00:00.000Z', // 18:00 MDT
    });
  });

  it('handles the fall-back day', () => {
    // Sat Oct 31 14:00 MDT. Sunday Nov 1 is MST again.
    const s = at('2026-10-31T20:00:00Z', 'America/Denver');
    expect(s.nextDailyAt).toBe('2026-11-01T16:00:00.000Z'); // 09:00 MST
    expect(s.nextCheckinAt).toBe('2026-11-02T01:00:00.000Z'); // 18:00 MST
  });

  it('is correct east of UTC, where local Sunday starts on a UTC Saturday', () => {
    const s = at('2026-01-10T00:00:00Z', 'Pacific/Auckland'); // Sat 13:00 NZDT
    expect(s.nextDailyAt).toBe('2026-01-10T20:00:00.000Z'); // Sun 09:00 NZDT
    expect(s.nextCheckinAt).toBe('2026-01-11T05:00:00.000Z'); // Sun 18:00 NZDT
  });

  it('handles half-hour offsets and British summer time', () => {
    const india = at('2026-01-10T00:00:00Z', 'Asia/Kolkata'); // Sat 05:30
    expect(india.nextDailyAt).toBe('2026-01-10T03:30:00.000Z');
    expect(india.nextCheckinAt).toBe('2026-01-11T12:30:00.000Z');

    const london = at('2026-06-06T12:00:00Z', 'Europe/London'); // Sat 13:00 BST
    expect(london.nextDailyAt).toBe('2026-06-07T08:00:00.000Z');
    expect(london.nextCheckinAt).toBe('2026-06-07T17:00:00.000Z');
  });

  it('is strictly after now: the instant itself counts as passed', () => {
    expect(at('2026-01-11T17:59:59Z', 'Europe/London').nextCheckinAt).toBe('2026-01-11T18:00:00.000Z');
    expect(at('2026-01-11T18:00:00Z', 'Europe/London').nextCheckinAt).toBe('2026-01-18T18:00:00.000Z');
    expect(at('2026-01-12T09:00:00Z', 'Europe/London').nextDailyAt).toBe('2026-01-13T09:00:00.000Z');
    expect(at('2026-01-12T08:59:59Z', 'Europe/London').nextDailyAt).toBe('2026-01-12T09:00:00.000Z');
  });

  it('uses a UTC server clock correctly: Sunday evening Denver is still Sunday', () => {
    // 2026-01-12T01:00Z is Sunday Jan 11 18:00 MST. The next check-in is a week out, not today.
    const s = at('2026-01-12T01:00:00Z', 'America/Denver');
    expect(s.nextCheckinAt).toBe('2026-01-19T01:00:00.000Z');
  });

  it('falls back to Denver for a missing or invalid zone', () => {
    const denver = at('2026-01-10T00:00:00Z', 'America/Denver');
    expect(at('2026-01-10T00:00:00Z', null)).toEqual(denver);
    expect(at('2026-01-10T00:00:00Z', 'Not/AZone')).toEqual(denver);
    expect(at('2026-01-10T00:00:00Z', ' America/Denver')).toEqual(denver);
  });
});

describe('computeCheckinWindow', () => {
  it('returns the Monday 07:00 reminder and 23:59:59 expiry after the Sunday anchor', () => {
    const w = computeCheckinWindow({ timeZone: 'America/Denver', anchor: new Date('2026-03-09T00:00:00Z') }); // Sun Mar 8 18:00 MDT
    expect(w).toEqual({ reminderAt: '2026-03-09T13:00:00.000Z', expiresAt: '2026-03-10T05:59:59.000Z' });
  });

  it('follows the offset in winter and outside the US', () => {
    expect(computeCheckinWindow({ timeZone: 'America/Denver', anchor: new Date('2026-11-02T01:00:00Z') }))
      .toEqual({ reminderAt: '2026-11-02T14:00:00.000Z', expiresAt: '2026-11-03T06:59:59.000Z' });
    expect(computeCheckinWindow({ timeZone: 'Pacific/Auckland', anchor: new Date('2026-01-11T05:00:00Z') }))
      .toEqual({ reminderAt: '2026-01-11T18:00:00.000Z', expiresAt: '2026-01-12T10:59:59.000Z' });
  });

  it('keeps the same Monday when the run wakes late on Monday', () => {
    const w = computeCheckinWindow({ timeZone: 'America/Denver', anchor: new Date('2026-01-12T15:00:00Z') }); // Mon 08:00 MST
    expect(w.expiresAt).toBe('2026-01-13T06:59:59.000Z');
  });
});

describe('endOfLocalDay and localDayName', () => {
  it('ends the local day, not the UTC day', () => {
    expect(endOfLocalDay({ timeZone: 'America/Denver', at: new Date('2026-01-12T03:00:00Z') })).toBe('2026-01-12T06:59:59.000Z');
    expect(localDayName({ timeZone: 'America/Denver', at: new Date('2026-01-12T03:00:00Z') })).toBe('Sunday');
    expect(localDayName({ timeZone: 'Pacific/Auckland', at: new Date('2026-01-12T03:00:00Z') })).toBe('Monday');
  });
});

describe('reviewTargetWeeks', () => {
  it('at Sunday 18:00 local the week ending is the current week and the target is the next', () => {
    // Program starts Monday Jan 5. Sunday Jan 11 18:00 MST is Jan 12 01:00 UTC.
    const anchor = new Date('2026-01-12T01:00:00Z');
    expect(reviewTargetWeeks({ programStartDate: '2026-01-05', anchor, timeZone: 'America/Denver' }))
      .toEqual({ reviewWeek: 1, targetWeek: 2 });
    // The same instant on a UTC calendar would already be week 2 and review the wrong week.
    expect(reviewTargetWeeks({ programStartDate: '2026-01-05', anchor, timeZone: 'UTC' }))
      .toEqual({ reviewWeek: 2, targetWeek: 3 });
  });

  it('works for a later week, a mid-week start date and no start date', () => {
    const anchor = new Date('2026-01-26T01:00:00Z'); // Sun Jan 25 18:00 MST
    expect(reviewTargetWeeks({ programStartDate: '2026-01-07', anchor, timeZone: 'America/Denver' }))
      .toEqual({ reviewWeek: 3, targetWeek: 4 });
    expect(reviewTargetWeeks({ programStartDate: null, anchor, timeZone: 'America/Denver' }))
      .toEqual({ reviewWeek: 1, targetWeek: 2 });
  });
});

describe('rest days and findSlideTarget', () => {
  const training = { focus: 'Push', exercises: [{ name: 'Bench', sets: 3, reps: '5' }] };
  const week = {
    Monday: training,
    Tuesday: { focus: 'Rest', exercises: [] },
    Wednesday: training,
    Thursday: { focus: 'Rest Day', exercises: [{ name: 'Walk', sets: 1, reps: '30 min' }] },
    // Friday missing
    Saturday: training,
    Sunday: { focus: 'Rest Day', exercises: [] },
  };

  it('treats a missing day, empty exercises or a Rest Day focus as rest', () => {
    expect(isRestDay(undefined)).toBe(true);
    expect(isRestDay(null)).toBe(true);
    expect(isRestDay({ focus: 'Pull' })).toBe(true);
    expect(isRestDay({ focus: 'Pull', exercises: [] })).toBe(true);
    expect(isRestDay({ focus: ' rest day ', exercises: [{ name: 'x' }] })).toBe(true);
    expect(isRestDay(training)).toBe(false);
  });

  it('picks the first rest day strictly after today', () => {
    expect(findSlideTarget(week, 'Monday', 'Monday')).toBe('Tuesday');
    expect(findSlideTarget(week, 'Monday', 'Tuesday')).toBe('Thursday'); // Tuesday itself is not after today
    expect(findSlideTarget(week, 'Wednesday', 'Thursday')).toBe('Friday'); // a missing day is a rest day
    expect(findSlideTarget(week, 'Wednesday', 'Saturday')).toBe('Sunday');
  });

  it('returns null when nothing is left in the week', () => {
    expect(findSlideTarget(week, 'Saturday', 'Sunday')).toBeNull();
    const full = { ...week, Tuesday: training, Thursday: training, Friday: training, Sunday: training };
    expect(findSlideTarget(full, 'Monday', 'Monday')).toBeNull();
  });

  it('never returns the source day or an unknown day, and survives a missing program', () => {
    expect(findSlideTarget(week, 'Thursday', 'Wednesday')).toBe('Friday');
    expect(findSlideTarget(week, 'Monday', 'Funday')).toBeNull();
    expect(findSlideTarget(week, 'Funday', 'Monday')).toBeNull();
    expect(findSlideTarget(null, 'Monday', 'Monday')).toBe('Tuesday');
  });
});

describe('wasDayMissed (mirrors api/cron/reminders.js)', () => {
  const planned = { planned: true, loggedCount: 0, completionCount: 0 };

  it('an unlogged planned day is missed', () => {
    expect(wasDayMissed(planned)).toEqual({ missed: true, reason: 'unlogged' });
  });

  it('a rest day, a completed day and a logged day are not', () => {
    expect(wasDayMissed({ ...planned, planned: false })).toMatchObject({ missed: false, reason: 'rest_day' });
    expect(wasDayMissed({ ...planned, completionCount: 1 })).toMatchObject({ missed: false, reason: 'completed' });
    expect(wasDayMissed({ ...planned, loggedCount: 4 })).toMatchObject({ missed: false, reason: 'already_logged' });
  });

  it('a day the user marked missed counts, whatever the reason, except injury or illness', () => {
    expect(wasDayMissed({ ...planned, missedReason: null })).toMatchObject({ missed: true, reason: 'marked_missed' });
    expect(wasDayMissed({ ...planned, missedReason: 'travel' })).toMatchObject({ missed: true });
    expect(wasDayMissed({ ...planned, missedReason: 'life' })).toMatchObject({ missed: true });
    expect(wasDayMissed({ ...planned, missedReason: 'injury' })).toEqual({ missed: false, reason: 'injury_or_illness' });
    expect(wasDayMissed({ ...planned, missedReason: 'Illness' })).toMatchObject({ missed: false });
    expect(wasDayMissed({ ...planned, missedReason: 'tweaked my shoulder, injured' })).toMatchObject({ missed: false });
    expect(wasDayMissed({ ...planned, missedReason: 'feeling sick' })).toMatchObject({ missed: false });
  });

  it('logged sets and a completion both beat a missed mark (the workout would be scheduled twice)', () => {
    expect(wasDayMissed({ ...planned, loggedCount: 2, missedReason: 'travel' })).toEqual({ missed: false, reason: 'already_logged' });
    expect(wasDayMissed({ ...planned, loggedCount: 2, missedReason: null })).toMatchObject({ missed: false, reason: 'already_logged' });
    expect(wasDayMissed({ ...planned, completionCount: 1, missedReason: 'travel' })).toMatchObject({ missed: false, reason: 'completed' });
  });

  it('does not mistake an ordinary word for an illness', () => {
    expect(wasDayMissed({ ...planned, missedReason: 'family dinner, brilliant night' })).toMatchObject({ missed: true });
  });
});

describe('metering', () => {
  it('parses prices defensively', () => {
    expect(parsePrices('{"input":3,"output":15}')).toEqual({ input: 3, output: 15, valid: true });
    expect(parsePrices({ input: '0.5', output: '2' })).toEqual({ input: 0.5, output: 2, valid: true });
    for (const bad of [null, undefined, '', 'nope', '{}', '{"input":3}', '{"input":-1,"output":2}', '[1,2]', '{"input":"a","output":1}']) {
      expect(parsePrices(bad), String(bad)).toEqual({ input: 0, output: 0, valid: false });
    }
  });

  it('prices tokens per million and rounds to six places', () => {
    const prices = { input: 3, output: 15 };
    expect(costFor({ promptTokens: 1_000_000, completionTokens: 0 }, prices)).toBe(3);
    expect(costFor({ promptTokens: 2000, completionTokens: 500 }, prices)).toBe(0.0135);
    expect(costFor({ promptTokens: 1, completionTokens: 1 }, prices)).toBe(0.000018);
  });

  it('costs nothing without prices or tokens', () => {
    expect(costFor({ promptTokens: 5000, completionTokens: 5000 }, parsePrices(null))).toBe(0);
    expect(costFor({}, { input: 3, output: 15 })).toBe(0);
    expect(costFor({ promptTokens: -5, completionTokens: -5 }, { input: 3, output: 15 })).toBe(0);
    expect(costFor({ promptTokens: 10, completionTokens: 10 }, undefined)).toBe(0);
  });
});

describe('jsonEqual', () => {
  it('ignores key order and treats null like undefined', () => {
    expect(jsonEqual({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(jsonEqual(null, undefined)).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual({}, null)).toBe(false);
    expect(jsonEqual([], {})).toBe(false);
  });
});

describe('cleanText', () => {
  it('trims, flattens whitespace, removes dashes and caps at a word edge', () => {
    expect(cleanText('  Add five pounds \u2014 you earned it  ', 80)).toBe('Add five pounds, you earned it');
    expect(cleanText('a\n\n b\t c', 80)).toBe('a b c');
    expect(cleanText('one two three four five', 14)).toBe('one two three');
    expect(cleanText('x'.repeat(30), 10)).toBe('x'.repeat(10));
    expect(cleanText(42, 10)).toBe('');
  });
});

describe('normalizeDraft', () => {
  const day = (focus, ...names) => ({ focus, exercises: names.map((name) => ({ name, sets: 3, reps: '8' })) });
  const program = {
    Monday: day('Push', 'Bench Press', 'Overhead Press'),
    Tuesday: day('Pull', 'Row'),
    Wednesday: { focus: 'Rest Day', exercises: [] },
    Thursday: day('Legs', 'Squat'),
    Friday: day('Upper', 'Incline Press'),
    Saturday: day('Arms', 'Curl'),
  };
  const edited = (focus, ...names) => day(focus, ...names);
  const change = (dayName, extra = {}) => ({
    day: dayName,
    summary: `Tweak ${dayName}`,
    reason: 'Because the numbers said so.',
    day_data: edited('Edited', 'Swapped Move'),
    ...extra,
  });

  it('keeps valid changes, takes before from the stored program and numbers them in week order', () => {
    const { changes } = normalizeDraft({
      recap: { headline: 'Solid week', wins: ['Bench moved'], watch: ['Sleep'] },
      changes: [
        change('Thursday', { before: { focus: 'Model lied' } }),
        change('Monday'),
      ],
    }, program);

    expect(changes.map((c) => [c.id, c.day])).toEqual([['c1', 'Monday'], ['c2', 'Thursday']]);
    expect(changes[1].before).toEqual(program.Thursday);
    expect(changes[0].before).toBe(program.Monday);
    expect(changes[0].after.exercises[0].name).toBe('Swapped Move');
  });

  it('allows at most four changes and one per day', () => {
    const { changes } = normalizeDraft({
      recap: {},
      changes: [change('Monday'), change('Monday', { summary: 'Second Monday' }), change('Tuesday'), change('Thursday'), change('Friday'), change('Saturday')],
    }, program);
    expect(changes.map((c) => c.day)).toEqual(['Monday', 'Tuesday', 'Thursday', 'Friday']);
    expect(changes.find((c) => c.day === 'Monday').summary).toBe('Tweak Monday');
    expect(changes.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('drops invalid days, rest days, days missing from the program and no-op changes', () => {
    const { changes } = normalizeDraft({
      recap: {},
      changes: [
        change('Someday'),
        change('Wednesday'), // rest day in the stored program
        change('Sunday'), // not in the stored program
        change('Tuesday', { day_data: program.Tuesday }), // equal to before
        change('Thursday', { day_data: { ...program.Thursday } }), // equal again, new object
        change('Friday'),
      ],
    }, program);
    expect(changes.map((c) => c.day)).toEqual(['Friday']);
  });

  it('drops unparseable changes without failing the rest', () => {
    const { changes } = normalizeDraft({
      recap: {},
      changes: [
        null, 'text', 42, [],
        change('Monday', { day_data: null }),
        change('Tuesday', { day_data: { exercises: [] } }),
        change('Thursday', { day_data: { exercises: [{ sets: 3 }] } }),
        change('Friday', { day_data: { exercises: 'lots' } }),
        change('Saturday', { summary: '   ' }),
        change('Monday', { summary: 'Fine one' }),
      ],
    }, program);
    expect(changes.map((c) => c.summary)).toEqual(['Fine one']);
  });

  it('holds the model\'s day to the program\'s own checks and stores the parsed form', () => {
    const ex = (extra = {}) => ({ name: 'Bench', sets: 3, reps: '8', ...extra });
    const { changes } = normalizeDraft({
      recap: {},
      changes: [
        change('Monday', { day_data: { focus: 'Push', exercises: [ex({ reps: 'x'.repeat(17) })] } }), // reps too long
        change('Tuesday', { day_data: { focus: 'Pull', exercises: [ex({ sets: 3.5 })] } }), // fractional sets
        change('Thursday', { day_data: { focus: 'Legs', exercises: [ex({ sets: 0 })] } }), // zero sets
        change('Friday', { day_data: { focus: 'Upper', surprise: 'x', exercises: [ex({ percentages: [70, 75], extra: true })], blocks: [{ id: 'b1', type: 'amrap', title: 'T', time_cap_min: 5, exercise_indexes: [4] }] } }), // block points past the end
        change('Saturday', { day_data: { focus: 'Arms', surprise: 'x', exercises: [ex({ name: 'Curl', extra: true, note: 'slow' })] } }), // fine, with unknown keys
      ],
    }, program);

    expect(changes.map((c) => c.day)).toEqual(['Saturday']);
    // Unknown keys are gone; known optional fields stay.
    expect(changes[0].after).toEqual({ focus: 'Arms', exercises: [{ name: 'Curl', sets: 3, reps: '8', note: 'slow' }] });
  });

  it('compares against the canonical form of before, so a no-op that differs only by stray keys is dropped', () => {
    const noisy = { ...program, Monday: { ...program.Monday, legacyField: 1 } };
    const { changes } = normalizeDraft({ recap: {}, changes: [change('Monday', { day_data: program.Monday })] }, noisy);
    expect(changes).toEqual([]);
  });

  it('survives garbage input', () => {
    for (const raw of [null, undefined, 'x', 5, [], { changes: 'no' }]) {
      const out = normalizeDraft(raw, program);
      expect(out.changes).toEqual([]);
      expect(out.recap).toMatchObject({ headline: 'Week reviewed', wins: [], watch: [], tone: 'normal' });
    }
    expect(normalizeDraft({ changes: [change('Monday')] }, null).changes).toEqual([]);
  });

  it('trims and caps every string, and keeps dashes out of the copy', () => {
    const { recap, changes } = normalizeDraft({
      recap: {
        headline: `  ${'Big week '.repeat(20)}`,
        wins: ['a \u2014 b', 'c', 'd', 'e', ''],
        watch: 'not an array',
      },
      changes: [change('Monday', { summary: 's'.repeat(300), reason: `r ${'x'.repeat(300)} \u2014 end` })],
    }, program);

    expect(recap.headline.length).toBeLessThanOrEqual(80);
    expect(recap.wins).toEqual(['a, b', 'c', 'd']);
    expect(recap.watch).toEqual([]);
    expect(changes[0].summary.length).toBeLessThanOrEqual(120);
    expect(changes[0].reason.length).toBeLessThanOrEqual(160);
    expect(JSON.stringify({ recap, changes })).not.toMatch(/[\u2014\u2013]/);
  });

  it('accepts the model sending after instead of day_data', () => {
    const { changes } = normalizeDraft({ recap: {}, changes: [{ day: 'Monday', summary: 'x', reason: '', after: edited('E', 'New') }] }, program);
    expect(changes).toHaveLength(1);
  });
});

describe('copy', () => {
  it('the serious recap has no changes language and no dashes', () => {
    const recap = seriousRecap('a pop, snap or tear', { scheduled: 4, completed: 3, missed: 1 });
    expect(recap.tone).toBe('serious');
    expect(recap.watch[0]).toContain('a pop, snap or tear');
    expect(recap.stats).toEqual({ scheduled: 4, completed: 3, missed: 1 });
    expect(JSON.stringify(recap)).not.toMatch(/[\u2014\u2013]/);
  });

  it('push copy covers every kind without dashes', () => {
    const all = [
      pushCopy('ready', { changeCount: 2 }),
      pushCopy('ready', { changeCount: 1 }),
      pushCopy('ready', { changeCount: 0 }),
      pushCopy('ready', { tone: 'serious' }),
      pushCopy('reminder'),
      pushCopy('missed', { fromDay: 'Tuesday', toDay: 'Thursday' }),
    ];
    for (const copy of all) {
      expect(copy.title.length).toBeGreaterThan(0);
      expect(`${copy.title} ${copy.body}`).not.toMatch(/[\u2014\u2013]/);
    }
    expect(all[0].body).toContain('2 changes');
    expect(all[1].body).toContain('1 change ');
    expect(all[5].body).toContain('Thursday');
  });
});
