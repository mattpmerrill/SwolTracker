/**
 * Pure helpers for training-history + overload insights aggregation.
 * Extracted so the insights repo stays focused on data-fetching + shape.
 */
import { calculateCurrentWeek, parseCalendarDate } from '../utils/date'

export const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function getCurrentWeekFromStartDate(programStartDate) {
  if (!programStartDate) return 1
  const start = parseCalendarDate(programStartDate)
  if (Number.isNaN(start.getTime())) return 1
  return calculateCurrentWeek(programStartDate)
}

export function parseReps(value) {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0
  const match = value.match(/\d+/)
  return match ? parseInt(match[0], 10) : 0
}

export function getAverage(values) {
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export function getRecentWeekRange(currentWeek, lookbackWeeks) {
  const safeLookback = Math.max(1, lookbackWeeks || 4)
  return {
    currentWeek,
    fromWeek: Math.max(1, currentWeek - safeLookback + 1),
    lookbackWeeks: safeLookback,
  }
}
