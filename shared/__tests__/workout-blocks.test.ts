import { describe, expect, it } from "vitest";
import {
  amrapMovementTotals,
  bestPreviousScore,
  buildDaySections,
  compareBlockScores,
  formatBlockScore,
  getDayBlocks,
  isValidBlockScore,
  perRoundReps,
  type WorkoutBlock,
} from "../workout-blocks";

const forge: WorkoutBlock = {
  id: "forge",
  type: "amrap",
  title: "Forge AMRAP",
  time_cap_min: 12,
  exercise_indexes: [1, 2, 3, 4],
};

// Saturday "Forge Baseline AMRAP": one strength lift, then four AMRAP movements.
const saturday = {
  focus: "Forge Baseline AMRAP - SCORE IT",
  exercises: [
    { name: "Hang Power Cleans", sets: 3, reps: "3" },
    { name: "Hang Power Cleans", sets: 1, reps: "10/rd", weight_lbs: 95 },
    { name: "Push-Ups", sets: 1, reps: "12/rd" },
    { name: "Bodyweight Squats", sets: 1, reps: "15/rd" },
    { name: "Burpees", sets: 1, reps: "8/rd" },
  ],
  blocks: [forge],
};

describe("getDayBlocks", () => {
  it("returns a valid block as written", () => {
    expect(getDayBlocks(saturday)).toEqual([forge]);
  });

  it("returns [] for days with no blocks, and never throws on messy JSON", () => {
    for (const day of [undefined, null, 5, "x", {}, { exercises: [] }, { blocks: "nope", exercises: [{}] }]) {
      expect(getDayBlocks(day)).toEqual([]);
    }
    expect(getDayBlocks({ exercises: [{}, {}], blocks: [null, 3, "x", []] })).toEqual([]);
  });

  it("drops a block with an unknown type", () => {
    const day = { exercises: [{}, {}], blocks: [{ ...forge, type: "emom", exercise_indexes: [0, 1] }] };
    expect(getDayBlocks(day)).toEqual([]);
  });

  it("drops a block whose indexes are all out of range or not integers", () => {
    const day = { exercises: [{}, {}], blocks: [{ ...forge, exercise_indexes: [5, -1, 1.5, "0"] }] };
    expect(getDayBlocks(day)).toEqual([]);
  });

  it("keeps only the in-range indexes of a partly valid block, sorted and de-duplicated", () => {
    const day = { exercises: [{}, {}, {}], blocks: [{ ...forge, exercise_indexes: [2, 0, 0, 9] }] };
    expect(getDayBlocks(day)[0].exercise_indexes).toEqual([0, 2]);
  });

  it("drops a later block whose indexes were already claimed, and keeps the first", () => {
    const other = { ...forge, id: "finisher", exercise_indexes: [2, 3] };
    const day = { exercises: [{}, {}, {}, {}, {}], blocks: [forge, other] };
    expect(getDayBlocks(day).map((b) => b.id)).toEqual(["forge"]);
  });

  it("removes only the claimed indexes from a later block that has others left", () => {
    const other = { ...forge, id: "finisher", exercise_indexes: [4, 0] };
    const day = { exercises: [{}, {}, {}, {}, {}], blocks: [{ ...forge, exercise_indexes: [1, 2] }, other] };
    expect(getDayBlocks(day).map((b) => [b.id, b.exercise_indexes])).toEqual([
      ["forge", [1, 2]],
      ["finisher", [0, 4]],
    ]);
  });

  it("drops a duplicate id, a bad id, and a time cap outside 1..90", () => {
    const day = {
      exercises: [{}, {}, {}, {}],
      blocks: [
        { ...forge, exercise_indexes: [0] },
        { ...forge, exercise_indexes: [1] }, // same id
        { ...forge, id: "Bad Id!", exercise_indexes: [2] },
        { ...forge, id: "slow", time_cap_min: 91, exercise_indexes: [3] },
        { ...forge, id: "zero", time_cap_min: 0, exercise_indexes: [3] },
      ],
    };
    expect(getDayBlocks(day).map((b) => b.id)).toEqual(["forge"]);
  });

  it("keeps optional fields only when well formed", () => {
    const day = {
      exercises: [{}, {}],
      blocks: [
        { ...forge, exercise_indexes: [0, 1], type: "for_time", rounds: 5, benchmark: "forge", notes: "Pace it" },
        { ...forge, id: "b2", exercise_indexes: [], rounds: "five", benchmark: "NOT A SLUG", notes: 4 },
      ],
    };
    const [first] = getDayBlocks(day);
    expect(first).toMatchObject({ type: "for_time", rounds: 5, benchmark: "forge", notes: "Pace it" });
    const messy = getDayBlocks({
      exercises: [{}],
      blocks: [{ ...forge, exercise_indexes: [0], rounds: "five", benchmark: "NOT A SLUG", notes: 4 }],
    })[0];
    expect(messy.rounds).toBeUndefined();
    expect(messy.benchmark).toBeUndefined();
    expect(messy.notes).toBeUndefined();
  });

  it("falls back to a generic title when the title is missing", () => {
    const day = { exercises: [{}], blocks: [{ ...forge, title: undefined, exercise_indexes: [0] }] };
    expect(getDayBlocks(day)[0].title).toBe("AMRAP");
  });
});

