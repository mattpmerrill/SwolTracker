/**
 * Feature flag for the agent-native onboarding rewrite.
 *
 * When true:  users enter AgentOnboarding (3 screens) with a fallback
 *             path into SimpleOnboarding (4 screens).
 * When false: users see the legacy 13-step Onboarding wizard.
 *
 * Set VITE_NEW_ONBOARDING_FLOW=true at build time to flip the flag.
 * The old flow stays reachable until the new flow hits its completion
 * target (see AGENT-NATIVE-PLAN.md phase 3.5.4).
 */
export function isNewOnboardingEnabled(env = import.meta.env) {
  const raw = env?.VITE_NEW_ONBOARDING_FLOW;
  if (raw === true) return true;
  if (typeof raw !== 'string') return false;
  return raw.toLowerCase() === 'true' || raw === '1';
}
