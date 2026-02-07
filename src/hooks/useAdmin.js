import { useState, useCallback } from 'react';
import { db } from '../lib/supabase';

/**
 * Hook for managing admin state
 */
export function useAdmin(authUser) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const checkAdmin = useCallback((email) => {
    setIsAdmin(db.isAdmin(email));
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