describe("buildDaySections", () => {
  it("places the block at the position of its first index and does not repeat its movements", () => {
    const sections = buildDaySections(saturday);
    expect(sections).toEqual([
      { kind: "exercise", index: 0 },
      { kind: "block", block: forge, indexes: [1, 2, 3, 4] },
    ]);
  });

  it("keeps exercises that sit between and after blocks in order", () => {
    const day = {
      exercises: [{}, {}, {}, {}, {}],
      blocks: [{ ...forge, exercise_indexes: [1, 3] }],
    };
    expect(buildDaySections(day).map((s) => (s.kind === "exercise" ? `e${s.index}` : `b:${s.block.id}`))).toEqual([
      "e0",
      "b:forge",
      "e2",
      "e4",
    ]);
  });

  it("lists every exercise when there are no blocks, and [] for junk", () => {
    expect(buildDaySections({ exercises: [{}, {}] })).toEqual([
      { kind: "exercise", index: 0 },
      { kind: "exercise", index: 1 },
    ]);
    expect(buildDaySections(null)).toEqual([]);
    expect(buildDaySections({ exercises: "x" })).toEqual([]);
  });
});

describe("perRoundReps", () => {
  it("reads the leading integer of per-round prescriptions", () => {
    expect(perRoundReps("10/rd")).toBe(10);
    expect(perRoundReps("10/rd AMRAP")).toBe(10);
    expect(perRoundReps("12")).toBe(12);
    expect(perRoundReps(12)).toBe(12);
    expect(perRoundReps(" 8 reps")).toBe(8);
  });

  it("returns null for anything that is not a rep count", () => {
    expect(perRoundReps("AMRAP")).toBeNull();
    expect(perRoundReps("")).toBeNull();
    expect(perRoundReps(null)).toBeNull();
    expect(perRoundReps(undefined)).toBeNull();
    expect(perRoundReps(-3)).toBeNull();
    expect(perRoundReps(2.5)).toBeNull();
    // A duration or distance is not a rep count, same rule as shared/set-outcome.ts.
    expect(perRoundReps("30s")).toBeNull();
    expect(perRoundReps("30 sec")).toBeNull();
    expect(perRoundReps("200m")).toBeNull();
  });
});

