import { MessageCircle, ChevronRight, Loader2, Send } from 'lucide-react';
import AvatarDisplay from '../Profile/AvatarDisplay';

/**
 * Group chat component with messages and input
 */
export default function GroupChat({
  isOpen,
  messages,
  loading,
  input,
  currentUser,
  chatEndRef,
  onToggle,
  onInputChange,
  onSend,
}) {
  return (
    <div className="mb-8">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 bg-zinc-900/80 rounded-2xl border border-zinc-800 hover:border-zinc-700 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-white" />
          </div>
          <div className="text-left">
            <p className="font-semibold">Group Chat</p>
            <p className="text-xs text-zinc-400">
              {messages.length > 0
                ? `${messages.length} messages`
                : 'Send encouragement to your group'}
            </p>
          </div>
        </div>
        <ChevronRight
          className={`w-5 h-5 text-zinc-500 transition-transform ${
            isOpen ? 'rotate-90' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="mt-4 bg-zinc-900/50 rounded-2xl border border-zinc-800 overflow-hidden">
          {/* Messages Area */}
          <div className="h-64 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
                No messages yet. Start the conversation!
              </div>
            ) : (
              <>
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${
                      msg.sender_id === currentUser ? 'flex-row-reverse' : ''
                    } ${msg._optimistic ? 'opacity-70' : ''}`}
                  >
                    <AvatarDisplay
                      user={{
                        avatar: msg.sender_avatar,
                        avatar_url: msg.sender_avatar_url,
                        name: msg.sender_name
                      }}
                      size="sm"
                    />
                    <div
                      className={`max-w-[70%] ${
                        msg.sender_id === currentUser
                          ? 'bg-blue-500/20 border-blue-500/30'
                          : 'bg-zinc-800 border-zinc-700'
                      } border rounded-xl p-3`}
                    >
                      <p className="text-xs text-zinc-400 mb-1">
                        {msg.sender_id === currentUser ? 'You' : msg.sender_name}
                      </p>
                      <p className="text-sm break-words">{msg.content}</p>
                      <p className="text-[10px] text-zinc-500 mt-1">
                        {msg._optimistic ? (
                          <span className="italic">Sending...</span>
                        ) : (
                          new Date(msg.message_created_at).toLocaleTimeString(
                            [],
                            { hour: '2-digit', minute: '2-digit' }
                          )
                        )}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-zinc-800">
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
                placeholder="Type a message..."
                maxLength={500}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-4 focus:outline-none focus:border-blue-500 transition-colors text-sm"
              />
              <button
                onClick={onSend}
                disabled={!input.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-2 text-right">
              {input.length}/500
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
