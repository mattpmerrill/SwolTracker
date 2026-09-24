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
