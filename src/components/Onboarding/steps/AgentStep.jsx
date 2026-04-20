import { Bot, Sparkles, Loader2, Check, Copy } from 'lucide-react';

export default function AgentStep({ onboarding }) {
  const {
    agentChoice, setAgentChoice, setHasAgent,
    apiKey, apiKeyCopied, setApiKeyCopied,
    configCopied, setConfigCopied,
    copyToClipboard, handleConnectAgent,
  } = onboarding;

  const mcpUrl = `${window.location.origin}/api/mcp`;
  const configJson = apiKey
    ? JSON.stringify({ swoltracker: { url: mcpUrl, headers: { Authorization: `Bearer ${apiKey}` } } }, null, 2)
    : '';

  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="w-20 h-20 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 rounded-3xl flex items-center justify-center mx-auto mb-8 ring-1 ring-cyan-500/20 shadow-2xl shadow-cyan-500/10">
        <Bot className="w-10 h-10 text-cyan-400" />
      </div>
      <h2 className="text-4xl font-black mb-3 tracking-tight">
        Do you have an{' '}
        <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">AI Agent</span>?
      </h2>
      <p className="text-zinc-400 text-lg mb-10 max-w-md mx-auto">
        Connect your AI assistant to build your workouts, or let SwolTracker handle it
      </p>

      {!agentChoice && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
          <button
            onClick={handleConnectAgent}
            className="p-8 rounded-3xl border border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 transition-all duration-300 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Bot className="w-10 h-10 text-cyan-400 mx-auto mb-4 relative z-10" />
            <p className="font-bold text-white text-lg relative z-10">Yes, connect my agent</p>
            <p className="text-zinc-500 text-sm mt-2 relative z-10">I'll send it the MCP config</p>
          </button>
          <button
            onClick={() => { setAgentChoice('no'); setHasAgent(false); }}
            className="p-8 rounded-3xl border border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/50 transition-all duration-300 group relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-zinc-700/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Sparkles className="w-10 h-10 text-orange-400 mx-auto mb-4 relative z-10" />
            <p className="font-bold text-white text-lg relative z-10">No, SwolTracker handles it</p>
            <p className="text-zinc-500 text-sm mt-2 relative z-10">AI generates your plan automatically</p>
          </button>
        </div>
      )}

      {agentChoice === 'no' && (
        <div className="bg-zinc-800/50 rounded-2xl p-6 max-w-md mx-auto border border-zinc-700/30 animate-in fade-in duration-500">
          <Check className="w-8 h-8 text-green-400 mx-auto mb-3" />
          <p className="text-white font-semibold text-lg">Got it!</p>
          <p className="text-zinc-400 text-sm mt-2">SwolTracker's AI will create your personalized workout plan at the end.</p>
          <button
            onClick={() => setAgentChoice(null)}
            className="mt-4 text-zinc-500 hover:text-zinc-300 text-sm underline underline-offset-2 transition-colors"
          >
            Change my mind
          </button>
        </div>
      )}

      {agentChoice === 'yes' && apiKey && (
        <div className="space-y-4 max-w-lg mx-auto text-left animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-zinc-900 rounded-2xl p-5 border border-cyan-500/20">
            <label className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Your API Key</label>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 text-sm text-cyan-300 bg-zinc-800 rounded-xl px-4 py-3 font-mono overflow-x-auto">{apiKey}</code>
              <button
                onClick={() => copyToClipboard(apiKey, setApiKeyCopied)}
                className="shrink-0 p-2.5 hover:bg-zinc-800 rounded-xl transition-colors"
              >
                {apiKeyCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">Save this — it won't be shown again</p>
          </div>

          <div className="bg-zinc-900 rounded-2xl p-5 border border-cyan-500/20">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">MCP Config</label>
              <button
                onClick={() => copyToClipboard(configJson, setConfigCopied)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                {configCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                {configCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="text-sm text-zinc-300 bg-zinc-800 rounded-xl px-4 py-3 font-mono overflow-x-auto whitespace-pre">{configJson}</pre>
          </div>

          <div className="bg-zinc-800/50 rounded-2xl p-4 border border-zinc-700/30 text-center">
            <p className="text-zinc-300 text-sm">
              Add this to your agent's MCP settings, then continue setting up your profile.
              Your agent will create your workout plan at the end.
            </p>
          </div>
        </div>
      )}

      {agentChoice === 'yes' && !apiKey && (
        <div className="flex items-center justify-center gap-3 text-zinc-400 animate-in fade-in duration-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Generating your API key...</span>
        </div>
      )}
    </div>
  );
}
