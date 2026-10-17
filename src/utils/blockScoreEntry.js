/**
 * Pure helpers behind the block card: score entry parsing, the payload the
 * schema and repository see, the per-movement set logs a score implies, and
 * the display strings. No React, no I/O, so the rules are testable in Node.
 */
import { amrapMovementTotals, formatBlockScore, compareBlockScores } from './workoutBlocks';
import { formatClock } from './blockTimer';

const COUNT_MAX = 999;

/** `AMRAP · 12 min` or `For Time · 5 rounds · 15 min cap`. */
export function blockBadgeLabel(block) {
  if (block.type === 'amrap') return `AMRAP · ${block.time_cap_min} min`;
  const parts = ['For Time'];
  if (block.rounds) parts.push(`${block.rounds} round${block.rounds === 1 ? '' : 's'}`);
  parts.push(`${block.time_cap_min} min cap`);
  return parts.join(' · ');
}

/** Whole number from an input string, or null when blank or not a plain count. */
export function parseCount(text, max = COUNT_MAX) {
  if (text == null) return null;
  const trimmed = String(text).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return value <= max ? value : null;
}

/** Keeps digits only, so a pasted "5 rounds" or a stray minus cannot reach the field. */
export function cleanCountInput(text) {
  return String(text ?? '').replace(/\D/g, '').slice(0, String(COUNT_MAX).length);
}

/** Stepper button: a blank or invalid field steps from 0, and never leaves 0..max. */
export function stepCount(text, delta, max = COUNT_MAX) {
  const current = parseCount(text, max) ?? 0;
  return String(Math.min(max, Math.max(0, current + delta)));
}

/**
 * `11:42` or `1:05:09` to seconds. A bare number is refused: "12" could be
 * twelve minutes or twelve seconds, and a wrong guess becomes a stored score.
 */
export function parseClockInput(text) {
  if (typeof text !== 'string') return null;
  const match = /^(?:(\d{1,2}):)?(\d{1,3}):([0-5]\d)$/.exec(text.trim());
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  if (hours !== undefined && Number(minutes) > 59) return null;
  const total = Number(hours ?? 0) * 3600 + Number(minutes) * 60 + Number(seconds);
  return total > 0 ? total : null;
}

export function emptyDraft() {
  return { rounds: '', reps: '', finish: '', capped: false, note: '' };
}

/** Form state from a saved score row, for Edit. */
export function draftFromScore(score) {
  if (!score) return emptyDraft();
  return {
    rounds: score.rounds == null ? '' : String(score.rounds),
    reps: score.reps == null ? '' : String(score.reps),
    finish: score.time_seconds == null ? '' : formatClock(score.time_seconds),
    capped: Boolean(score.capped),
    note: score.note ?? '',
  };
}

/**
 * Draft to the object blockScoreSchema validates. Fields that do not apply to
 * the block type are dropped here so the stored row always satisfies the
 * table's CHECK: an AMRAP never carries a time, a finished For Time never
 * carries rounds or reps.
 */
export function buildBlockScoreInput(block, draft) {
  const base = {
    block_id: block.id,
    benchmark: block.benchmark ?? null,
    score_type: block.type,
    note: draft.note?.trim() ? draft.note.trim() : null,
  };
  const rounds = parseCount(draft.rounds);
  const reps = parseCount(draft.reps);

  if (block.type === 'amrap') {
    return { ...base, rounds, reps: rounds == null ? null : (reps ?? 0), time_seconds: null, capped: false };
  }
  if (draft.capped) {
    return { ...base, rounds, reps, time_seconds: null, capped: true };
  }
  return { ...base, rounds: null, reps: null, time_seconds: parseClockInput(draft.finish), capped: false };
}

/** Schema output to the columns we store, with every optional field as null. */
export function cleanBlockScore(parsed) {
  return {
    block_id: parsed.block_id,
    benchmark: parsed.benchmark ?? null,
    score_type: parsed.score_type,
    rounds: parsed.rounds ?? null,
    reps: parsed.reps ?? null,
    time_seconds: parsed.time_seconds ?? null,
    capped: Boolean(parsed.capped),
    note: parsed.note ? parsed.note : null,
  };
}

/**
 * The set-0 log each block movement gets when a score is saved, mirroring the
 * MCP log_block_score tool: completion and streaks count workout_logs rows.
 * AMRAP splits the score into per-movement reps; For Time has no per-movement
 * count, so reps stay null (done, unmeasured).
 */
export function buildBlockMovementLogs(block, exercises, score) {
  const totals = score.score_type === 'amrap'
    ? amrapMovementTotals(block, exercises, score.rounds ?? 0, score.reps ?? 0)
    : {};
  return block.exercise_indexes
    .filter((index) => exercises[index])
    .map((index) => {
      const exercise = exercises[index];
      const weight = exercise.weight_lbs ?? exercise.weight ?? null;
      return {
        exerciseIndex: index,
        setIndex: 0,
        data: {
          exerciseName: exercise.name,
          actualWeight: weight,
          prescribedWeight: weight,
          actualReps: totals[index] ?? null,
          prescribedReps: exercise.reps ?? null,
          // logSet toggles by default; a score save must never un-log a movement.
          completed: true,
        },
      };
    });
}

export function blockScoreKey(dayName, blockId) {
  return `${dayName}|${blockId}`;
}

export function indexBlockScores(rows) {
  const byKey = {};
  for (const row of rows || []) byKey[blockScoreKey(row.day_name, row.block_id)] = row;
  return byKey;
}

export function numberToBeatLabel(previous) {
  return `Number to beat: ${formatBlockScore(previous)} (Week ${previous.week_number})`;
}

export function isNewBest(score, previous) {
  return Boolean(score && previous && compareBlockScores(score, previous) > 0);
}

/** True once any set of the day is logged; the coach's notes collapse by default from then on. */
export function dayHasLoggedSet(exercises, isLogged) {
  return (exercises || []).some((exercise, exerciseIndex) =>
    Array.from({ length: exercise?.sets || 0 }).some((_, setIndex) => isLogged(exerciseIndex, setIndex)),
  );
}

/** The day's coach notes as trimmed text, or null. Program JSON is agent-written, so the type is checked. */
export function getCoachNotes(day) {
  const notes = day?.coach_notes;
  return typeof notes === 'string' && notes.trim() ? notes.trim() : null;
}
