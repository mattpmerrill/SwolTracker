import { Brain, Clock } from 'lucide-react';

/**
 * No workout programmed state
 */
export function NoWorkoutState({
  currentWeek,
  actualCurrentWeek,
  groupRole,
  groupLeader,
  isViewingBuddy,
  onGenerateWorkout,
  onGoToCurrentWeek,
}) {
  return (
    <div className="mt-8 text-center py-12">
      <div className="relative w-32 h-32 mx-auto mb-6">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-28 h-28 rounded-full bg-gradient-to-br from-orange-500/20 to-purple-500/20 animate-pulse" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-6xl animate-bounce">🏋️</div>
        </div>
        <div
          className="absolute -top-2 -right-2 text-2xl animate-bounce"
          style={{ animationDelay: '0.1s' }}
        >
          ❓
        </div>
        <div
          className="absolute -bottom-1 -left-1 text-xl animate-bounce"
          style={{ animationDelay: '0.3s' }}
        >
          ✨
        </div>
        <div
          className="absolute top-0 left-0 text-lg animate-bounce"
          style={{ animationDelay: '0.2s' }}
        >
          💭
        </div>
      </div>

      <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-orange-400 to-purple-400 bg-clip-text text-transparent">
        No Workout Planned Yet!
      </h3>

      {groupRole === 'member' ? (
        <>
          <p className="text-zinc-400 max-w-sm mx-auto mb-6 leading-relaxed">
            Week {currentWeek} hasn't been generated yet. Waiting for{' '}
            {groupLeader?.name} to create this week's program.
          </p>
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <div className="py-4 px-6 rounded-xl bg-blue-500/20 border border-blue-500/30 text-center">
              <p className="text-sm text-blue-400 font-medium">
                Following {groupLeader?.name}'s Program
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Check back later or ask them to generate this week
              </p>
            </div>
            <button
              onClick={onGoToCurrentWeek}
              className="py-3 px-6 rounded-xl bg-zinc-800 font-medium hover:bg-zinc-700 transition-colors text-zinc-300"
            >
              ← Back to Current Week
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-zinc-400 max-w-sm mx-auto mb-6 leading-relaxed">
            Week {currentWeek} is uncharted territory! Time to flex those planning
            muscles. Use the AI Coach to generate a killer program for this week.
          </p>
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <button
              onClick={onGenerateWorkout}
              disabled={isViewingBuddy}
              className={`py-4 px-6 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/25 ${
                isViewingBuddy ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Brain className="w-5 h-5" />
              Generate Week {currentWeek} with AI
            </button>
            <button
              onClick={onGoToCurrentWeek}
              className="py-3 px-6 rounded-xl bg-zinc-800 font-medium hover:bg-zinc-700 transition-colors text-zinc-300"
            >
              ← Back to Current Week
            </button>
          </div>
          <div className="mt-8 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50 max-w-sm mx-auto">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
              Pro Tip
            </p>
            <p className="text-sm text-zinc-400">
              🎯 Keep the momentum going by planning ahead. Great progress so far!
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Rest day state
 */
export function RestDayState() {
  return (
    <div className="text-center py-12">
      <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
        <Clock className="w-10 h-10 text-blue-400" />
      </div>
      <h3 className="text-xl font-bold mb-2">Recovery Day</h3>
      <p className="text-zinc-400 max-w-xs mx-auto">
        Rest, stretch, and prepare for tomorrow. Your muscles grow when you
        recover.
      </p>
    </div>
  );
}
