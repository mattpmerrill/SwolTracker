import { Bot, Check, Copy, ArrowRight, ChevronLeft } from 'lucide-react';

export default function ConnectScreen({ agentOnboarding }) {
  const {
    apiKey, apiKeyCopied, setApiKeyCopied,
    configCopied, setConfigCopied,
    copyToClipboard, handleGoToConfirm, handleBack,
  } = agentOnboarding;

  const mcpUrl = `${window.location.origin}/api/mcp`;
  const configJson = apiKey
    ? JSON.stringify({ swoltracker: { url: mcpUrl, headers: { Authorization: `Bearer ${apiKey}` } } }, null, 2)
    : '';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 ring-1 ring-cyan-500/20">
          <Bot className="w-10 h-10 text-cyan-400" />
        </div>
        <h2 className="text-4xl font-black mb-3 tracking-tight">
          Paste this into your{' '}
          <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">agent</span>
        </h2>
        <p className="text-zinc-400 text-base max-w-lg mx-auto">
          Your agent will read your SwolTracker skill, interview you, and write
          your profile as you answer.
        </p>
      </div>

      <div className="space-y-4 max-w-xl mx-auto text-left">
        <div className="bg-zinc-900 rounded-2xl p-5 border border-cyan-500/20">
          <label className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">API key</label>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 text-sm text-cyan-300 bg-zinc-800 rounded-xl px-4 py-3 font-mono overflow-x-auto">{apiKey || '...'}</code>
            <button
              onClick={() => copyToClipboard(apiKey || '', setApiKeyCopied)}
              className="shrink-0 p-2.5 hover:bg-zinc-800 rounded-xl transition-colors"
              disabled={!apiKey}
            >
              {apiKeyCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4 text-zinc-400" />}
            </button>
          </div>
          <p className="text-xs text-zinc-500 mt-2">Save this — it won't be shown again.</p>
        </div>

        <div className="bg-zinc-900 rounded-2xl p-5 border border-cyan-500/20">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">MCP config</label>
            <button
              onClick={() => copyToClipboard(configJson, setConfigCopied)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
              disabled={!configJson}
            >
              {configCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
              {configCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="text-sm text-zinc-300 bg-zinc-800 rounded-xl px-4 py-3 font-mono overflow-x-auto whitespace-pre">{configJson || '...'}</pre>
        </div>

        <div className="bg-zinc-800/40 rounded-2xl p-4 border border-zinc-700/30 text-sm text-zinc-300 leading-relaxed">
          Once your agent has the config, tell it:
          <div className="mt-2 bg-zinc-900/80 rounded-xl px-4 py-3 font-mono text-xs text-zinc-200">
            I just set up SwolTracker. Please interview me and complete onboarding.
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between max-w-xl mx-auto mt-8">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900/50 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
        <button
          onClick={handleGoToConfirm}
          className="flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-400 hover:to-teal-500 text-white shadow-xl shadow-cyan-500/20 transition-all"
        >
          My agent is ready
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
