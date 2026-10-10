import { describe, expect, it } from "vitest";
import {
  DEFAULT_TIME_ZONE,
  calculateCurrentWeek,
  formatCalendarDate,
  getTodayDayName,
  isValidTimeZone,
  todayInZone,
} from "../week-math";

/**
 * Sunday 22:30 America/Denver is already Monday on a UTC server.
 * These assertions must not depend on the machine time zone: the zone is explicit.
 */
const SUNDAY_EVENING_MDT = new Date("2026-10-05T04:30:00Z");

describe("week math in a user's time zone", () => {
  it("exports the app default zone used when a profile has none", () => {
    expect(DEFAULT_TIME_ZONE).toBe("America/Denver");
  });

  it("Sunday 22:30 Denver is week 18 Sunday, not next Monday", () => {
    const opts = { now: SUNDAY_EVENING_MDT, timeZone: "America/Denver" };
    expect(calculateCurrentWeek("2026-06-01", opts)).toBe(18);
    expect(getTodayDayName(opts)).toBe("Sunday");
    expect(formatCalendarDate(todayInZone("America/Denver", SUNDAY_EVENING_MDT))).toBe("2026-10-04");
  });

  it("the same instant in UTC is week 19 Monday", () => {
    const opts = { now: SUNDAY_EVENING_MDT, timeZone: "UTC" };
    expect(calculateCurrentWeek("2026-06-01", opts)).toBe(19);
    expect(getTodayDayName(opts)).toBe("Monday");
    expect(formatCalendarDate(todayInZone("UTC", SUNDAY_EVENING_MDT))).toBe("2026-10-05");
  });

  it("without a timeZone, today is the runtime local calendar date of now", () => {
    // Local constructor, so this stays true in any process zone.
    const now = new Date(2026, 9, 4, 22, 30, 0);
    expect(now.getDay()).toBe(0);
    expect(getTodayDayName({ now })).toBe("Sunday");
    expect(calculateCurrentWeek("2026-06-01", { now })).toBe(18);
  });

  it("todayInZone keeps the calendar date across DST boundaries", () => {
    // Fall back: 07:30 UTC is still 01:30 MDT on Nov 1, before the 02:00 rollback.
    const fallBack = todayInZone("America/Denver", new Date("2026-11-01T07:30:00Z"));
    expect(formatCalendarDate(fallBack)).toBe("2026-11-01");
    expect(fallBack.getFullYear()).toBe(2026);
    expect(fallBack.getMonth()).toBe(10);
    expect(fallBack.getDate()).toBe(1);

    // Spring forward: 08:30 UTC is 01:30 MST on Mar 8, before the missing 02:00 hour.
    const beforeJump = todayInZone("America/Denver", new Date("2026-03-08T08:30:00Z"));
    expect(formatCalendarDate(beforeJump)).toBe("2026-03-08");
    // 09:30 UTC is 03:30 MDT, after the jump, still Mar 8.
    const afterJump = todayInZone("America/Denver", new Date("2026-03-08T09:30:00Z"));
    expect(formatCalendarDate(afterJump)).toBe("2026-03-08");
  });

  it("rejects zones Intl does not know", () => {
    expect(isValidTimeZone("America/Denver")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("America/Denver ")).toBe(false);
  });
});
