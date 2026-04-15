import { useEffect, useState } from 'react';
import { Bot, X, Send, Loader2, Trash2 } from 'lucide-react';

/**
 * Renders text with basic markdown: **bold**, literal \n → line breaks
 */
function FormattedText({ text, className }) {
  // Replace literal \n with actual newlines
  const normalized = text.replace(/\\n/g, '\n');

  // Split into segments: bold (**text**) and plain text
  const parts = normalized.split(/(\*\*[^*]+\*\*)/g);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
        }
        // Convert newlines to <br> within plain text segments
        return part.split('\n').map((line, j, arr) => (
          <span key={`${i}-${j}`}>
            {line}
            {j < arr.length - 1 && <br />}
          </span>
        ));
      })}
    </span>
  );
}

/**
 * Coach Board — shared async notes between user and their AI coach
 */
export default function AgentChatPanel({
  isOpen,
  messages,
  loading,
  input,
  chatEndRef,
  onClose,
  onInputChange,
  onSend,
  onDelete,
}) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen && chatEndRef?.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const renderMessage = (msg) => {
    const isUser = msg.role === 'user';
    const isSpecial = msg.message_type === 'weekly_review' || msg.message_type === 'program_update';

    // Special card rendering for coach notes
    if (!isUser && isSpecial) {
      const isReview = msg.message_type === 'weekly_review';
      const label = isReview ? 'Weekly Review' : 'Program Update';
      const accentBorder = isReview ? 'border-emerald-500/30' : 'border-orange-500/30';
      const accentBg = isReview ? 'bg-emerald-500/5' : 'bg-orange-500/5';
      const accentText = isReview ? 'text-emerald-400' : 'text-orange-400';

      return (
        <div key={msg.id} className={`${accentBg} border ${accentBorder} rounded-2xl p-4 ${msg._optimistic ? 'opacity-70' : ''}`}>
          <div className="flex items-center gap-2 mb-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            <span className={`text-xs font-semibold uppercase tracking-wider ${accentText}`}>{label}</span>
            {msg.week_number && <span className="text-xs text-zinc-500">Week {msg.week_number}</span>}
          </div>
          <div className="text-sm text-zinc-200 leading-relaxed"><FormattedText text={msg.content} /></div>
          {msg.metadata?.changes && Array.isArray(msg.metadata.changes) && (
            <div className="mt-3 space-y-1">
              {msg.metadata.changes.map((change, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-zinc-800/50 rounded-lg px-3 py-1.5">
                  <span className="text-zinc-400">{change.exercise}</span>
                  <span className="text-zinc-600">{change.field}:</span>
                  <span className="text-red-400 line-through">{change.old}</span>
                  <span className="text-zinc-600">&rarr;</span>
                  <span className="text-green-400">{change.new}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-zinc-500 mt-2">
            {msg._optimistic ? 'Sending...' : new Date(msg.message_created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      );
    }

    // Standard chat bubble
    return (
      <div
        key={msg.id}
        className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} ${msg._optimistic ? 'opacity-70' : ''}`}
      >
        {!isUser && (
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
        )}
        <div
          className={`max-w-[75%] border rounded-2xl p-3 ${
            isUser
              ? 'bg-blue-500/20 border-blue-500/30'
              : 'bg-cyan-500/10 border-cyan-500/20'
          }`}
        >
          <div className="text-sm break-words"><FormattedText text={msg.content} /></div>
          <p className="text-[10px] text-zinc-500 mt-1">
            {msg._optimistic ? (
              <span className="italic">Sending...</span>
            ) : (
              new Date(msg.message_created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            )}
          </p>
          {isUser && !msg._optimistic && (
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-cyan-500/60 italic">Your coach will see this on their next review</p>
              {confirmDeleteId === msg.id ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => { onDelete(msg.id); setConfirmDeleteId(null); }}
                    className="text-[10px] text-red-400 hover:text-red-300 font-medium"
                  >
                    Delete
                  </button>
                  <span className="text-zinc-600 text-[10px]">|</span>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(msg.id)}
                  className="text-zinc-600 hover:text-red-400 transition-colors p-0.5"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-zinc-900 rounded-t-3xl border-t border-x border-zinc-700/50 shadow-2xl animate-in slide-in-from-bottom duration-300" style={{ height: '80vh', maxHeight: '80vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-white">Coach Board</p>
              <p className="text-xs text-zinc-400">Notes are picked up on your coach's next check-in</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ height: 'calc(80vh - 140px)' }}>
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 flex items-center justify-center mb-4 ring-1 ring-cyan-500/20">
                <Bot className="w-8 h-8 text-cyan-400" />
              </div>
              <p className="text-zinc-400 text-sm mb-1">No notes yet</p>
              <p className="text-zinc-600 text-xs">Your coach will post weekly reviews here.<br />You can also leave notes, questions, or feedback.</p>
            </div>
          ) : (
            <>
              {messages.map(renderMessage)}
              <div ref={chatEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-zinc-800">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Leave a note for your coach..."
              maxLength={5000}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 focus:outline-none focus:border-cyan-500/50 transition-colors text-sm"
            />
            <button
              onClick={onSend}
              disabled={!input.trim()}
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-teal-600 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-400 hover:to-teal-500 transition-all"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