describe("amrapMovementTotals", () => {
  const exercises = saturday.exercises;

  it("fills extra reps in movement order: 5 rounds + 22 over 10/12/15/8", () => {
    expect(amrapMovementTotals(forge, exercises, 5, 22)).toEqual({
      1: 5 * 10 + 10,
      2: 5 * 12 + 12,
      3: 5 * 15,
      4: 5 * 8,
    });
  });

  it("is rounds x per-round when there are no extra reps", () => {
    expect(amrapMovementTotals(forge, exercises, 3, 0)).toEqual({ 1: 30, 2: 36, 3: 45, 4: 24 });
  });

  it("caps extra reps at one round's worth of each movement", () => {
    const totals = amrapMovementTotals(forge, exercises, 0, 11);
    expect(totals).toEqual({ 1: 10, 2: 1, 3: 0, 4: 0 });
  });

  it("returns null for a movement with no per-round count and does not spend extra reps on it", () => {
    const mixed = [{ name: "Run", reps: "200m" }, { name: "Burpees", reps: "8/rd" }];
    const block: WorkoutBlock = { ...forge, exercise_indexes: [0, 1] };
    expect(amrapMovementTotals(block, mixed, 2, 3)).toEqual({ 0: null, 1: 19 });
  });

  it("ignores an index that points past the exercise list", () => {
    const block: WorkoutBlock = { ...forge, exercise_indexes: [4, 9] };
    expect(amrapMovementTotals(block, exercises, 1, 0)).toEqual({ 4: 8 });
  });
});

describe("formatBlockScore", () => {
  it("formats AMRAP scores", () => {
    expect(formatBlockScore({ score_type: "amrap", rounds: 5, reps: 22 })).toBe("5 rounds + 22 reps");
    expect(formatBlockScore({ score_type: "amrap", rounds: 5, reps: 0 })).toBe("5 rounds");
    expect(formatBlockScore({ score_type: "amrap", rounds: 5 })).toBe("5 rounds");
    expect(formatBlockScore({ score_type: "amrap", rounds: 1, reps: 1 })).toBe("1 round + 1 rep");
    expect(formatBlockScore({ score_type: "amrap", rounds: 0, reps: 9 })).toBe("0 rounds + 9 reps");
  });

  it("formats a For Time finish as m:ss", () => {
    expect(formatBlockScore({ score_type: "for_time", time_seconds: 702 })).toBe("11:42");
    expect(formatBlockScore({ score_type: "for_time", time_seconds: 307 })).toBe("5:07");
    expect(formatBlockScore({ score_type: "for_time", time_seconds: 5400, capped: false })).toBe("90:00");
  });

  it("formats a capped For Time score", () => {
    expect(formatBlockScore({ score_type: "for_time", capped: true, rounds: 4, reps: 3 })).toBe(
      "Capped: 4 rounds + 3 reps",
    );
    expect(formatBlockScore({ score_type: "for_time", capped: true, reps: 30 })).toBe("Capped: 30 reps");
    expect(formatBlockScore({ score_type: "for_time", capped: true })).toBe("Capped");
  });
});

describe("compareBlockScores", () => {
  const amrap = (rounds: number, reps = 0) => ({ score_type: "amrap" as const, rounds, reps });
  const done = (time_seconds: number) => ({ score_type: "for_time" as const, time_seconds, capped: false });
  const capped = (rounds: number, reps = 0) => ({ score_type: "for_time" as const, capped: true, rounds, reps });

  it("AMRAP: more rounds wins, then more reps", () => {
    expect(compareBlockScores(amrap(6), amrap(5, 40))).toBeGreaterThan(0);
    expect(compareBlockScores(amrap(5, 22), amrap(5, 10))).toBeGreaterThan(0);
    expect(compareBlockScores(amrap(5, 10), amrap(5, 22))).toBeLessThan(0);
    expect(compareBlockScores(amrap(5, 22), amrap(5, 22))).toBe(0);
  });

  it("For Time: finished beats capped, lower time wins", () => {
    expect(compareBlockScores(done(900), capped(9, 40))).toBeGreaterThan(0);
    expect(compareBlockScores(capped(9, 40), done(900))).toBeLessThan(0);
    expect(compareBlockScores(done(600), done(700))).toBeGreaterThan(0);
    expect(compareBlockScores(done(700), done(600))).toBeLessThan(0);
    expect(compareBlockScores(done(600), done(600))).toBe(0);
  });

  it("For Time capped vs capped: rounds then reps", () => {
    expect(compareBlockScores(capped(4, 3), capped(3, 30))).toBeGreaterThan(0);
    expect(compareBlockScores(capped(4, 10), capped(4, 3))).toBeGreaterThan(0);
  });

  it("mixed types are not comparable", () => {
    expect(compareBlockScores(amrap(5), done(600))).toBe(0);
  });
});

