/**
 * @deprecated Phase 1.3 — legacy 13-step wizard only.
 * Shared option lists live in `src/constants/onboardingOptions.js`.
 * This file re-exports them so old step components keep working under the kill switch.
 */

export {
  LOADING_PHRASES,
  FITNESS_GOALS,
  DAYS_OF_WEEK,
  DURATIONS,
  EQUIPMENT,
} from '../../constants/onboardingOptions';

/** Legacy wizard step order — not used by agent-native or simple flows. */
export const STEPS = [
  'welcome', 'agent', 'name', 'gender', 'age', 'weight',
  'goals', 'days', 'duration', 'equipment', 'location',
  'startDate', 'generating',
];
