import { useState } from 'react';
import AgentOnboarding from './AgentOnboarding';
import SimpleOnboarding from './SimpleOnboarding';

/**
 * Product onboarding entry — agent-native first, Simple as manual fallback.
 *
 * Primary: AgentOnboarding — MCP agent interviews + writes profile/program.
 * Fallback: SimpleOnboarding — grouped form path ("No agent? Set up manually").
 *
 * Legacy 13-step wizard hard-deleted 2026-07-14 (Phase 1.3 completion).
 */
export default function OnboardingRouter({
  user,
  onComplete,
  onGenerateWorkout,
  supabase,
}) {
  const [path, setPath] = useState('agent'); // 'agent' | 'simple'

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
