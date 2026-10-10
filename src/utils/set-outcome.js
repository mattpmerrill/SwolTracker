import { sessionRepsLabel } from '../../shared/set-outcome';

export {
  parsePrescription,
  classifySet,
  sessionOutcome,
  consecutiveOutcomeStreak,
  sessionRepsLabel,
} from '../../shared/set-outcome';

/**
 * Label for a training-history session row.
 * Prefer `outcome` so timed or unmeasured work is not called a miss.
 * Rows saved before `outcome` existed only have `hit_all_reps`, which is
 * false for both a miss and unmeasured work — those still read as missed.
 */
export function sessionRepsStatusLabel(session) {
  if (session?.outcome) return sessionRepsLabel(session.outcome);
  return session?.hit_all_reps === true ? 'hit reps' : 'missed reps';
}
