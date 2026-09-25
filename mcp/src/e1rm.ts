import { normalizeExerciseName } from "../../shared/exercises.js";
import { epleyE1RM, roundToNearestFive, isEstimatedPr } from "../../shared/e1rm.js";

export { epleyE1RM, roundToNearestFive, isEstimatedPr };

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
    if (isEstimatedPr(b.est, recorded)) {
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
