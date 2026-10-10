/**
 * One owner for "did this set count?"
 *
 * Timed, per-side, and mobility rows are often saved with actual_reps NULL and
 * completed true. Treating that NULL as 0 made every one of them a missed rep.
 * Time prescriptions ("20s", "1–3 min") are not rep counts either — reading the
 * first digits is what turned a 20-second jaw release into 20 missed reps.
 */

export type SetOutcome = "hit" | "missed" | "done_unmeasured" | "not_logged";

/** Outcome of a row that was actually logged. `not_logged` is the absence of rows. */
export type LoggedSetOutcome = Exclude<SetOutcome, "not_logged">;

export type Prescription =
  | { kind: "reps"; count: number }
  | { kind: "time" }
  | { kind: "unknown" };

export interface SetToClassify {
  actual_reps: unknown;
  prescribed_reps: unknown;
  completed?: boolean | null;
}

// "20s" / "20 s", and the words sec(s), second(s), min(s), minute(s). A colon is a clock.
const TIME_RE = /\d\s*s\b|\b(?:secs?|seconds?|mins?|minutes?)\b|:/i;

// Plain count, lower bound of a range, optional per-side marker. Not free text.
const REP_RE =
  /^(\d+)(?:\s*[-–—]\s*\d+)?(?:\s*(?:reps?|x|ea(?:ch)?(?:\s+[a-z]+)?|\/\s*[a-z]+))?$/i;

/**
 * Classify a prescription. Time is detected before any digit is read so a
 * duration can never come back as a rep count.
 */
export function parsePrescription(reps: unknown): Prescription {
  if (typeof reps === "number") {
    if (!Number.isFinite(reps) || !Number.isInteger(reps) || reps < 0) {
      return { kind: "unknown" };
    }
    return { kind: "reps", count: reps };
  }
  if (typeof reps !== "string") return { kind: "unknown" };

  const text = reps.trim();
  if (!text) return { kind: "unknown" };
  if (TIME_RE.test(text)) return { kind: "time" };

  const match = REP_RE.exec(text);
  if (!match) return { kind: "unknown" };
  return { kind: "reps", count: Number.parseInt(match[1], 10) };
}

function isBlank(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function numericActual(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return null;
}

/**
 * A logged set. `completed === false` is a miss even with no count.
 * A ticked set with no count, or a prescription that is not a rep count,
 * is done_unmeasured — it was done, we just cannot score reps.
 */
export function classifySet(set: SetToClassify): LoggedSetOutcome {
  if (set.completed === false) return "missed";
  if (isBlank(set.actual_reps)) return "done_unmeasured";

  const prescription = parsePrescription(set.prescribed_reps);
  if (prescription.kind !== "reps") return "done_unmeasured";

  const actual = numericActual(set.actual_reps);
  if (actual == null) return "done_unmeasured";
  if (actual < prescription.count) return "missed";
  return "hit";
}

/**
 * Roll logged set outcomes into one session outcome.
 * An empty list is `not_logged`: the exercise was prescribed and has no rows.
 * Callers must not invent a row to represent that.
 */
export function sessionOutcome(setOutcomes: readonly LoggedSetOutcome[]): SetOutcome {
  if (setOutcomes.length === 0) return "not_logged";
  if (setOutcomes.some((outcome) => outcome === "missed")) return "missed";
  if (setOutcomes.some((outcome) => outcome === "hit")) return "hit";
  return "done_unmeasured";
}

export interface SessionForStreak {
  outcome: LoggedSetOutcome;
}

/**
 * Newest-first. A done_unmeasured session is skipped: it neither extends nor
 * breaks a hit or miss streak. A block of only unmeasured sessions therefore
 * yields zero hits and zero misses — no level-up and no deload.
 */
export function consecutiveOutcomeStreak(
  sessionsNewestFirst: readonly SessionForStreak[],
): { consecutiveHits: number; consecutiveMisses: number } {
  let consecutiveHits = 0;
  let consecutiveMisses = 0;
  for (const session of sessionsNewestFirst) {
    if (session.outcome === "done_unmeasured") continue;
    if (session.outcome === "hit") {
      if (consecutiveMisses > 0) break;
      consecutiveHits += 1;
    } else {
      if (consecutiveHits > 0) break;
      consecutiveMisses += 1;
    }
  }
  return { consecutiveHits, consecutiveMisses };
}

/** Training-history phrase. Unmeasured work is never called a miss. */
export function sessionRepsLabel(outcome: LoggedSetOutcome): string {
  if (outcome === "hit") return "hit reps";
  if (outcome === "missed") return "missed reps";
  return "done (no rep count)";
}
