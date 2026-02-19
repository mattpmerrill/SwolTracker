import { Platform } from 'react-native';
import { getItem, setItem, STORAGE_KEYS } from './storage';

// expo-notifications crashes on simulator builds without push entitlements.
// Use a lazy require so the module loads only when actually called.
let Notifications: typeof import('expo-notifications') | null = null;
try {
  Notifications = require('expo-notifications');
} catch {
  // Native module unavailable (e.g. simulator without signing)
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotificationPrefs {
  remindersEnabled: boolean;
  reminderHour: number;   // 0–23
  summaryEnabled: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  remindersEnabled: false,
  reminderHour: 8,
  summaryEnabled: false,
};

// Identifier prefixes so we can cancel selectively
const REMINDER_PREFIX = 'workout-reminder-';
const REST_TIMER_ID = 'rest-timer';
const WEEKLY_SUMMARY_ID = 'weekly-summary';

// ── Day helpers ───────────────────────────────────────────────────────────────

// iOS Calendar trigger weekday: 1=Sunday, 2=Monday … 7=Saturday
const DAY_TO_WEEKDAY: Record<string, number> = {
  Sunday: 1,
  Monday: 2,
  Tuesday: 3,
  Wednesday: 4,
  Thursday: 5,
  Friday: 6,
  Saturday: 7,
};

// ── Prefs helpers ─────────────────────────────────────────────────────────────

export function loadNotificationPrefs(): NotificationPrefs {
  return { ...DEFAULT_PREFS, ...(getItem(STORAGE_KEYS.NOTIFICATION_PREFS) || {}) };
}

export function saveNotificationPrefs(prefs: NotificationPrefs): void {
  setItem(STORAGE_KEYS.NOTIFICATION_PREFS, prefs);
}

// ── Permission ────────────────────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web' || !Notifications) return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function getNotificationPermissionStatus(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  if (!Notifications) return 'undetermined';
  const { status } = await Notifications.getPermissionsAsync();
  return status as 'granted' | 'denied' | 'undetermined';
}

// ── Workout reminders ─────────────────────────────────────────────────────────

/**
 * Cancel all existing workout reminders then re-schedule for the given days/hour.
 * Call this whenever workout_days or reminder time changes.
 */
export async function scheduleWorkoutReminders(
  workoutDays: string[],
  hour: number
): Promise<void> {
  if (!Notifications) return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(REMINDER_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }

  if (workoutDays.length === 0) return;

  for (const day of workoutDays) {
    const weekday = DAY_TO_WEEKDAY[day];
    if (!weekday) continue;

    await Notifications.scheduleNotificationAsync({
      identifier: `${REMINDER_PREFIX}${day}`,
      content: {
        title: "Time to get Swol 💪",
        body: "Your workout is ready. Let's build something.",
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        repeats: true,
        weekday,
        hour,
        minute: 0,
      },
    });
  }
}

export async function cancelWorkoutReminders(): Promise<void> {
  if (!Notifications) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (n.identifier.startsWith(REMINDER_PREFIX)) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
  }
}

// ── Weekly summary ────────────────────────────────────────────────────────────

export async function scheduleWeeklySummary(): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_SUMMARY_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: WEEKLY_SUMMARY_ID,
    content: {
      title: "Weekly Recap 📊",
      body: "Check out how you crushed it this week.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      repeats: true,
      weekday: 1, // Sunday
      hour: 19,
      minute: 0,
    },
  });
}

export async function cancelWeeklySummary(): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(WEEKLY_SUMMARY_ID);
}

// ── Rest timer ────────────────────────────────────────────────────────────────

/**
 * Schedule a background notification that fires after `seconds`.
 * Called when rest timer starts; cancelled if user skips/dismisses.
 */
export async function scheduleRestTimerNotification(seconds: number): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(REST_TIMER_ID);
  await Notifications.scheduleNotificationAsync({
    identifier: REST_TIMER_ID,
    content: {
      title: "Rest over! ⚡",
      body: "Time to hit your next set.",
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      repeats: false,
    },
  });
}

export async function cancelRestTimerNotification(): Promise<void> {
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(REST_TIMER_ID);
}
