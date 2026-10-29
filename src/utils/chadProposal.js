// Pure helpers for the proposal card Chad shows before an edit is saved.
// No React imports, so they run under Vitest in Node.

function formatPercentages(percentages) {
  if (!Array.isArray(percentages)) return null;
  const clean = percentages.filter((p) => Number.isFinite(p));
  if (clean.length === 0) return null;
  // A flat 70/70/70 reads better as one number; a ramp keeps every step.
  const allSame = clean.every((p) => p === clean[0]);
  return allSame ? `${clean[0]}%` : `${clean.join('/')}%`;
}

/**
 * Turn a stored Day into display rows: { name, detail }.
 * detail looks like "4 × 8" or "3 × 10 @ 70%". Never throws on a missing or
 * empty day, because `before` is null when Chad is adding a new day.
 */
export function summarizeExercises(day) {
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  return exercises
    .filter((ex) => ex && typeof ex.name === 'string' && ex.name.trim() !== '')
    .map((ex) => {
      const parts = [];
      if (ex.sets != null && ex.reps != null && ex.reps !== '') {
        parts.push(`${ex.sets} × ${ex.reps}`);
      } else if (ex.sets != null) {
        parts.push(`${ex.sets} sets`);
      } else if (ex.reps != null && ex.reps !== '') {
        parts.push(String(ex.reps));
      }
      const pct = formatPercentages(ex.percentages);
      let detail = parts.join('');
      if (pct) detail = detail ? `${detail} @ ${pct}` : `@ ${pct}`;
      return { name: ex.name.trim(), detail };
    });
}

/**
 * Compare two days by exercise name (case-insensitive).
 * Returns { before: [{ name, detail, status }], after: [...] } where status is
 * 'removed' | 'same' on the before side and 'added' | 'same' on the after side.
 * A lift that keeps its name but changes sets or reps still counts as 'same';
 * the detail text shows the change.
 */
export function diffDayExercises(before, after) {
  const beforeRows = summarizeExercises(before);
  const afterRows = summarizeExercises(after);
  const key = (row) => row.name.toLowerCase();
  const afterNames = new Set(afterRows.map(key));
  const beforeNames = new Set(beforeRows.map(key));
  return {
    before: beforeRows.map((row) => ({ ...row, status: afterNames.has(key(row)) ? 'same' : 'removed' })),
    after: afterRows.map((row) => ({ ...row, status: beforeNames.has(key(row)) ? 'same' : 'added' })),
  };
}
