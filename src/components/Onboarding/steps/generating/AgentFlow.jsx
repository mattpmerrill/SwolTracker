import { Loader2, Sparkles, AlertCircle, RotateCcw, Bot, Check, Copy } from 'lucide-react';

export default function AgentFlow({ onboarding }) {
  const {
    isGenerating, generationFailed, generationProgress,
    agentWeeksReceived, agentPollingTimeout,
    contextCopied, setContextCopied,
    copyToClipboard, buildAgentContextBlock,
    handlePrepareAndPoll, handleFallbackGenerate,
    onComplete, retryPolling,
  } = onboarding;

  const agentContextBlock = buildAgentContextBlock();
  const agentComplete = agentWeeksReceived >= 4;

  return (
    <div className="text-center animate-in fade-in zoom-in duration-500">
      <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl ${
        isGenerating
          ? 'bg-gradient-to-br from-cyan-500 to-teal-600 shadow-cyan-500/30 animate-pulse-slow'
          : generationFailed
            ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-500/30'
            : agentComplete
              ? 'bg-gradient-to-br from-cyan-500 to-teal-600 shadow-cyan-500/30'
              : 'bg-gradient-to-br from-cyan-500/80 to-teal-600/80 shadow-cyan-500/20'
      }`}>
        {isGenerating ? <Loader2 className="w-12 h-12 text-white animate-spin" />
          : generationFailed ? <AlertCircle className="w-12 h-12 text-white" />
          : agentComplete ? <Sparkles className="w-12 h-12 text-white" />
          : <Bot className="w-12 h-12 text-white" />}
      </div>

      <h2 className={`text-4xl font-black mb-4 tracking-tight ${
        generationFailed
          ? 'text-red-400'
          : agentComplete
            ? 'bg-gradient-to-r from-cyan-400 via-teal-400 to-green-400 bg-clip-text text-transparent'
            : 'bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent'
      }`}>
        {isGenerating ? 'Setting Up...' : generationFailed ? 'Oops!' : agentComplete ? 'Your Agent Crushed It!' : 'Send to Your Agent'}
      </h2>

      {generationFailed ? (
        <div className="max-w-sm mx-auto mt-4">
          <p className="text-xl text-zinc-300 mb-8 font-medium">{generationProgress}</p>
          <button
            onClick={handlePrepareAndPoll}
            className="w-full flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 transition-all"
          >
            <RotateCcw className="w-5 h-5" />
            Try Again
          </button>
        </div>
      ) : isGenerating ? (
        <div className="max-w-sm mx-auto">
          <p className="text-xl text-zinc-300 mb-6 font-medium">{generationProgress}</p>
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-teal-500 rounded-full animate-progress" style={{ width: '100%' }} />
          </div>
        </div>
      ) : agentComplete ? (
        <div className="max-w-sm mx-auto mt-4">
          <p className="text-xl text-zinc-300 mb-8 font-medium">All 4 weeks are loaded and ready to go!</p>
          <button
            onClick={onComplete}
            className="w-full px-8 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-400 hover:to-teal-500 text-white shadow-xl shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all"
          >
            Start Your Journey
          </button>
        </div>
      ) : (
        <div className="max-w-lg mx-auto mt-2 space-y-6">
          <p className="text-zinc-400 text-sm">Copy this to your agent to kick things off:</p>
          <div className="relative bg-zinc-900 rounded-2xl border border-cyan-500/20 overflow-hidden">
            <div className="absolute top-3 right-3 z-10">
              <button
                onClick={() => copyToClipboard(agentContextBlock, setContextCopied)}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 border border-zinc-700/50 transition-colors backdrop-blur-sm"
              >
                {contextCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                {contextCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="text-sm text-zinc-300 font-mono px-5 py-4 pr-24 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto text-left leading-relaxed">{agentContextBlock}</pre>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-center gap-3 mb-3">
              {[1, 2, 3, 4].map((week) => (
                <div key={week} className="flex flex-col items-center gap-2">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                    agentWeeksReceived >= week
                      ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 scale-110'
                      : 'bg-zinc-800 text-zinc-600 border border-zinc-700'
                  }`}>
                    {agentWeeksReceived >= week ? <Check className="w-5 h-5" /> : week}
                  </div>
                  <span className={`text-xs font-medium transition-colors duration-500 ${agentWeeksReceived >= week ? 'text-cyan-400' : 'text-zinc-600'}`}>
                    Wk {week}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-zinc-400 text-sm font-medium mt-4">
              {agentWeeksReceived === 0
                ? 'Waiting for your agent...'
                : agentWeeksReceived < 4
                  ? `Week ${agentWeeksReceived} received! Waiting for more...`
                  : 'All weeks received!'}
            </p>
            {agentPollingTimeout && (
              <div className="mt-4 p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700/30 animate-in fade-in duration-500">
                <p className="text-zinc-300 text-sm mb-3">Still waiting? Make sure your agent has the MCP config and try sending the context again.</p>
                <button
                  onClick={retryPolling}
                  className="text-cyan-400 hover:text-cyan-300 text-sm font-medium underline underline-offset-2 transition-colors"
                >
                  Keep waiting
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleFallbackGenerate}
            className="text-zinc-500 hover:text-zinc-300 text-sm underline underline-offset-2 transition-colors"
          >
            Generate for me instead
          </button>
        </div>
      )}
    </div>
  );
}
