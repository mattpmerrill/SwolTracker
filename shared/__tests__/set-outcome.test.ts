import { describe, expect, it } from "vitest";
import {
  classifySet,
  consecutiveOutcomeStreak,
  parsePrescription,
  sessionOutcome,
  sessionRepsLabel,
} from "../set-outcome";

describe("parsePrescription", () => {
  it("reads a plain count and the lower bound of a range", () => {
    expect(parsePrescription("8")).toEqual({ kind: "reps", count: 8 });
    expect(parsePrescription(8)).toEqual({ kind: "reps", count: 8 });
    expect(parsePrescription(" 8 ")).toEqual({ kind: "reps", count: 8 });
    expect(parsePrescription("8-10")).toEqual({ kind: "reps", count: 8 });
    expect(parsePrescription("8–10")).toEqual({ kind: "reps", count: 8 });
    expect(parsePrescription("8 reps")).toEqual({ kind: "reps", count: 8 });
  });

  it("reads per-side counts without treating them as free text", () => {
    expect(parsePrescription("8 ea")).toEqual({ kind: "reps", count: 8 });
    expect(parsePrescription("8 ea leg")).toEqual({ kind: "reps", count: 8 });
    expect(parsePrescription("10/leg")).toEqual({ kind: "reps", count: 10 });
    expect(parsePrescription("10x")).toEqual({ kind: "reps", count: 10 });
    expect(parsePrescription("10X")).toEqual({ kind: "reps", count: 10 });
    expect(parsePrescription("10 each leg")).toEqual({ kind: "reps", count: 10 });
  });

  it("never treats a duration as reps", () => {
    for (const value of ["20s", "20 s", "30–40 sec", "30-40 sec", "5 min", "1–3 min", "1-3 min", "0:30", "45 seconds", "2 minutes"]) {
      expect(parsePrescription(value)).toEqual({ kind: "time" });
    }
  });

  it("returns unknown for AMRAP, plus-sets, empty, null, and free text", () => {
    for (const value of ["AMRAP", "1+", "8+", "", "   ", null, undefined, "hold and breathe", "to failure"]) {
      expect(parsePrescription(value)).toEqual({ kind: "unknown" });
    }
  });
});

describe("classifySet", () => {
  it("marks an incomplete row missed even without a count", () => {
    expect(classifySet({ actual_reps: 10, prescribed_reps: 8, completed: false })).toBe("missed");
    expect(classifySet({ actual_reps: null, prescribed_reps: "8", completed: false })).toBe("missed");
  });

  it("marks a ticked set with no count as done_unmeasured, not missed", () => {
    expect(classifySet({ actual_reps: null, prescribed_reps: "8", completed: true })).toBe("done_unmeasured");
    expect(classifySet({ actual_reps: undefined, prescribed_reps: 8, completed: true })).toBe("done_unmeasured");
    expect(classifySet({ actual_reps: "", prescribed_reps: "10x", completed: true })).toBe("done_unmeasured");
    expect(classifySet({ actual_reps: null, prescribed_reps: "20s", completed: true })).toBe("done_unmeasured");
  });

  it("does not compare reps when the prescription is time or unknown", () => {
    expect(classifySet({ actual_reps: 20, prescribed_reps: "20s", completed: true })).toBe("done_unmeasured");
    expect(classifySet({ actual_reps: 5, prescribed_reps: "1–3 min", completed: true })).toBe("done_unmeasured");
    expect(classifySet({ actual_reps: 8, prescribed_reps: "AMRAP", completed: true })).toBe("done_unmeasured");
    expect(classifySet({ actual_reps: 8, prescribed_reps: null, completed: true })).toBe("done_unmeasured");
    expect(classifySet({ actual_reps: 8, prescribed_reps: "1+", completed: true })).toBe("done_unmeasured");
  });

  it("compares numeric actual reps to the prescribed count", () => {
    expect(classifySet({ actual_reps: 7, prescribed_reps: "8-10", completed: true })).toBe("missed");
    expect(classifySet({ actual_reps: 8, prescribed_reps: "8-10", completed: true })).toBe("hit");
    expect(classifySet({ actual_reps: "8", prescribed_reps: "10", completed: true })).toBe("missed");
    expect(classifySet({ actual_reps: 10, prescribed_reps: 8, completed: true })).toBe("hit");
    expect(classifySet({ actual_reps: 0, prescribed_reps: 8, completed: true })).toBe("missed");
  });

  it("treats a missing completed flag as not an explicit miss", () => {
    expect(classifySet({ actual_reps: null, prescribed_reps: "20s" })).toBe("done_unmeasured");
  });
});

describe("sessionOutcome", () => {
  it("is not_logged when there are no rows, and does not invent one", () => {
    expect(sessionOutcome([])).toBe("not_logged");
  });

  it("is missed if any set was missed, hit if any set hit and none missed, else unmeasured", () => {
    expect(sessionOutcome(["hit", "hit"])).toBe("hit");
    expect(sessionOutcome(["hit", "done_unmeasured"])).toBe("hit");
    expect(sessionOutcome(["hit", "missed"])).toBe("missed");
    expect(sessionOutcome(["done_unmeasured", "done_unmeasured"])).toBe("done_unmeasured");
    expect(sessionOutcome(["missed"])).toBe("missed");
  });
});

describe("consecutiveOutcomeStreak", () => {
  it("skips unmeasured sessions instead of breaking or extending a streak", () => {
    expect(consecutiveOutcomeStreak([
      { outcome: "hit" },
      { outcome: "done_unmeasured" },
      { outcome: "hit" },
      { outcome: "hit" },
    ])).toEqual({ consecutiveHits: 3, consecutiveMisses: 0 });

    expect(consecutiveOutcomeStreak([
      { outcome: "hit" },
      { outcome: "done_unmeasured" },
      { outcome: "hit" },
    ])).toEqual({ consecutiveHits: 2, consecutiveMisses: 0 });

    expect(consecutiveOutcomeStreak([
      { outcome: "missed" },
      { outcome: "done_unmeasured" },
      { outcome: "missed" },
    ])).toEqual({ consecutiveHits: 0, consecutiveMisses: 2 });

    expect(consecutiveOutcomeStreak([
      { outcome: "done_unmeasured" },
      { outcome: "done_unmeasured" },
    ])).toEqual({ consecutiveHits: 0, consecutiveMisses: 0 });
  });

  it("still stops a measured streak at the opposite outcome", () => {
    expect(consecutiveOutcomeStreak([
      { outcome: "hit" },
      { outcome: "missed" },
      { outcome: "hit" },
    ])).toEqual({ consecutiveHits: 1, consecutiveMisses: 0 });
  });
});

describe("sessionRepsLabel", () => {
  it("never says missed for an unmeasured session", () => {
    expect(sessionRepsLabel("hit")).toBe("hit reps");
    expect(sessionRepsLabel("missed")).toBe("missed reps");
    expect(sessionRepsLabel("done_unmeasured")).toBe("done (no rep count)");
  });
});
