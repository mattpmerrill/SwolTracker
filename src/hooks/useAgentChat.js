import { useEffect, useRef, useState } from 'react';
import { supabase, db } from '../lib/supabase';
import { agentChatMessageSchema } from '../lib/validation';
import { reportWriteFailure } from '../lib/errorService';

/**
 * Owns the Coach Board: message list, panel open state, input, loading,
 * unread badge, latest coach note, and the realtime subscription.
 *
 * Bundle hydration flows through setHasUnread / setLatestCoachNote.
 */
export function useAgentChat({ currentUser, toast }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [latestCoachNote, setLatestCoachNote] = useState(null);
  const chatEndRef = useRef(null);
  const showPanelRef = useRef(false);

  useEffect(() => {
    showPanelRef.current = showPanel;
  }, [showPanel]);

  useEffect(() => {
    if (!currentUser) return;
    const channel = supabase
      .channel(`agent-messages-${currentUser}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_messages', filter: `user_id=eq.${currentUser}` },
        (payload) => {
          const msg = payload.new;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, { ...msg, message_created_at: msg.created_at }];
          });
          if (msg.role === 'agent') {
            if (!showPanelRef.current) setHasUnread(true);
            if (msg.message_type === 'weekly_review' || msg.message_type === 'program_update') {
              setLatestCoachNote({ ...msg, message_created_at: msg.created_at });
            }
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser]);

  const loadMessages = async () => {
    if (!currentUser) return;
    setLoading(true);
    const list = await db.getAgentMessages(currentUser, 50);
    setMessages(list.reverse());
    setLoading(false);
    await db.markAgentMessagesRead(currentUser);
    setHasUnread(false);
  };

  /**
   * Send a coach-board note. Pass `contentOverride` to send without using input state
   * (post-workout CTA, quick chips, etc.).
   * @returns {Promise<boolean>}
   */
  const send = async (contentOverride = null) => {
    if (!currentUser || sending) return false;
    const raw = contentOverride != null ? contentOverride : input;
    const result = agentChatMessageSchema.safeParse(raw);
    if (!result.success) {
      toast.error(result.error.errors?.[0]?.message || 'Message cannot be empty');
      return false;
    }

    const content = result.data;
    const tempId = `temp-${Date.now()}`;
    setSending(true);
    setMessages((prev) => [...prev, {
      id: tempId, role: 'user', content, message_type: 'chat',
      message_created_at: new Date().toISOString(), _optimistic: true,
    }]);
    if (contentOverride == null) setInput('');

    try {
      const response = await db.sendUserMessage(currentUser, content);
      if (!response?.success) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        await reportWriteFailure({
          db,
          toast,
          userId: currentUser,
          component: 'useAgentChat.js',
          operation: 'send',
          message: 'sendUserMessage failed',
          userMessage: 'Failed to send message to your coach. Try again.',
        });
        return false;
      }
      toast.success?.('Note sent to your coach');
      return true;
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      await reportWriteFailure({
        db,
        toast,
        userId: currentUser,
        component: 'useAgentChat.js',
        operation: 'send',
        message: err?.message || 'send threw',
        userMessage: 'Failed to send message to your coach. Try again.',
        originalError: err,
      });
      return false;
    } finally {
      setSending(false);
    }
  };

  const open = () => {
    setShowPanel(true);
    if (messages.length === 0) loadMessages();
    else {
      db.markAgentMessagesRead(currentUser);
      setHasUnread(false);
    }
  };

  /** Open panel with optional draft text prefilled. */
  const openWithDraft = (draft = '') => {
    if (draft) setInput(draft);
    open();
  };

  const close = () => setShowPanel(false);

  const remove = async (messageId) => {
    const deleted = await db.deleteAgentMessage(currentUser, messageId);
    if (deleted) setMessages((prev) => prev.filter((m) => m.id !== messageId));
    else {
      await reportWriteFailure({
        db,
        toast,
        userId: currentUser,
        component: 'useAgentChat.js',
        operation: 'remove',
        message: 'deleteAgentMessage failed',
        userMessage: 'Failed to delete note',
      });
    }
  };

  return {
    messages, input, showPanel, loading, sending, hasUnread, latestCoachNote, chatEndRef,
    setInput, setHasUnread, setLatestCoachNote,
    open, openWithDraft, close, send, remove,
  };
}
