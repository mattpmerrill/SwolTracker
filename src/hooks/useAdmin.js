import { useState, useCallback } from 'react';
import { db } from '../lib/supabase';

/**
 * Hook for managing admin state
 */
export function useAdmin(authUser) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const checkAdmin = useCallback(async (userId) => {
    const result = await db.isAdmin(userId);
    setIsAdmin(result);
  }, []);

  const openAdmin = useCallback(() => setShowAdmin(true), []);
  const closeAdmin = useCallback(() => setShowAdmin(false), []);

  return {
    isAdmin,
    showAdmin,
    checkAdmin,
    openAdmin,
    closeAdmin,
  };
}
