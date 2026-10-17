/**
 * One owner for scored blocks (AMRAP / For Time) inside a program day.
 *
 * Program JSON comes from agents and old weeks, so every reader here assumes
 * the day may be half-formed. getDayBlocks is the only place that decides
 * which blocks are real; the web screen and the MCP tools both go through it,
 * so a malformed block can never render in one place and vanish in another.
 */

import { parsePrescription } from "./set-outcome.js";

export type BlockType = "amrap" | "for_time";

export interface WorkoutBlock {
  id: string;
  type: BlockType;
  title: string;
  time_cap_min: number;
  /** Sorted, unique, valid indexes into the day's exercises. */
  exercise_indexes: number[];
  /** For Time only: prescribed rounds ("3 rounds for time"). */
  rounds?: number;
  /** Same benchmark across weeks = the number to beat. */
  benchmark?: string;
  notes?: string;
}

export type DaySection =
  | { kind: "exercise"; index: number }
  | { kind: "block"; block: WorkoutBlock; indexes: number[] };

/** Shape of a stored or entered score. DB rows use null where the API omits. */
export interface BlockScoreFields {
  rounds?: number | null;
  reps?: number | null;
  time_seconds?: number | null;
  capped?: boolean | null;
}

export interface BlockScore extends BlockScoreFields {
  score_type: BlockType;
}

export const BLOCK_ID_RE = /^[a-z0-9-]{1,32}$/;
export const BLOCK_TITLE_MAX = 60;
export const BLOCK_NOTES_MAX = 1000;
export const BLOCK_TIME_CAP_MAX_MIN = 90;

const BLOCK_TYPES: readonly BlockType[] = ["amrap", "for_time"];
const DEFAULT_TITLE: Record<BlockType, string> = { amrap: "AMRAP", for_time: "For Time" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function exerciseCount(day: unknown): number {
  return isRecord(day) && Array.isArray(day.exercises) ? day.exercises.length : 0;
}

/**
 * Valid blocks of a day, in the order written. A block that is malformed, or
 * whose movements were all claimed by an earlier block, is dropped instead of
 * throwing: the Zod schema rejects these on save, but stored weeks predate it.
 */
export function getDayBlocks(day: unknown): WorkoutBlock[] {
  if (!isRecord(day) || !Array.isArray(day.blocks)) return [];
  const count = exerciseCount(day);
  if (count === 0) return [];

  const claimed = new Set<number>();
  const seenIds = new Set<string>();
  const blocks: WorkoutBlock[] = [];

  for (const raw of day.blocks) {
    if (!isRecord(raw)) continue;
    const type = BLOCK_TYPES.find((t) => t === raw.type);
    if (!type) continue;
    const id = raw.id;
    if (typeof id !== "string" || !BLOCK_ID_RE.test(id) || seenIds.has(id)) continue;
    const cap = raw.time_cap_min;
    if (!Number.isInteger(cap) || (cap as number) < 1 || (cap as number) > BLOCK_TIME_CAP_MAX_MIN) continue;
    if (!Array.isArray(raw.exercise_indexes)) continue;

    const indexes = [
      ...new Set(
        raw.exercise_indexes.filter(
          (i): i is number => isNonNegativeInt(i) && i < count && !claimed.has(i),
        ),
      ),
    ].sort((a, b) => a - b);
    if (indexes.length === 0) continue;

    seenIds.add(id);
    indexes.forEach((i) => claimed.add(i));

    const title =
      typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, BLOCK_TITLE_MAX) : DEFAULT_TITLE[type];
    const block: WorkoutBlock = { id, type, title, time_cap_min: cap as number, exercise_indexes: indexes };
    if (type === "for_time" && Number.isInteger(raw.rounds) && (raw.rounds as number) >= 1 && (raw.rounds as number) <= 100) {
      block.rounds = raw.rounds as number;
    }
    if (typeof raw.benchmark === "string" && BLOCK_ID_RE.test(raw.benchmark)) block.benchmark = raw.benchmark;
    if (typeof raw.notes === "string" && raw.notes.trim()) block.notes = raw.notes.slice(0, BLOCK_NOTES_MAX);
    blocks.push(block);
  }
  return blocks;
}

/**
 * The day in display order. A block appears once, where its first movement
 * sits, and its movements are not listed again as separate exercises.
 */
export function buildDaySections(day: unknown): DaySection[] {
  const count = exerciseCount(day);
  const blocks = getDayBlocks(day);
  const blockByFirstIndex = new Map(blocks.map((b) => [b.exercise_indexes[0], b]));
  const inBlock = new Set(blocks.flatMap((b) => b.exercise_indexes));

  const sections: DaySection[] = [];
  for (let index = 0; index < count; index++) {
    const block = blockByFirstIndex.get(index);
    if (block) sections.push({ kind: "block", block, indexes: block.exercise_indexes });
    else if (!inBlock.has(index)) sections.push({ kind: "exercise", index });
  }
  return sections;
}

