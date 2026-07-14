import { useState, useCallback } from 'react';
import { db } from '../lib/supabase';

/**
 * Admin capability check. Overlay open/close is URL-driven via useAppNavigation
 * (`/admin`); this hook only tracks whether the signed-in user is an admin.
 */
export function useAdmin(_authUser) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  const checkAdmin = useCallback(async (userId) => {
    const result = await db.isAdmin(userId);
    setIsAdmin(result);
    setAdminChecked(true);
  }, []);

  return {
    isAdmin,
    adminChecked,
    checkAdmin,
  };
}
