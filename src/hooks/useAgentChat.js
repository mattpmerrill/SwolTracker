import { useEffect, useRef, useState } from 'react';
import { supabase, db } from '../lib/supabase';
import { agentChatMessageSchema } from '../lib/validation';

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
  const [hasUnread, setHasUnread] = useState(false);
  const [latestCoachNote, setLatestCoachNote] = useState(null);
  const chatEndRef = useRef(null);

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
            if (!showPanel) setHasUnread(true);
            if (msg.message_type === 'weekly_review' || msg.message_type === 'program_update') {
              setLatestCoachNote({ ...msg, message_created_at: msg.created_at });
            }
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentUser, showPanel]);

  const loadMessages = async () => {
    if (!currentUser) return;
    setLoading(true);
    const list = await db.getAgentMessages(currentUser, 50);
    setMessages(list.reverse());
    setLoading(false);
    await db.markAgentMessagesRead(currentUser);
    setHasUnread(false);
  };

  const send = async () => {
    if (!currentUser || !input.trim()) return;
    const result = agentChatMessageSchema.safeParse(input);
    if (!result.success) { toast.error(result.error.errors[0]?.message); return; }

    const content = result.data;
    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: tempId, role: 'user', content, message_type: 'chat',
      message_created_at: new Date().toISOString(), _optimistic: true,
    }]);
    setInput('');

    const response = await db.sendUserMessage(currentUser, content);
    if (!response?.success) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error('Failed to send message');
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

  const close = () => setShowPanel(false);

  const remove = async (messageId) => {
    const deleted = await db.deleteAgentMessage(currentUser, messageId);
    if (deleted) setMessages((prev) => prev.filter((m) => m.id !== messageId));
    else toast.error('Failed to delete note');
  };

  return {
    messages, input, showPanel, loading, hasUnread, latestCoachNote, chatEndRef,
    setInput, setHasUnread, setLatestCoachNote,
    open, close, send, remove,
  };
}
