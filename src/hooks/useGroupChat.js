import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, db } from '../lib/supabase';

/**
 * Hook for managing group chat functionality
 */
export function useGroupChat({
  currentUser,
  groupRole,
  groupLeader,
  demoMode,
  profiles,
  toast,
}) {
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const chatEndRef = useRef(null);

  // Check for unread messages
  const checkUnreadMessages = useCallback(async () => {
    if (!currentUser || groupRole === 'independent' || demoMode) return;
    const hasUnread = await db.hasUnreadMessages(currentUser);
    setHasUnreadMessages(hasUnread);
  }, [currentUser, groupRole, demoMode]);

  // Load chat messages and mark as read
  const loadChatMessages = useCallback(async () => {
    if (!currentUser || groupRole === 'independent') return;
    setChatLoading(true);
    const messages = await db.getGroupMessages(currentUser, 50);
    setChatMessages(messages.reverse()); // Reverse to show oldest first
    setChatLoading(false);

    // Mark messages as read
    await db.markMessagesRead(currentUser);
    setHasUnreadMessages(false);
  }, [currentUser, groupRole]);

  // Send a chat message with optimistic update
  const sendChatMessage = useCallback(async () => {
    if (!chatInput.trim() || !currentUser) return;

    const content = chatInput.trim();
    const userProfile = profiles[currentUser] || {};

    // Create optimistic message with temp ID
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticMessage = {
      id: tempId,
      sender_id: currentUser,
      sender_name: userProfile.name || 'You',
      sender_avatar: userProfile.avatar,
      sender_avatar_url: userProfile.avatar_url,
      content: content,
      message_created_at: new Date().toISOString(),
      _optimistic: true,
      _realId: null
    };

    // Immediately add to state and clear input
    setChatInput('');
    setChatMessages(prev => [...prev, optimisticMessage]);

    // Scroll to bottom immediately
    setTimeout(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);

    // Send to server
    const result = await db.sendGroupMessage(currentUser, content);
    if (!result?.success) {
      // Remove optimistic message on failure
      setChatMessages(prev => prev.filter(msg => msg.id !== tempId));
      toast.error(result?.error || 'Failed to send message');
      setChatInput(content); // Restore input on failure
    } else if (result?.message_id) {
      // Store real message ID for deduplication
      setChatMessages(prev => prev.map(msg =>
        msg.id === tempId ? { ...msg, _realId: result.message_id } : msg
      ));
    }
  }, [chatInput, currentUser, profiles, toast]);

  // Check for unread messages when group role changes
  useEffect(() => {
    if (groupRole !== 'independent') {
      checkUnreadMessages();
    }
  }, [groupRole, currentUser, checkUnreadMessages]);

  // Subscribe to new chat messages
  useEffect(() => {
    if (!supabase || !currentUser || groupRole === 'independent' || demoMode) return;

    // Get the leader ID for this user's group
    const setupSubscription = async () => {
      const leaderId = groupRole === 'leader' ? currentUser : groupLeader?.id;
      if (!leaderId) return;

      // Load initial messages when chat is opened
      if (showChat && chatMessages.length === 0) {
        loadChatMessages();
      }

      // Subscribe to new messages
      const channel = supabase
        .channel(`group_chat_${leaderId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'group_messages',
            filter: `leader_id=eq.${leaderId}`
          },
          async (payload) => {
            // Fetch the full message with sender info
            const messages = await db.getGroupMessages(currentUser, 1);
            if (messages.length > 0) {
              const newMessage = messages[0];

              setChatMessages(prev => {
                // Check for duplicate by ID first (real-time may fire multiple times)
                if (prev.some(msg => msg.id === newMessage.id)) {
                  return prev;
                }

                // If message is from current user, check for matching optimistic message
                if (newMessage.sender_id === currentUser) {
                  const optimisticIndex = prev.findIndex(msg =>
                    msg._optimistic &&
                    msg.sender_id === currentUser &&
                    (msg._realId === newMessage.id ||  // Match by confirmed ID
                      (msg.content === newMessage.content &&  // Or content + time match
                        Math.abs(new Date(msg.message_created_at) - new Date(newMessage.message_created_at)) < 30000))
                  );

                  if (optimisticIndex !== -1) {
                    // Replace optimistic message with real message
                    const updated = [...prev];
                    updated[optimisticIndex] = newMessage;
                    return updated;
                  }
                }

                // Message is from someone else or no matching optimistic - append
                return [...prev, newMessage];
              });

              // If chat is open and message is from someone else, mark as read
              if (showChat && newMessage.sender_id !== currentUser) {
                await db.markMessagesRead(currentUser);
              } else if (!showChat && newMessage.sender_id !== currentUser) {
                // If chat is closed and message is from someone else, show unread indicator
                setHasUnreadMessages(true);
              }

              // Scroll to bottom
              setTimeout(() => {
                chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
              }, 100);
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    const cleanup = setupSubscription();
    return () => {
      cleanup?.then(fn => fn?.());
    };
  }, [currentUser, groupRole, groupLeader?.id, showChat, demoMode, chatMessages.length, loadChatMessages]);

  // Scroll to bottom and mark as read when chat opens
  useEffect(() => {
    if (showChat && chatMessages.length > 0) {
      setTimeout(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);

      // Mark as read when chat opens
      if (hasUnreadMessages && currentUser) {
        db.markMessagesRead(currentUser);
        setHasUnreadMessages(false);
      }
    }
  }, [showChat, chatMessages.length, hasUnreadMessages, currentUser]);

  // Toggle chat visibility
  const toggleChat = useCallback(() => {
    setShowChat(prev => {
      if (!prev && chatMessages.length === 0) {
        loadChatMessages();
      }
      return !prev;
    });
  }, [chatMessages.length, loadChatMessages]);

  return {
    chatMessages,
    setChatMessages,
    chatInput,
    setChatInput,
    showChat,
    setShowChat,
    chatLoading,
    hasUnreadMessages,
    setHasUnreadMessages,
    chatEndRef,
    loadChatMessages,
    sendChatMessage,
    toggleChat,
    checkUnreadMessages,
  };
}
