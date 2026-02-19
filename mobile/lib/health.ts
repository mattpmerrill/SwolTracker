import { Platform } from 'react-native';
import { getItem, setItem, STORAGE_KEYS } from './storage';

// Lazy-load react-native-health to avoid crashing when native module
// isn't available (e.g. simulator builds, non-iOS platforms).
let AppleHealthKit: typeof import('react-native-health').default | null = null;
try {
  AppleHealthKit = require('react-native-health').default;
} catch {
  // HealthKit native module unavailable
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HealthPrefs {
  syncWorkoutsEnabled: boolean;
  readWeightEnabled: boolean;
}

const DEFAULT_PREFS: HealthPrefs = {
  syncWorkoutsEnabled: false,
  readWeightEnabled: false,
};

export interface WorkoutPayload {
  startDate: Date;
  endDate: Date;
  /** Total volume in lbs (weight × reps across all sets) */
  totalVolumeLbs: number;
}

// ── Prefs ─────────────────────────────────────────────────────────────────────

export function loadHealthPrefs(): HealthPrefs {
  return { ...DEFAULT_PREFS, ...(getItem(STORAGE_KEYS.HEALTH_PREFS) || {}) };
}

export function saveHealthPrefs(prefs: HealthPrefs): void {
  setItem(STORAGE_KEYS.HEALTH_PREFS, prefs);
}

// ── Availability ──────────────────────────────────────────────────────────────

export function isHealthKitAvailable(): boolean {
  return Platform.OS === 'ios' && AppleHealthKit !== null;
}

// ── Permissions ───────────────────────────────────────────────────────────────

/**
 * Request HealthKit permissions. Safe to call multiple times — iOS only
 * shows the system dialog on the first call.
 * Returns true if init succeeded (does NOT guarantee write permission was granted —
 * HealthKit never tells you which permissions were denied).
 */
export function initHealthKit(): Promise<boolean> {
  if (!isHealthKitAvailable() || !AppleHealthKit) return Promise.resolve(false);

  const permissions = {
    permissions: {
      read: [AppleHealthKit.Constants.Permissions.BodyMass],
      write: [
        AppleHealthKit.Constants.Permissions.ActiveEnergyBurned,
        AppleHealthKit.Constants.Permissions.Workout,
      ],
    },
  };

  return new Promise((resolve) => {
    AppleHealthKit!.initHealthKit(permissions, (error) => {
      if (error) {
        console.warn('[HealthKit] init error:', error);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// ── Write workout ─────────────────────────────────────────────────────────────

/**
 * Estimate calories burned from total volume.
 * Rough rule of thumb: ~0.07 kcal per lb lifted for strength training.
 */
function estimateCalories(volumeLbs: number): number {
  return Math.round(volumeLbs * 0.07);
}

export function writeWorkoutToHealth(payload: WorkoutPayload): Promise<void> {
  if (!isHealthKitAvailable() || !AppleHealthKit) return Promise.resolve();

  const durationSeconds = Math.round(
    (payload.endDate.getTime() - payload.startDate.getTime()) / 1000
  );
  const calories = estimateCalories(payload.totalVolumeLbs);

  return new Promise((resolve) => {
    AppleHealthKit!.saveWorkout(
      {
        type: AppleHealthKit!.Constants.Activities.TraditionalStrengthTraining,
        startDate: payload.startDate.toISOString(),
        endDate: payload.endDate.toISOString(),
        duration: durationSeconds,
        energyBurned: calories,
        energyBurnedUnit: 'calorie',
      },
      (error) => {
        if (error) console.warn('[HealthKit] saveWorkout error:', error);
        resolve();
      }
    );
  });
}

// ── Read body weight ──────────────────────────────────────────────────────────

/** Returns the most recent body weight in lbs, or null if unavailable. */
export function readLatestBodyWeight(): Promise<number | null> {
  if (!isHealthKitAvailable() || !AppleHealthKit) return Promise.resolve(null);

  return new Promise((resolve) => {
    AppleHealthKit!.getLatestWeight(
      { unit: 'pound' },
      (error, result) => {
        if (error || !result?.value) {
          resolve(null);
        } else {
          resolve(Math.round(result.value));
        }
      }
    );
  });
}
