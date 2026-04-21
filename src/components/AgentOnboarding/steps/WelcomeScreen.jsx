import { Bot, Sparkles, Loader2, AlertCircle } from 'lucide-react';

export default function WelcomeScreen({ agentOnboarding, onUseFallback }) {
  const { busy, error, handleConnect } = agentOnboarding;

  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="w-24 h-24 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 rounded-3xl flex items-center justify-center mx-auto mb-8 ring-1 ring-cyan-500/20 shadow-2xl shadow-cyan-500/10">
        <Bot className="w-12 h-12 text-cyan-400" />
      </div>

      <h1 className="text-5xl font-black mb-4 tracking-tight">
        Your{' '}
        <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">agent</span>{' '}
        runs the setup
      </h1>
      <p className="text-xl text-zinc-300 mb-10 max-w-lg mx-auto leading-relaxed">
        Connect your AI assistant and it'll interview you, build your profile,
        and save your first 4-week program.
      </p>

      <div className="max-w-md mx-auto space-y-3">
        <button
          onClick={handleConnect}
          disabled={busy}
          className="w-full flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-400 hover:to-teal-500 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-white shadow-xl shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all"
        >
          {busy ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Setting up your agent key...
            </>
          ) : (
            <>
              <Bot className="w-5 h-5" />
              Connect my agent
            </>
          )}
        </button>

        {onUseFallback && (
          <button
            onClick={onUseFallback}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-medium text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            No agent? Set up manually
          </button>
        )}
      </div>

      {error && (
        <div className="mt-6 max-w-md mx-auto p-4 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-start gap-3 text-left">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
}