describe("isValidBlockScore", () => {
  it("AMRAP needs rounds; reps default to 0 and time must be absent", () => {
    expect(isValidBlockScore("amrap", { rounds: 5, reps: 22 })).toBe(true);
    expect(isValidBlockScore("amrap", { rounds: 0 })).toBe(true);
    expect(isValidBlockScore("amrap", { reps: 22 })).toBe(false);
    expect(isValidBlockScore("amrap", {})).toBe(false);
    expect(isValidBlockScore("amrap", { rounds: 5, time_seconds: 600 })).toBe(false);
    expect(isValidBlockScore("amrap", { rounds: 5, capped: true })).toBe(false);
    expect(isValidBlockScore("amrap", { rounds: -1 })).toBe(false);
    expect(isValidBlockScore("amrap", { rounds: 1.5 })).toBe(false);
    expect(isValidBlockScore("amrap", { rounds: 5, reps: -2 })).toBe(false);
  });

  it("For Time needs a finish time, or capped with rounds/reps done", () => {
    expect(isValidBlockScore("for_time", { time_seconds: 702 })).toBe(true);
    expect(isValidBlockScore("for_time", { time_seconds: 702, capped: false })).toBe(true);
    expect(isValidBlockScore("for_time", { time_seconds: 0 })).toBe(false);
    expect(isValidBlockScore("for_time", { time_seconds: -5 })).toBe(false);
    expect(isValidBlockScore("for_time", { capped: true, rounds: 4, reps: 3 })).toBe(true);
    expect(isValidBlockScore("for_time", { capped: true, reps: 30 })).toBe(true);
    expect(isValidBlockScore("for_time", { capped: true })).toBe(false);
    expect(isValidBlockScore("for_time", { capped: true, rounds: 4, time_seconds: 700 })).toBe(false);
    expect(isValidBlockScore("for_time", {})).toBe(false);
    expect(isValidBlockScore("for_time", { capped: false })).toBe(false);
  });

  it("rejects unknown types and non-object scores", () => {
    expect(isValidBlockScore("emom" as never, { rounds: 5 })).toBe(false);
    expect(isValidBlockScore("amrap", null as never)).toBe(false);
  });
});

describe("bestPreviousScore", () => {
  const row = (week_number: number, rounds: number, reps = 0, benchmark: string | null = "forge") => ({
    week_number,
    benchmark,
    score_type: "amrap" as const,
    rounds,
    reps,
  });

  it("picks the best earlier score for the benchmark, not the most recent", () => {
    const rows = [row(35, 5, 22), row(36, 4, 10), row(37, 3)];
    expect(bestPreviousScore(rows, "forge", "amrap", 38)?.week_number).toBe(35);
  });

  it("ignores the current and later weeks, other benchmarks, and other score types", () => {
    const rows = [
      row(38, 9),
      row(39, 9),
      row(30, 9, 0, "other"),
      row(31, 9, 0, null),
      { week_number: 32, benchmark: "forge", score_type: "for_time" as const, time_seconds: 600, capped: false },
    ];
    expect(bestPreviousScore(rows, "forge", "amrap", 38)).toBeNull();
  });

  it("returns null with no benchmark or no rows", () => {
    expect(bestPreviousScore([row(1, 1)], undefined, "amrap", 38)).toBeNull();
    expect(bestPreviousScore([], "forge", "amrap", 38)).toBeNull();
  });

  it("works for For Time, where lower is better", () => {
    const t = (week_number: number, time_seconds: number) => ({
      week_number,
      benchmark: "fran",
      score_type: "for_time" as const,
      time_seconds,
      capped: false,
    });
    expect(bestPreviousScore([t(1, 700), t(2, 600), t(3, 650)], "fran", "for_time", 9)?.week_number).toBe(2);
  });
});
