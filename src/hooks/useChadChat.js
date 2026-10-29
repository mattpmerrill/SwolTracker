import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../lib/supabase';
import { sendChadMessage, sendChadDecision } from '../lib/chad';
import { reportWriteFailure, ErrorCategory, ErrorSeverity } from '../lib/errorService';

const MAX_MESSAGE_LENGTH = 2000;
const storageKey = (userId) => `chad:${userId}`;

// sessionStorage can throw (private mode, quota, blocked), so every access is
// wrapped and the chat simply starts empty if it fails.
function loadSaved(userId) {
  const empty = { messages: [], history: [] };
  if (!userId) return empty;
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    return {
      messages: Array.isArray(parsed?.messages) ? parsed.messages : [],
      history: Array.isArray(parsed?.history) ? parsed.history : [],
    };
  } catch (err) {
    console.warn('Chad: could not read saved chat', err?.message);
    return empty;
  }
}

function save(userId, payload) {
  if (!userId) return;
  try {
    window.sessionStorage.setItem(storageKey(userId), JSON.stringify(payload));
  } catch (err) {
    console.warn('Chad: could not save chat', err?.message);
  }
}

function clearSaved(userId) {
  if (!userId) return;
  try {
    window.sessionStorage.removeItem(storageKey(userId));
  } catch (err) {
    console.warn('Chad: could not clear saved chat', err?.message);
  }
}

/**
 * Owns the Chad chat: display messages, the opaque server history, the
 * pending edit proposal and the panel open state. Orchestration only; the
 * proposal display rules live in utils/chadProposal.js.
 *
 * The shell mounts this once per signed-in user, so the saved chat is read
 * once on mount rather than re-hydrated when the user changes.
 */
export function useChadChat({ currentUser, programGymId, setWorkoutProgram, toast }) {
  const [isOpen, setIsOpen] = useState(false);
  // One read on mount, shared by both initializers.
  const [saved] = useState(() => loadSaved(currentUser));
  const [messages, setMessages] = useState(saved.messages);
  const [history, setHistory] = useState(saved.history);
  const [pending, setPending] = useState(null);
  const [loading, setLoading] = useState(false);
  // A ref, not state: two fast taps must not both pass a stale `loading` check.
  const busyRef = useRef(false);

  // Persist settled turns only. While a proposal is pending the server history
  // ends mid tool call, and during a request the optimistic bubble has no reply
  // yet. A reload then restores the last settled turn and drops the proposal.
  useEffect(() => {
    if (pending || loading) return;
    save(currentUser, { messages, history });
  }, [currentUser, messages, history, pending, loading]);

  const reportFailure = useCallback((operation, err, { silent = false } = {}) => reportWriteFailure({
    db,
    toast: silent ? null : toast,
    userId: currentUser,
    component: 'useChadChat.js',
    operation,
    message: err?.originalError?.message || err?.message || `${operation} failed`,
    // Only chad.js errors carry a vetted friendly message; anything else falls back.
    userMessage: err?.errorType ? err.message : null,
    originalError: err,
    category: ErrorCategory.LLM,
    severity: ErrorSeverity.WARNING,
    context: { errorType: err?.errorType ?? null },
  }), [currentUser, toast]);

  const refreshProgram = useCallback(async () => {
    try {
      const programs = await db.getAllWorkoutPrograms(programGymId);
      // Same guard as bootstrap: never replace the program with an empty map.
      if (programs && Object.keys(programs).length > 0) {
        setWorkoutProgram(programs);
        toast.success('Workout updated');
      } else {
        throw new Error('getAllWorkoutPrograms returned no weeks');
      }
    } catch (err) {
      await reportWriteFailure({
        db,
        toast,
        userId: currentUser,
        component: 'useChadChat.js',
        operation: 'refreshProgram',
        message: err?.message || 'refreshProgram failed',
        userMessage: 'Chad updated your workout, but it did not refresh. Reload to see it.',
        originalError: err,
        errorType: 'load_failed',
      });
    }
  }, [programGymId, setWorkoutProgram, toast, currentUser]);

  const applyResponse = useCallback(async (response) => {
    if (response.reply) {
      setMessages((prev) => [...prev, { role: 'chad', text: response.reply }]);
    }
    setHistory(Array.isArray(response.history) ? response.history : []);
    setPending(response.pending ?? null);
    if (response.changed) await refreshProgram();
  }, [refreshProgram]);

  /** @returns {Promise<boolean>} true when Chad answered; false so the caller can restore the draft */
  const send = useCallback(async (rawText) => {
    const text = (rawText ?? '').trim();
    if (!text || busyRef.current || pending) return false;
    if (text.length > MAX_MESSAGE_LENGTH) {
      toast.error(`Keep it under ${MAX_MESSAGE_LENGTH} characters.`);
      return false;
    }

    busyRef.current = true;
    setLoading(true);
    const userMessage = { role: 'user', text };
    setMessages((prev) => [...prev, userMessage]);
    try {
      const response = await sendChadMessage({ message: text, history });
      await applyResponse(response);
      return true;
    } catch (err) {
      // Roll back the optimistic bubble; the panel puts the text back in the input.
      setMessages((prev) => prev.filter((m) => m !== userMessage));
      await reportFailure('send', err);
      return false;
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [history, pending, applyResponse, reportFailure, toast]);

  const decide = useCallback(async (approve) => {
    if (!pending || busyRef.current) return false;

    busyRef.current = true;
    setLoading(true);
    try {
      const response = await sendChadDecision({ approve, state: pending.state });
      setMessages((prev) => [...prev, { role: 'user', text: approve ? 'Apply it' : 'Nah' }]);
      await applyResponse(response);
      return true;
    } catch (err) {
      if (err?.originalError?.status === 400) {
        // The server rejected the saved state (stale or tampered); retrying can't work.
        setPending(null);
        toast.error('That change expired. Ask Chad again.');
        await reportFailure('decide', err, { silent: true });
        return false;
      }
      // Keep the proposal on screen so the user can retry the decision.
      await reportFailure('decide', err);
      return false;
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [pending, applyResponse, reportFailure, toast]);

  const reset = useCallback(() => {
    setMessages([]);
    setHistory([]);
    setPending(null);
    clearSaved(currentUser);
  }, [currentUser]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return { isOpen, messages, history, pending, loading, open, close, send, decide, reset };
}
