import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Keeps the same user object while the signed-in user is unchanged. supabase-js
 * delivers a fresh object for the same user on TOKEN_REFRESHED / SIGNED_IN
 * (e.g. when a locked phone wakes up); passing that through would look like a
 * new user to every effect keyed on `authUser` and reload the whole app.
 */
export function reconcileAuthUser(prev, next) {
  if (!next) return null;
  if (prev && prev.id === next.id) return prev;
  return next;
}

/**
 * Supabase auth session + auth-state subscription.
 */
export function useSession() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser((prev) => reconcileAuthUser(prev, session?.user ?? null));
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser((prev) => reconcileAuthUser(prev, session?.user ?? null));
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setAuthUser(null);
  };

  return { authUser, authLoading, signOut };
}
