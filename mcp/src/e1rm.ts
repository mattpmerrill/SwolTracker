import { normalizeExerciseName } from "./exercise-normalizer.js";

/**
 * Epley estimated 1RM, weight × (1 + reps / 30). Mirrors src/utils/e1rm.js:
 * only loaded sets with clean 1–10 reps; everything else returns null.
 * (Both copies move into the slice 8 shared core.)
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

export function roundToNearestFive(n: number): number {
  return Math.round(n / 5) * 5;
}

export interface EstimatedPr {
  exercise_name: string;
  estimated_max_lbs: number;
  recorded_max_lbs: number;
  gain_lbs: number;
  from_set: { weight_lbs: number; reps: number };
}

/**
 * Lifts whose best set this week estimates above the recorded 1RM.
 * Only lifts with a recorded max count (no max → no baseline → no PR), and
 * the result is keyed by the recorded max's name.
 */
export function findEstimatedPrs(
  logs: Array<{ exercise_name: string | null; actual_weight: unknown; actual_reps: unknown }>,
  maxes: Record<string, number>,
): EstimatedPr[] {
  const maxByCanonical = new Map<string, { name: string; weight: number }>();
  for (const [name, weight] of Object.entries(maxes)) {
    if (Number.isFinite(weight) && weight > 0) {
      maxByCanonical.set(normalizeExerciseName(name), { name, weight });
    }
  }

  const best = new Map<string, { est: number; weight: number; reps: number }>();
  for (const log of logs) {
    if (!log.exercise_name) continue;
    const est = epleyE1RM(log.actual_weight, log.actual_reps);
    if (est == null) continue;
    const max = maxByCanonical.get(normalizeExerciseName(log.exercise_name));
    if (!max) continue;
    const prev = best.get(max.name);
    if (!prev || est > prev.est) {
      best.set(max.name, { est, weight: Number(log.actual_weight), reps: Number(log.actual_reps) });
    }
  }

  const prs: EstimatedPr[] = [];
  for (const [name, b] of best) {
    const recorded = maxes[name];
    const rounded = roundToNearestFive(b.est);
    if (rounded > recorded) {
      prs.push({
        exercise_name: name,
        estimated_max_lbs: rounded,
        recorded_max_lbs: recorded,
        gain_lbs: rounded - recorded,
        from_set: { weight_lbs: b.weight, reps: b.reps },
      });
    }
  }
  return prs.sort((a, b) => b.gain_lbs - a.gain_lbs);
}
