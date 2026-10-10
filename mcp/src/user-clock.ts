import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_TIME_ZONE,
  calculateCurrentWeek,
  formatCalendarDate,
  getTodayDayName,
  getWeekDates,
  isValidTimeZone,
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
  };
}
