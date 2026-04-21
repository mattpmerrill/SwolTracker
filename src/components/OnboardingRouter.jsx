import { useState } from 'react';
import Onboarding from './Onboarding';
import AgentOnboarding from './AgentOnboarding';
import SimpleOnboarding from './SimpleOnboarding';
import { isNewOnboardingEnabled } from './OnboardingRouter.flag';

export default function OnboardingRouter({
  user,
  onComplete,
  onGenerateWorkout,
  onPrepareForAgent,
  supabase,
  db,
}) {
  const [path, setPath] = useState('choice');

  if (!isNewOnboardingEnabled()) {
    return (
      <Onboarding
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