/**
 * Reps per round from a block movement's `reps` ("10/rd", "10/rd AMRAP", "12",
 * 12). Durations and distances ("30s", "200m") are not rep counts, so they
 * come back null rather than a leading-digit guess.
 */
export function perRoundReps(reps: unknown): number | null {
  if (typeof reps === "number") return Number.isInteger(reps) && reps >= 1 ? reps : null;
  if (typeof reps !== "string") return null;
  const text = reps.trim();
  if (parsePrescription(text).kind === "time") return null;
  // The lookahead is what rejects "200m": digits must end the token or be
  // followed by a per-round / range / multiplier marker.
  const match = /^(\d+)(?=$|[\s/x\-–—])/i.exec(text);
  if (!match) return null;
  const count = Number.parseInt(match[1], 10);
  return count >= 1 ? count : null;
}

/**
 * Splits an AMRAP score into per-movement rep totals so the existing per-set
 * logs (volume, streaks, history) see the work. Extra reps are the partial
 * round: they fill the movements in order, each up to its per-round count,
 * because that is how the round was actually worked through.
 */
export function amrapMovementTotals(
  block: Pick<WorkoutBlock, "exercise_indexes">,
  exercises: ReadonlyArray<{ reps?: unknown }>,
  rounds: number,
  extraReps: number,
): Record<number, number | null> {
  const totals: Record<number, number | null> = {};
  let extraLeft = Math.max(0, Math.floor(extraReps));
  for (const index of block.exercise_indexes) {
    const exercise = exercises[index];
    if (!exercise) continue;
    const perRound = perRoundReps(exercise.reps);
    if (perRound == null) {
      totals[index] = null;
      continue;
    }
    const extra = Math.min(extraLeft, perRound);
    extraLeft -= extra;
    totals[index] = rounds * perRound + extra;
  }
  return totals;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function roundsAndReps(score: BlockScoreFields): string {
  const parts: string[] = [];
  if (score.rounds != null) parts.push(plural(score.rounds, "round"));
  if (score.reps != null && score.reps > 0) parts.push(plural(score.reps, "rep"));
  return parts.join(" + ");
}

export function formatBlockScore(score: BlockScore): string {
  if (score.score_type === "amrap") return roundsAndReps(score) || "0 rounds";
  if (score.capped) {
    const done = roundsAndReps(score);
    return done ? `Capped: ${done}` : "Capped";
  }
  if (score.time_seconds == null) return "No score";
  const minutes = Math.floor(score.time_seconds / 60);
  const seconds = String(score.time_seconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

const finished = (s: BlockScore) => !s.capped && s.time_seconds != null && s.time_seconds > 0;

function compareRoundsThenReps(a: BlockScoreFields, b: BlockScoreFields): number {
  return (a.rounds ?? 0) - (b.rounds ?? 0) || (a.reps ?? 0) - (b.reps ?? 0);
}

/** Positive when `a` is the better score, negative when `b` is, 0 for a tie or mixed types. */
export function compareBlockScores(a: BlockScore, b: BlockScore): number {
  if (a.score_type !== b.score_type) return 0;
  if (a.score_type === "amrap") return compareRoundsThenReps(a, b);
  if (finished(a) && finished(b)) return (b.time_seconds as number) - (a.time_seconds as number);
  if (finished(a)) return 1;
  if (finished(b)) return -1;
  return compareRoundsThenReps(a, b);
}

/**
 * Score validity, shared by the web form, the MCP tool and (as a CHECK) the
 * table. Absent and null are the same: DB rows use null, API calls omit.
 */
export function isValidBlockScore(type: BlockType, score: BlockScoreFields): boolean {
  if (!BLOCK_TYPES.includes(type) || !isRecord(score)) return false;
  const { rounds, reps, time_seconds: time, capped } = score;
  if (rounds != null && !isNonNegativeInt(rounds)) return false;
  if (reps != null && !isNonNegativeInt(reps)) return false;

  if (type === "amrap") {
    return rounds != null && time == null && !capped;
  }
  if (capped) {
    return time == null && (rounds != null || reps != null);
  }
  return typeof time === "number" && Number.isInteger(time) && time > 0;
}

/**
 * The number to beat: the best score for the same benchmark from an EARLIER
 * week. The current week is excluded so re-saving today's score cannot beat
 * itself, and a different score type is skipped because an AMRAP and a For
 * Time under one slug are not comparable.
 */
export function bestPreviousScore<T extends BlockScore & { week_number: number; benchmark?: string | null }>(
  rows: readonly T[],
  benchmark: string | undefined,
  type: BlockType,
  beforeWeek: number,
): T | null {
  if (!benchmark) return null;
  let best: T | null = null;
  for (const row of rows) {
    if (row.benchmark !== benchmark || row.score_type !== type || row.week_number >= beforeWeek) continue;
    if (!best || compareBlockScores(row, best) > 0) best = row;
  }
  return best;
}
