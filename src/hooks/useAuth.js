import { useState, useEffect, useCallback } from 'react';
import { supabase, signInWithGoogle, signOut } from '../lib/supabase';

/**
 * Hook for managing authentication state
 * Handles Google OAuth, session persistence, and demo mode
 */
export function useAuth() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  // Check auth state on mount
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    // Handle OAuth callback and get session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.email);
      setAuthUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handle login (demo mode option)
  const handleLogin = useCallback((options) => {
    if (options?.demoMode) {
      setDemoMode(true);
    }
  }, []);

  // Handle logout
  const handleLogout = useCallback(async () => {
    if (supabase && !demoMode) {
      await signOut();
    }
    setDemoMode(false);
    setAuthUser(null);
  }, [demoMode]);

  // Check if authenticated (either real auth or demo mode)
  const isAuthenticated = Boolean(authUser || demoMode);

  return {
    authUser,
    authLoading,
    demoMode,
    isAuthenticated,
    handleLogin,
    handleLogout,
    signInWithGoogle,
  };
}
