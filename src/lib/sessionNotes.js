import { db } from './supabase';
import { getItem, setItem } from '../utils/storage';

const PREFIX = 'swoltracker-week-session-notes:';

export function weekSessionNotesKey(week) {
  return `${PREFIX}${week}`;
}

function localGet(week) {
  const rows = getItem(weekSessionNotesKey(week));
  return Array.isArray(rows) ? rows : [];
}

function localSet(week, rows) {
  setItem(weekSessionNotesKey(week), rows);
}

/**
 * Session notes for a week, DB-first with localStorage as the offline fallback.
 * Rows keep the legacy { day, text, label } shape so consumers are unchanged.
 */
export async function getWeekSessionNotes(week, userId = null) {
  if (userId) {
    const rows = await db.getSessionNotes(userId, week);
    if (rows.length > 0) return rows;
  }
  return localGet(week);
}

/** Last note per day wins. Persists to DB (when userId) and localStorage. */
export async function recordWeekSessionNote(week, day, text, label = null, userId = null) {
  const body = (text || '').trim();
  if (!body) return localGet(week);

  const next = [
    ...localGet(week).filter((row) => row.day !== day),
    { day, text: body, label: label || null },
  ];
  localSet(week, next);

  if (userId) {
    await db.upsertSessionNote(userId, week, day, body, label);
  }
  return next;
}
