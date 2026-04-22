import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { db } from '../lib/supabase';
import { computeMissingFields, isOnboardingDone } from '../components/AgentOnboarding/status';

const WATCH_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Agent-driven onboarding: owns the 3-screen state machine and subscribes to
 * Supabase realtime events on `app_events` so UI updates fire the instant the
 * user's connected agent writes via MCP tools (program.saved, onboarding.completed, etc).
 */
export function useAgentOnboarding({ user, onComplete, supabase }) {
  const [screen, setScreen] = useState('welcome');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [gymId, setGymId] = useState(null);
  const [apiKey, setApiKey] = useState(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);

  const [profile, setProfile] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [pollTimeout, setPollTimeout] = useState(false);
  const celebratedRef = useRef(false);

  const ensureGym = async () => {
    if (gymId) return gymId;
    const gym = await db.createGym('Personal Gym', user.id);
    if (!gym?.id) throw new Error('Failed to create gym');
    setGymId(gym.id);
    return gym.id;
  };

  const handleConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureGym();
      const { data, error: rpcError } = await supabase.rpc('create_api_key', {
        p_name: 'Onboarding Agent',
        p_scopes: ['read', 'write:logs', 'write:program', 'coach'],
      });
      if (rpcError || !data?.success) {
        throw new Error(rpcError?.message || data?.error || 'API key creation failed');
      }
      setApiKey(data.key);
      setScreen('connect');
    } catch (err) {
      console.error('Agent onboarding connect failed:', err);
      setError(err.message || 'Something went wrong setting up your agent.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoToConfirm = () => {
    setScreen('confirm');
  };

  const handleBack = () => {
    if (screen === 'confirm') setScreen('connect');
    else if (screen === 'connect') setScreen('welcome');
  };

  useEffect(() => {
    if (screen !== 'confirm' || !user?.id) return undefined;
    let cancelled = false;

    const refetch = async () => {
      try {
        const [nextProfile, nextEquipment] = await Promise.all([
          db.getProfile(user.id),
          gymId ? db.getGymEquipment(gymId) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        if (nextProfile) setProfile(nextProfile);
        if (Array.isArray(nextEquipment)) {
          setEquipment(nextEquipment.map((r) => (typeof r === 'string' ? r : r.name)));
        }
        if (isOnboardingDone(nextProfile) && !celebratedRef.current) {
          celebratedRef.current = true;
          confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
          setTimeout(() => {
            confetti({ particleCount: 100, angle: 60, spread: 55, origin: { x: 0 } });
            confetti({ particleCount: 100, angle: 120, spread: 55, origin: { x: 1 } });
          }, 250);
        }
      } catch (err) {
        console.error('Agent onboarding refetch failed:', err);
      }
    };

    refetch();

    const channel = supabase
      .channel(`agent-onboarding:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_events',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          if (!cancelled) refetch();
        }
      )
      .subscribe();

    const timeout = setTimeout(() => {
      if (!cancelled) setPollTimeout(true);
    }, WATCH_TIMEOUT_MS);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      clearTimeout(timeout);
    };
  }, [screen, user?.id, gymId, supabase]);

  const copyToClipboard = (text, setter) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const missingFields = computeMissingFields(profile);
  const done = isOnboardingDone(profile);

  return {
    screen, busy, error,
    apiKey, apiKeyCopied, setApiKeyCopied,
    configCopied, setConfigCopied,
    profile, equipment, missingFields, done, pollTimeout,
    handleConnect, handleGoToConfirm, handleBack,
    copyToClipboard,
    onComplete,
  };
}
