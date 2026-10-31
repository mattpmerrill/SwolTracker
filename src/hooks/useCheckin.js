import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { reloadProgram } from '../lib/reloadProgram';
import { getCheckinStatus, setWeeklyCheckin, decideCheckin, answerMissedDay } from '../lib/checkin';
import { reportWriteFailure, ErrorCategory, ErrorSeverity } from '../lib/errorService';
import {
  pickCheckin,
  pickOffer,
  buildCheckinView,
  buildOfferView,
  isAckOnly,
  decisionFromRow,
  offerAnswerFromRow,
  describeDecisionToast,
  describeOfferResult,
} from '../utils/checkinView';

// Coming back to the tab refreshes the card, but not more than this often.
const FOCUS_REFRESH_MIN_MS = 5000;
// While a card is on screen its expiry label ages, so re-evaluate "now" this often.
const CLOCK_TICK_MS = 60000;

/**
 * Owns Chad's weekly check-in on the web: the newest open check-in and missed-day offer (read from
 * Supabase through RLS, so they show even while the worker is off), the status that drives the
 * settings switch, and the actions. Orchestration only; the display rules live in
 * utils/checkinView.js.
 *
 * A decision that fails with a 503, a timeout or a network error may still have run on the worker,
 * so those paths re-read Supabase and show what is stored before they show any error.
 */
