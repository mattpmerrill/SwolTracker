import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_TIME_ZONE,
  calculateCurrentWeek,
  formatCalendarDate,
  formatWeekRange,
  getTodayDayName,
  getWeekDates,
  isValidTimeZone,
  parseCalendarDate,
  todayInZone,
} from "./week-calc.js";

export interface UserClock {
  timeZone: string;
  /** User's calendar date, YYYY-MM-DD. */
  today: string;
  dayName: string;
  currentWeek: number;
  weekStart: string;
  weekEnd: string;
  /** 0–23 in timeZone. Reminder thresholds compare against this, not UTC. */
  hour: number;
  /**
   * Raw profiles.program_start_date. Null means there is no anchor: week 1 is
   * the Monday–Sunday that contains today (weekStart/weekEnd).
   */
  programStartDate: string | null;
}

type ProfileClockRow = {
  program_start_date?: string | null;
  timezone?: string | null;
};

function hourInZone(timeZone: string, now: Date): number {
  const raw = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((part) => part.type === "hour")?.value;
  const hour = Number(raw);
  if (!Number.isFinite(hour)) return 0;
  return hour % 24;
}

/**
 * One profile read for every MCP day/week decision.
 *
 * `timezone` null or invalid falls back to DEFAULT_TIME_ZONE. A null program
 * start is week 1, and weekStart/weekEnd are the Monday–Sunday that contains
 * the user's today (there is no earlier anchor to count from).
 */
export async function resolveUserClock(
  supabase: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<UserClock> {
  const { data } = await supabase
    .from("profiles")
    .select("program_start_date, timezone")
    .eq("id", userId)
    .single();

  const row = (data ?? null) as ProfileClockRow | null;
  const rawZone = row?.timezone;
  const timeZone = typeof rawZone === "string" && isValidTimeZone(rawZone) ? rawZone : DEFAULT_TIME_ZONE;
  const start = row?.program_start_date ?? null;
  const opts = { now, timeZone };
  const todayDate = todayInZone(timeZone, now);
  const currentWeek = calculateCurrentWeek(start, opts);

  // No start date: describe the calendar week that contains today, still as week 1.
  const bounds = start ? getWeekDates(start, currentWeek) : getWeekDates(todayDate, 1);

  return {
    timeZone,
    today: formatCalendarDate(todayDate),
    dayName: getTodayDayName(opts),
    currentWeek,
    weekStart: formatCalendarDate(bounds.start),
    weekEnd: formatCalendarDate(bounds.end),
    hour: hourInZone(timeZone, now),
    programStartDate: start,
  };
}

export interface WeekWindow {
  week_number: number;
  week_start: string;
  week_end: string;
  today: string;
  time_zone: string;
  /** "Mon Oct 5 – Sun Oct 11". For text messages; not a tool data field. */
  range_label: string;
}

/**
 * Monday–Sunday of `weekNumber`, from the profile start date.
 *
 * No program_start_date: there is no earlier anchor. resolveUserClock already
 * describes the Monday–Sunday containing today as week 1 (weekStart/weekEnd).
 * An explicit week number cannot be placed on a calendar without that anchor,
 * so those dates stay week 1's rather than inventing a start date.
 */
export function weekWindowFor(clock: UserClock, weekNumber: number): WeekWindow {
  const bounds = clock.programStartDate
    ? getWeekDates(clock.programStartDate, weekNumber)
    : {
        start: parseCalendarDate(clock.weekStart),
        end: parseCalendarDate(clock.weekEnd),
      };
  return {
    week_number: weekNumber,
    week_start: formatCalendarDate(bounds.start),
    week_end: formatCalendarDate(bounds.end),
    today: clock.today,
    time_zone: clock.timeZone,
    range_label: formatWeekRange(bounds.start, bounds.end),
  };
}
