import { createContext, useContext } from 'react';
import { useSession } from '../hooks/useSession';

const SessionContext = createContext(null);

/**
 * Auth session boundary. Anything that needs authUser / signOut should read
 * from here instead of calling useSession again (one subscription).
 */
export function SessionProvider({ children }) {
  const session = useSession();
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSessionContext must be used within SessionProvider');
  }
  return ctx;
}
