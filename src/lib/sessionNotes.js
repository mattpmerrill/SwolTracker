import { getItem, setItem } from '../utils/storage';

const PREFIX = 'swoltracker-week-session-notes:';

export function weekSessionNotesKey(week) {
  return `${PREFIX}${week}`;
}

export function getWeekSessionNotes(week) {
  const rows = getItem(weekSessionNotesKey(week));
  return Array.isArray(rows) ? rows : [];
}

/** Last note per day wins. Stores a short label for the week-end prefill. */
export function recordWeekSessionNote(week, day, text, label = null) {
  const body = (text || '').trim();
  if (!body) return getWeekSessionNotes(week);
  const next = [
    ...getWeekSessionNotes(week).filter((row) => row.day !== day),
    { day, text: body, label: label || null },
  ];
  setItem(weekSessionNotesKey(week), next);
  return next;
}
