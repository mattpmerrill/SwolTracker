import { describe, it, expect } from "vitest";
import { calculateCurrentWeek as webCalcWeek, getWeekDates, parseCalendarDate as webParse } from "../../src/utils/date";
import { getCurrentWeek as mcpGetWeek, parseCalendarDate as mcpParse } from "../../mcp/src/week-calc";
import { epleyE1RM as webEpley } from "../../src/utils/e1rm";
import { epleyE1RM as mcpEpley } from "../../mcp/src/e1rm";
import { normalizeExerciseName } from "../../mcp/src/exercise-normalizer";

const DATES = [
  "2026-01-05", // Monday
  "2026-03-30", // Monday (the calendar-date bug that was fixed twice)
  "2026-08-03", // Monday
  "2026-01-01", // Thursday (mid-week program start)
  "2026-01-04", // Sunday
];

describe("week-math parity: web vs MCP", () => {
  it("parseCalendarDate agrees on every fixture", () => {
    for (const d of DATES) {
      expect(webParse(d).getTime()).toBe(mcpParse(d).getTime());
    }
  });

  it("current-week calculation agrees (fixed twice, never again)", () => {
    for (const d of DATES) {
      expect(webCalcWeek(d)).toBe(mcpGetWeek(d));
    }
    // null program start is treated as week 1 on both sides
    expect(webCalcWeek(null)).toBe(mcpGetWeek(null));
    expect(webCalcWeek(null)).toBe(1);
  });

  it("getWeekDates aligns Monday → Sunday", () => {
    const { start, end } = getWeekDates("2026-03-30", 1);
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getDay()).toBe(0); // Sunday
  });
});

describe("e1rm parity: web vs MCP", () => {
  const cases: Array<[number | null, number | string, number | null]> = [
    [225, 5, 262.5],
    [225, 1, 232.5],
    [225, "5", 262.5],
    [0, 5, null],
    [null, 5, null],
    [225, 0, null],
    [225, 11, null],
    [225, "8-10", null],
    [225, "AMRAP", null],
  ];
  it("produces identical results on every case", () => {
    for (const [w, r] of cases) {
      const a = webEpley(w, r);
      const b = mcpEpley(w, r);
      if (a === null) expect(b).toBeNull();
      else expect(b).toBeCloseTo(a, 1);
    }
  });
});

describe("exercise normalizer", () => {
  it("resolves aliases to canonical names", () => {
    expect(normalizeExerciseName("bench")).toBe("Barbell Bench Press");
    expect(normalizeExerciseName("rdl")).toBe("Romanian Deadlift");
    expect(normalizeExerciseName("squat")).toBe("Barbell Back Squat");
    expect(normalizeExerciseName("ohp")).toBe("Overhead Press");
  });
});
