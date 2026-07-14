import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { supabase, db } from './lib/supabase';
import { useSessionContext, ProgramProvider, WorkoutLogProvider } from './contexts';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useOnboardingActions } from './hooks/useOnboardingActions';
import { ROUTES } from './lib/routes';

import LoginPage from './components/LoginPage';
import OnboardingRouter from './components/OnboardingRouter';
import AuthenticatedShell from './components/AuthenticatedShell';

/**
 * Top-level app gate: auth → onboarding → authenticated shell.
 * Domain state (program / workout log) is provided only once the ready
 * bootstrap bundle exists so consumers always see hydrated data.
 */
export default function SwolTracker() {
  const { authUser, authLoading, signOut } = useSessionContext();
  const { isLoading, bundle, onboarding, reload: reloadApp } = useAppBootstrap(authUser);

  if (authLoading || (authUser && isLoading)) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-zinc-400">Loading your gains...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <LoginPage isLoading={authLoading} />;
  }

  if (onboarding) {
    return (
      <OnboardingGate
        onboardingData={onboarding}
        authUser={authUser}
        onComplete={reloadApp}
      />
    );
  }

  if (!bundle) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-zinc-400">Loading your gains...</p>
        </div>
      </div>
    );
  }

  return (
    <ProgramProvider bundle={bundle}>
      <WorkoutLogProvider currentUser={authUser.id} bundle={bundle}>
        <Routes>
          <Route
            path="/*"
            element={(
              <AuthenticatedShell
                authUser={authUser}
                signOut={signOut}
                bundle={bundle}
              />
            )}
          />
        </Routes>
      </WorkoutLogProvider>
    </ProgramProvider>
  );
}

/**
 * Onboarding is a hard gate: any URL redirects into the flow until complete.
 * After complete, parent reloads the bootstrap bundle and leaves this branch.
 */
function OnboardingGate({ onboardingData, authUser, onComplete }) {
  const [gymId, setGymId] = useState(null);
  const { handleGenerateOnboardingWorkout, handlePrepareForAgent } = useOnboardingActions({
    authUser,
    gymId,
    setGymId,
  });

  return (
    <Routes>
      <Route
        path={ROUTES.onboarding}
        element={(
          <OnboardingRouter
            user={onboardingData}
            onComplete={onComplete}
            onGenerateWorkout={handleGenerateOnboardingWorkout}
            onPrepareForAgent={handlePrepareForAgent}
            supabase={supabase}
            db={db}
          />
        )}
      />
      <Route path="*" element={<Navigate to={ROUTES.onboarding} replace />} />
    </Routes>
  );
}
