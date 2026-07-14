import { useState } from 'react';
import AgentOnboarding from './AgentOnboarding';
import SimpleOnboarding from './SimpleOnboarding';
// Soft-archived: only rendered when VITE_NEW_ONBOARDING_FLOW is explicitly off.
// Hard-delete after a completion window (Phase 1.3 follow-up).
import LegacyOnboarding from './Onboarding';
import { isNewOnboardingEnabled } from './OnboardingRouter.flag';

/**
 * Single product onboarding entry (Phase 1.3).
 *
 * Primary: AgentOnboarding — MCP agent interviews + writes profile/program.
 * Fallback: SimpleOnboarding — 4-screen manual path ("No agent? Set up manually").
 * Kill switch: VITE_NEW_ONBOARDING_FLOW=false → legacy 13-step wizard only.
 */
export default function OnboardingRouter({
  user,
  onComplete,
  onGenerateWorkout,
  onPrepareForAgent,
  supabase,
  db,
}) {
  const [path, setPath] = useState('agent'); // 'agent' | 'simple'

  if (!isNewOnboardingEnabled()) {
    return (
      <LegacyOnboarding
        user={user}
        onComplete={onComplete}
        onGenerateWorkout={onGenerateWorkout}
        onPrepareForAgent={onPrepareForAgent}
        supabase={supabase}
        db={db}
      />
    );
  }

  if (path === 'simple') {
    return (
      <SimpleOnboarding
        user={user}
        onComplete={onComplete}
        onGenerateWorkout={onGenerateWorkout}
      />
    );
  }

  return (
    <AgentOnboarding
      user={user}
      onComplete={onComplete}
      onUseFallback={() => setPath('simple')}
      supabase={supabase}
    />
  );
}
