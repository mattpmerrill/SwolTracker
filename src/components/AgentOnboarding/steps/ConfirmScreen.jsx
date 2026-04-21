import { Check, Loader2, Sparkles, ChevronLeft } from 'lucide-react';
import { REQUIRED_FIELDS, FIELD_LABELS } from '../status';

function formatValue(key, value) {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.length ? value.join(', ') : null;
  if (key === 'weight_lbs') return `${value} lbs`;
  return String(value);
}

export default function ConfirmScreen({ agentOnboarding }) {
  const { profile, equipment, missingFields, done, pollTimeout, handleBack, onComplete } = agentOnboarding;

  if (done) {
    return (
      <div className="text-center animate-in fade-in zoom-in duration-500">
        <div className="w-24 h-24 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-cyan-500/30">
          <Sparkles className="w-12 h-12 text-white" />
        </div>
        <h2 className="text-4xl font-black mb-4 tracking-tight bg-gradient-to-r from-cyan-400 via-teal-400 to-green-400 bg-clip-text text-transparent">
          You're all set!
        </h2>
        <p className="text-xl text-zinc-300 mb-8 max-w-sm mx-auto">
          Your agent finished onboarding. Time to start training.
        </p>
        <button
          onClick={onComplete}
          className="px-10 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-400 hover:to-teal-500 text-white shadow-xl shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all"
        >
          Start your journey
        </button>
      </div>
    );
  }

  const progressCount = REQUIRED_FIELDS.length - missingFields.length;
  const total = REQUIRED_FIELDS.length;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-br from-cyan-500 to-teal-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-cyan-500/20 animate-pulse-slow">
          <Loader2 className="w-10 h-10 text-white animate-spin" />
        </div>
        <h2 className="text-3xl font-black mb-2 tracking-tight">
          Your agent is working...
        </h2>
        <p className="text-zinc-400 text-base max-w-md mx-auto">
          Answer your agent's questions. Fields light up here as it saves them.
        </p>
      </div>

      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-zinc-400">
            {progressCount} of {total} fields
          </span>
          <span className="text-sm font-semibold text-cyan-400">
            {Math.round((progressCount / total) * 100)}%
          </span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-teal-500 transition-all duration-700"
            style={{ width: `${(progressCount / total) * 100}%` }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {REQUIRED_FIELDS.map((field) => {
            const value = profile ? profile[field] : null;
            const formatted = formatValue(field, value);
            const filled = !!formatted;
            return (
              <div
                key={field}
                className={`flex items-start gap-3 p-3 rounded-2xl border transition-all duration-500 ${
                  filled
                    ? 'bg-cyan-500/10 border-cyan-500/30'
                    : 'bg-zinc-900/60 border-zinc-800'
                }`}
              >
                <div
                  className={`mt-0.5 w-6 h-6 rounded-lg shrink-0 flex items-center justify-center transition-all ${
                    filled ? 'bg-cyan-500 text-white' : 'bg-zinc-800 text-zinc-600'
                  }`}
                >
                  {filled ? <Check className="w-4 h-4" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      filled ? 'text-cyan-400' : 'text-zinc-500'
                    }`}
                  >
                    {FIELD_LABELS[field]}
                  </div>
                  <div
                    className={`text-sm mt-0.5 truncate ${filled ? 'text-white' : 'text-zinc-600'}`}
                  >
                    {formatted || 'Waiting...'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={`mt-4 p-3 rounded-2xl border transition-all duration-500 ${
            equipment.length > 0
              ? 'bg-cyan-500/10 border-cyan-500/30'
              : 'bg-zinc-900/60 border-zinc-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center ${
                equipment.length > 0 ? 'bg-cyan-500 text-white' : 'bg-zinc-800 text-zinc-600'
              }`}
            >
              {equipment.length > 0 ? <Check className="w-4 h-4" /> : null}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={`text-xs font-semibold uppercase tracking-wider ${
                  equipment.length > 0 ? 'text-cyan-400' : 'text-zinc-500'
                }`}
              >
                Equipment
              </div>
              <div
                className={`text-sm mt-0.5 truncate ${
                  equipment.length > 0 ? 'text-white' : 'text-zinc-600'
                }`}
              >
                {equipment.length > 0 ? equipment.join(', ') : 'Waiting...'}
              </div>
            </div>
          </div>
        </div>

        {pollTimeout && (
          <div className="mt-6 p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700/40 text-sm text-zinc-300 animate-in fade-in duration-500">
            Still waiting? Make sure your agent has the MCP config from the
            previous screen. Then ask it to run onboarding again.
          </div>
        )}

        <div className="mt-8 flex items-center justify-start">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl font-semibold text-zinc-400 hover:text-white hover:bg-zinc-900/50 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            Back to config
          </button>
        </div>
      </div>
    </div>
  );
}
