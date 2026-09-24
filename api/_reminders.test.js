import { describe, it, expect } from 'vitest';
import { localNow, inQuietHours, reminderDecision, reminderPayload } from './_reminders.js';

const today = { date: '2026-09-24', dayName: 'Thursday', hour: 16 };
const plan = { focus: 'Pull', exercises: [{ name: 'Deadlift' }, { name: 'Front Squat' }] };

describe('reminders', () => {
  it('localNow resolves Denver date/day/hour', () => {
    expect(localNow(new Date('2026-09-24T22:00:00Z'))).toEqual(today);
    expect(localNow(new Date('2026-09-25T03:00:00Z')).dayName).toBe('Thursday');
  });

  it('quiet hours handle overnight windows', () => {
    expect(inQuietHours(23, { quiet_start: 22, quiet_end: 8 })).toBe(true);
    expect(inQuietHours(7, { quiet_start: 22, quiet_end: 8 })).toBe(true);
    expect(inQuietHours(16, { quiet_start: 22, quiet_end: 8 })).toBe(false);
    expect(inQuietHours(14, { quiet_start: 13, quiet_end: 15 })).toBe(true);
    expect(inQuietHours(16, {})).toBe(false);
  });

  it('sends when a planned day has nothing logged', () => {
    expect(reminderDecision({ today, dayPlan: plan })).toEqual({ send: true, reason: 'due' });
  });

  it('skips for every reason in priority order', () => {
    expect(reminderDecision({ today, dayPlan: plan, prefs: { reminder: false } }).reason).toBe('opted_out');
    expect(reminderDecision({ today, dayPlan: plan, lastRemindedOn: '2026-09-24' }).reason).toBe('already_reminded');
    expect(reminderDecision({ today: { ...today, hour: 23 }, dayPlan: plan }).reason).toBe('quiet_hours');
    expect(reminderDecision({ today, dayPlan: null }).reason).toBe('rest_day');
    expect(reminderDecision({ today, dayPlan: { exercises: [] } }).reason).toBe('rest_day');
    expect(reminderDecision({ today, dayPlan: plan, completed: true }).reason).toBe('completed');
    expect(reminderDecision({ today, dayPlan: plan, missed: true }).reason).toBe('marked_missed');
    expect(reminderDecision({ today, dayPlan: plan, loggedSets: 3 }).reason).toBe('already_logged');
  });

  it('payload names the focus and count', () => {
    const p = reminderPayload(plan);
    expect(p.title).toContain('Pull');
    expect(p.body).toContain('2 exercises');
  });
});
