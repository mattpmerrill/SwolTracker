import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ROUTES,
  isAdminPath,
  isSettingsPath,
  pathToTab,
  tabToPath,
} from '../lib/routes';

/**
 * URL-driven tab + overlay navigation (settings / admin).
 * Overlay routes keep the last tab visible underneath.
 */
export function useAppNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const lastTabRef = useRef('workout');

  const tabFromPath = pathToTab(location.pathname);
  const showSettings = isSettingsPath(location.pathname);
  const showAdmin = isAdminPath(location.pathname);

  useEffect(() => {
    if (tabFromPath) lastTabRef.current = tabFromPath;
  }, [tabFromPath]);

  // Canonicalize bare `/` and unknown paths to the workout tab.
  useEffect(() => {
    const { pathname } = location;
    if (pathToTab(pathname)) return;
    if (isSettingsPath(pathname) || isAdminPath(pathname)) return;
    navigate(ROUTES.workout, { replace: true });
  }, [location.pathname, navigate]);

  const activeTab = tabFromPath || lastTabRef.current;

  const setActiveTab = useCallback((tabId) => {
    navigate(tabToPath(tabId));
  }, [navigate]);

  const openSettings = useCallback(() => {
    navigate(ROUTES.settings);
  }, [navigate]);

  const closeSettings = useCallback(() => {
    navigate(tabToPath(lastTabRef.current));
  }, [navigate]);

  const openAdmin = useCallback(() => {
    navigate(ROUTES.admin);
  }, [navigate]);

  const closeAdmin = useCallback(() => {
    navigate(tabToPath(lastTabRef.current));
  }, [navigate]);

  return {
    activeTab,
    setActiveTab,
    showSettings,
    showAdmin,
    openSettings,
    closeSettings,
    openAdmin,
    closeAdmin,
    location,
    navigate,
  };
}
