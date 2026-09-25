/**
 * Epley estimated 1RM: weight × (1 + reps / 30).
 * Only loaded sets with clean 1–10 reps are estimable; everything else is null
 * (ranges, AMRAP/failure, timed work, and unloaded/bodyweight rows).
 */
export function epleyE1RM(weight: unknown, reps: unknown): number | null {
  const w = typeof weight === "number" ? weight : Number(weight);
  if (!Number.isFinite(w) || w <= 0) return null;

  const r =
    typeof reps === "number"
      ? reps
      : typeof reps === "string" && /^\d+$/.test(reps.trim())
        ? Number.parseInt(reps, 10)
        : null;

  if (r == null || !Number.isInteger(r) || r < 1 || r > 10) return null;
  return w * (1 + r / 30);
}

/** Round to nearest 5 lbs, matching the app's %1RM working-weight rounding. */
export function roundToNearestFive(n: number): number {
  return Math.round(n / 5) * 5;
}

/**
 * Minimum ratio an Epley estimate must clear over the recorded 1RM to count as a
 * PR. Epley overestimates by ~8% on routine 8–10 rep submaximal sets (e.g. 8 reps
 * @ 85% → 1.077×), so without this margin every prescribed working set looks like
 * a "new max" and quietly ratchets the recorded 1RM upward each session.
 */
export const PR_MIN_MARGIN = 1.10;

/**
 * True when a set's estimated 1RM is a meaningful PR over the recorded max:
 * it must be a finite estimate, clear the margin above `currentMax`, and round
 * above the highest value seen so far (`ceiling` = recorded max and any prior
 * PR this session, so a slightly-better follow-up set doesn't re-fire).
 */
export function isEstimatedPr(
  est: number | null,
  currentMax: number | null | undefined,
  ceiling = 0,
): boolean {
  if (est == null || !Number.isFinite(est)) return false;
  if (!currentMax || !Number.isFinite(currentMax) || currentMax <= 0) return false;
  if (est < currentMax * PR_MIN_MARGIN) return false;
  return roundToNearestFive(est) > Math.max(currentMax, ceiling);
}

