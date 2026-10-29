import { useEffect, useRef, useState } from 'react';
import { Dumbbell, X, Send, Loader2, RotateCcw } from 'lucide-react';
import ChadProposalCard from './ChadProposalCard';

const STARTERS = [
  "How's my training trending?",
  "Swap today's first exercise",
  'I only have dumbbells today',
];

/**
 * Chad, the in-app coach. A bottom sheet over the app; the chat state lives in
 * useChadChat so closing the sheet does not lose the conversation.
 */
export default function ChadPanel({ messages, pending, loading, onClose, onSend, onDecide, onReset }) {
  const [input, setInput] = useState('');
  const [activeAction, setActiveAction] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, pending, loading]);

  const submit = async (raw) => {
    const text = raw.trim();
    if (!text || loading || pending) return;
    setInput('');
    const ok = await onSend(text);
    // The hook rolled the bubble back; give the text back so nothing is retyped.
    if (!ok) setInput((current) => current || text);
  };

  const handleDecide = async (approve) => {
    setActiveAction(approve ? 'apply' : 'reject');
    await onDecide(approve);
    setActiveAction(null);
  };

  const inputDisabled = loading || !!pending;
  const isEmpty = messages.length === 0 && !loading && !pending;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-label="Chat with Chad"
        className="relative flex flex-col w-full max-w-lg h-[92dvh] bg-zinc-900 rounded-t-3xl border-t border-x border-zinc-700/50 shadow-2xl animate-in slide-in-from-bottom duration-300"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
              <Dumbbell className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white">Chad</p>
              <p className="text-xs text-zinc-400 truncate">Your in-app coach</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={onReset}
                disabled={loading}
                aria-label="Start a new chat"
                className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Chad"
              className="p-2 rounded-xl hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3" aria-live="polite">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-2">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center mb-4 ring-1 ring-orange-500/20">
                <Dumbbell className="w-8 h-8 text-orange-500" />
              </div>
              <p className="text-zinc-300 text-sm font-medium mb-1">Let's get after it.</p>
              <p className="text-zinc-500 text-xs mb-5">Ask about your training, or have me change a day. You approve every edit.</p>
              <div className="flex flex-col gap-2 w-full">
                {STARTERS.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => submit(starter)}
                    className="w-full text-left text-sm text-zinc-200 px-4 py-2.5 rounded-xl border border-zinc-800 bg-zinc-950 hover:border-orange-500/40 hover:bg-zinc-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={i} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
                        <Dumbbell className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] border rounded-2xl px-3.5 py-2.5 ${
                        isUser ? 'bg-zinc-800 border-zinc-700' : 'bg-orange-500/10 border-orange-500/20'
                      }`}
                    >
                      <p className="text-sm text-zinc-100 whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                );
              })}

              {pending?.proposal && (
                <ChadProposalCard
                  proposal={pending.proposal}
                  loading={loading}
                  activeAction={activeAction}
                  onApply={() => handleDecide(true)}
                  onReject={() => handleDecide(false)}
                />
              )}

              {loading && (
                <div className="flex items-center gap-3" role="status">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center shrink-0">
                    <Loader2 className="w-4 h-4 text-white animate-spin motion-reduce:animate-none" />
                  </div>
                  <p className="text-sm text-zinc-400 italic">Chad is thinking…</p>
                </div>
              )}
              <div ref={endRef} />
            </>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); submit(input); }}
          className="px-4 pt-3 border-t border-zinc-800 shrink-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={pending ? 'Apply or skip the change above first' : 'Ask Chad...'}
              maxLength={2000}
              disabled={inputDisabled}
              aria-label="Message Chad"
              className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 px-4 text-base sm:text-sm focus:outline-none focus:border-orange-500/50 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || inputDisabled}
              aria-label="Send message"
              className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:from-orange-400 hover:to-red-400 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
