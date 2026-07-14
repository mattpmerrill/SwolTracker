/**
 * Feature flag for onboarding path selection (Phase 1.3).
 *
 * Default (true / unset): AgentOnboarding (3 screens) with SimpleOnboarding
 *                         fallback ("No agent? Set up manually").
 * Explicit false:         emergency kill switch → legacy 13-step wizard only.
 *
 * Env: VITE_NEW_ONBOARDING_FLOW
 *   true / "true" / "1" / "on" / unset → agent-native path
 *   false / "false" / "0" / "off" / "legacy" → legacy wizard
 *
 * Legacy code remains in-repo for rollback until a completion window
 * proves the new path; then hard-delete (see WEB-ARCHITECTURE-AND-GAME-PLAN.md).
 */
export function isNewOnboardingEnabled(env = import.meta.env) {
  const raw = env?.VITE_NEW_ONBOARDING_FLOW;

  // Explicit boolean from some tooling
  if (raw === true) return true;
  if (raw === false) return false;

  // Unset / non-string → default ON (Phase 1.3 product path)
  if (typeof raw !== 'string') return true;

  const v = raw.trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'off' || v === 'legacy' || v === 'no') {
    return false;
  }
  // empty string, true, 1, on, anything else → new path
  return true;
}
