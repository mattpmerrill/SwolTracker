import { useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { db } from '../lib/supabase';
import { computeMissingFields, isOnboardingDone } from '../components/AgentOnboarding/status';

const POLL_INTERVAL_MS = 2500;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Agent-driven onboarding: owns the 3-screen state machine and the polling
 * loop that watches the profile row + gym equipment for writes made by the
 * user's connected agent via the MCP tools.
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

    const tick = async () => {
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
        console.error('Agent onboarding poll failed:', err);
      }
    };

    tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    const timeout = setTimeout(() => {
      if (!cancelled) setPollTimeout(true);
    }, POLL_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [screen, user?.id, gymId]);

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
