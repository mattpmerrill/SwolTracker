// Pure decision logic for the daily workout reminder (slice 9.4).
// Kept free of I/O so it's unit-tested; api/cron/reminders.js does the fetching.

export const REMINDER_TZ = 'America/Denver';

/** { date: 'YYYY-MM-DD', dayName: 'Thursday', hour: 16 } in the given tz. */
export function localNow(now = new Date(), timeZone = REMINDER_TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dayName: parts.weekday,
    hour: Number(parts.hour),
  };
}

/** True when `hour` falls inside quiet hours (handles overnight windows like 22→8). */
export function inQuietHours(hour, prefs = {}) {
  const start = Number.isFinite(prefs.quiet_start) ? prefs.quiet_start : 22;
  const end = Number.isFinite(prefs.quiet_end) ? prefs.quiet_end : 8;
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** Decide whether to nudge. Returns { send, reason }. */
export function reminderDecision({ prefs = {}, lastRemindedOn, today, dayPlan, loggedSets = 0, completed = false, missed = false }) {
  if (prefs.reminder === false) return { send: false, reason: 'opted_out' };
  if (lastRemindedOn === today.date) return { send: false, reason: 'already_reminded' };
  if (inQuietHours(today.hour, prefs)) return { send: false, reason: 'quiet_hours' };
  const exercises = Array.isArray(dayPlan?.exercises) ? dayPlan.exercises : [];
  if (!dayPlan || exercises.length === 0) return { send: false, reason: 'rest_day' };
  if (completed) return { send: false, reason: 'completed' };
  if (missed) return { send: false, reason: 'marked_missed' };
  if (loggedSets > 0) return { send: false, reason: 'already_logged' };
  return { send: true, reason: 'due' };
}

export function reminderPayload(dayPlan) {
  const focus = dayPlan?.focus ? String(dayPlan.focus) : 'Your workout';
  const count = Array.isArray(dayPlan?.exercises) ? dayPlan.exercises.length : 0;
  return {
    title: `${focus} is waiting 💪`,
    body: count ? `${count} exercises on the board today. Nothing logged yet — go get it.` : 'Nothing logged yet today — go get it.',
    url: '/',
  };
}