export function useCheckin({ currentUser, programGymId, setWorkoutProgram, toast }) {
  const [checkinRows, setCheckinRows] = useState([]);
  const [offerRows, setOfferRows] = useState([]);
  const [now, setNow] = useState(() => Date.now());
  const [status, setStatus] = useState(null);
  // Check-ins decided in this session stay on screen with their result until dismissed.
  const [seenIds, setSeenIds] = useState([]);
  const [localResults, setLocalResults] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [focusId, setFocusId] = useState(null);

  // Refs, not state: two fast taps must not both pass a stale `busy`, and an async callback must
  // read the latest ids rather than the ones it closed over.
  const actionBusyRef = useRef(false);
  const settingsBusyRef = useRef(false);
  const loadSeqRef = useRef(0);
  const seenRef = useRef([]);
  const lastLoadRef = useRef(0);
  // Whether this user has any reason to poll on focus: their switch is on, or rows already exist.
  const switchOnRef = useRef(false);
  const hasRowsRef = useRef(false);

  const loadRows = useCallback(async () => {
    if (!currentUser) return null;
    const seq = ++loadSeqRef.current;
    const [checkins, offers] = await Promise.all([
      db.getRecentCheckins(currentUser),
      db.getRecentMissedOffers(currentUser),
    ]);
    lastLoadRef.current = Date.now();
    // An older read that lands after a newer one must not roll the card back.
    if (seq === loadSeqRef.current) {
      if (checkins) setCheckinRows(checkins);
      if (checkins?.length || offers?.length) hasRowsRef.current = true;
      if (offers) setOfferRows(offers);
      setNow(Date.now());
    }
    return { checkins, offers };
  }, [currentUser]);

  const refreshStatus = useCallback(async () => {
    try {
      const next = await getCheckinStatus();
      switchOnRef.current = next.enabled === true;
      setStatus(next);
      return next;
    } catch (err) {
      if (err?.errorType === 'offline') {
        // 503: check-ins are not set up on the server. The settings card stays hidden.
        setStatus({ configured: false, eligible: false, enabled: false });
      } else {
        // A status read is not a write; keep what we had and try again next time.
        console.warn('Check-in: could not read status', err?.message);
      }
      return null;
    }
  }, []);

  const reportFailure = useCallback((operation, err, { toastIt = false } = {}) => reportWriteFailure({
    db,
    toast: toastIt ? toast : null,
    userId: currentUser,
    component: 'useCheckin.js',
    operation,
    message: err?.originalError?.message || err?.message || `${operation} failed`,
    // Only checkin.js errors carry a vetted friendly message; anything else falls back.
    userMessage: err?.errorType ? err.message : null,
    originalError: err,
    category: ErrorCategory.NETWORK,
    severity: err?.errorType && err.errorType !== 'default' ? ErrorSeverity.WARNING : ErrorSeverity.ERROR,
    context: { errorType: err?.errorType ?? null, status: err?.status ?? null },
  }), [currentUser, toast]);

  const refreshProgram = useCallback(async () => {
    if (await reloadProgram({ programGymId, setWorkoutProgram })) return true;
    await reportWriteFailure({
      db,
      toast,
      userId: currentUser,
      component: 'useCheckin.js',
      operation: 'refreshProgram',
      message: 'refreshProgram failed',
      userMessage: 'Chad updated your workout, but it did not refresh. Reload to see it.',
      errorType: 'load_failed',
    });
    return false;
  }, [programGymId, setWorkoutProgram, toast, currentUser]);

  // Mount: read the rows. Only ask the server about status when the user has the switch on (or we
  // cannot tell): that call also restarts a workflow that ended, and it is a wasted request for
  // everyone else. The settings card asks again when it opens.
  useEffect(() => {
    if (!currentUser) return undefined;
    let cancelled = false;
    loadRows();
    (async () => {
      const on = await db.getWeeklyCheckinSetting(currentUser);
      if (cancelled) return;
      switchOnRef.current = on === true;
      if (on !== false) refreshStatus();
    })();
    return () => { cancelled = true; };
  }, [currentUser, loadRows, refreshStatus]);

  // Back to the tab (or the window): a push may have just made a new check-in.
  useEffect(() => {
    if (!currentUser || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return undefined;
    const onReturn = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      // A user who never turned this on and has nothing waiting has no reason to be polled.
      if (!switchOnRef.current && !hasRowsRef.current) return;
      if (Date.now() - lastLoadRef.current < FOCUS_REFRESH_MIN_MS) return;
      loadRows();
    };
    window.addEventListener('focus', onReturn);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onReturn);
    };
  }, [currentUser, loadRows]);

  // seenRef mirrors seenIds for async callbacks that must not read a stale closure.
  const updateSeen = useCallback((fn) => {
    const next = fn(seenRef.current);
    seenRef.current = next;
    setSeenIds(next);
  }, []);

  const markSeen = useCallback((id, decision) => {
    updateSeen((prev) => (prev.includes(id) ? prev : [...prev, id]));
    if (decision) setLocalResults((prev) => ({ ...prev, [id]: decision }));
  }, [updateSeen]);

  /** Apply the ticked changes. An empty list is "skip this week" (and "Got it"). */
  const decide = useCallback(async (checkinId, acceptIds) => {
    if (actionBusyRef.current) return false;
    actionBusyRef.current = true;
    setBusy('checkin');
    setError(null);
    try {
      const wasAckOnly = isAckOnly(checkinRows.find((row) => row.id === checkinId));
      let decision = null;
      try {
        decision = await decideCheckin({ checkinId, acceptIds });
      } catch (err) {
        const stale = err?.errorType === 'conflict' || err?.errorType === 'not_found';
        let fresh = null;
        if (err?.mayHaveRun || stale) {
          // No answer is not "no", and a conflict usually means the row closed under us. Look at
          // what is stored before showing anything.
          fresh = await loadRows();
          decision = decisionFromRow(fresh?.checkins?.find((row) => row.id === checkinId));
        }
        if (!decision) {
          await reportFailure('decide', err);
          // The reload can drop the card (it expired, or is gone). An inline error would vanish
          // with it, so say it in a toast instead.
          const gone = stale && fresh?.checkins
            && pickCheckin(fresh.checkins, { now: Date.now(), seenIds: seenRef.current })?.id !== checkinId;
          if (gone) toast.warning(err.message);
          else setError({ target: 'checkin', id: checkinId, message: err.message });
          return false;
        }
      }

      // An expired check-in has no result worth keeping on the card; the toast says it.
      if (decision.status !== 'expired') markSeen(checkinId, decision);
      await loadRows();
      if (decision.applied.length > 0) await refreshProgram();
      const { tone, text } = describeDecisionToast(decision, { ackOnly: wasAckOnly });
      if (text) toast[tone](text);
      return true;
    } finally {
      actionBusyRef.current = false;
      setBusy(null);
    }
  }, [checkinRows, loadRows, refreshProgram, reportFailure, markSeen, toast]);

  /** Move a missed workout to its rest day (accept) or let it go. */
  const answerOffer = useCallback(async (offerId, accept) => {
    if (actionBusyRef.current) return false;
    actionBusyRef.current = true;
    setBusy('offer');
    setError(null);
    try {
      let answer = null;
      let expired = false;
      try {
        answer = await answerMissedDay({ offerId, accept });
      } catch (err) {
        const stale = err?.errorType === 'conflict' || err?.errorType === 'not_found';
        let fresh = null;
        if (err?.mayHaveRun || stale) {
          fresh = await loadRows();
          const row = fresh?.offers?.find((r) => r.id === offerId);
          answer = offerAnswerFromRow(row);
          expired = row?.status === 'expired' && !stale;
        }
        if (!answer && !expired) {
          await reportFailure('answerOffer', err);
          const gone = stale && fresh?.offers && pickOffer(fresh.offers, Date.now())?.id !== offerId;
          if (gone) {
            // The reload took the card away, so an inline error would vanish with it.
            toast.warning(accept ? "Couldn't move it, that day changed. Nothing moved." : err.message);
          } else {
            setError({ target: 'offer', id: offerId, message: err.message });
          }
          return false;
        }
      }

      await loadRows();
      if (expired) {
        toast.info('That offer expired. Nothing changed.');
        return true;
      }
      if (answer.status === 'accepted') await refreshProgram();
      toast.success(describeOfferResult(answer));
      return true;
    } finally {
      actionBusyRef.current = false;
      setBusy(null);
    }
  }, [loadRows, refreshProgram, reportFailure, toast]);

  /** Turn the weekly check-in on or off. @returns {Promise<boolean>} */
  const setEnabled = useCallback(async (enabled) => {
    if (settingsBusyRef.current) return false;
    settingsBusyRef.current = true;
    setBusy('settings');
    try {
      const result = await setWeeklyCheckin(enabled);
      switchOnRef.current = result.enabled === true;
      setStatus((prev) => ({ ...(prev || { eligible: true }), configured: true, enabled: result.enabled }));
      toast.success(result.enabled ? 'Chad will check in on Sunday evenings.' : 'Weekly check-ins are off.');
      return true;
    } catch (err) {
      await reportFailure('setEnabled', err, { toastIt: true });
      if (err?.errorType === 'not_eligible') {
        await refreshStatus();
      } else if (err?.mayHaveRun) {
        // The server puts the switch back when it cannot start the workflow; show what is stored.
        const stored = await db.getWeeklyCheckinSetting(currentUser);
        if (stored !== null) setStatus((prev) => (prev ? { ...prev, enabled: stored } : prev));
      }
      return false;
    } finally {
      settingsBusyRef.current = false;
      setBusy(null);
    }
  }, [currentUser, refreshStatus, reportFailure, toast]);

  /** A push deep link: refresh, and ask the matching card to scroll into view. */
  const showFromLink = useCallback(async ({ kind, id }) => {
    setFocusId(id);
    const fresh = await loadRows();
    if (!fresh) return;
    const t = Date.now();
    const shown = kind === 'checkin'
      ? pickCheckin(fresh.checkins, { now: t, seenIds: seenRef.current })
      : pickOffer(fresh.offers, t);
    // Already answered or expired: there is no card to scroll to.
    if (shown?.id !== id) setFocusId(null);
  }, [loadRows]);

  const clearFocus = useCallback(() => setFocusId(null), []);
  const clearError = useCallback(() => setError(null), []);

  /** Hide the result of a decided check-in. */
  const dismissResult = useCallback((id) => {
    updateSeen((prev) => prev.filter((seen) => seen !== id));
  }, [updateSeen]);

  const checkin = useMemo(() => {
    const row = pickCheckin(checkinRows, { now, seenIds });
    return row ? buildCheckinView(row, { now, localResult: localResults[row.id] ?? null }) : null;
  }, [checkinRows, now, seenIds, localResults]);

  const offer = useMemo(() => {
    const row = pickOffer(offerRows, now);
    return row ? buildOfferView(row) : null;
  }, [offerRows, now]);

  // Keep the expiry label honest while a card is showing.
  const cardVisible = Boolean(checkin || offer);
  useEffect(() => {
    if (!cardVisible) return undefined;
    const timer = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, [cardVisible]);

  return {
    checkin,
    offer,
    status,
    busy,
    error,
    focusId,
    decide,
    answerOffer,
    setEnabled,
    refresh: loadRows,
    refreshStatus,
    showFromLink,
    clearFocus,
    clearError,
    dismissResult,
  };
}
