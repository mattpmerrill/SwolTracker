import {
  X,
  Brain,
  User,
  Package,
  Calendar,
  AlertCircle,
  Zap,
  Loader2,
  CheckCircle,
  Check,
  Clock,
  TrendingUp,
  ShieldAlert,
  PauseCircle,
} from 'lucide-react';
import AvatarDisplay from '../Profile/AvatarDisplay';

/**
 * AI workout generator modal with preview
 */
export default function AiGeneratorModal({
  isOpen,
  generationWeek,
  profiles,
  equipment,
  workoutProgram,
  aiNotes,
  aiLoading,
  aiError,
  generatedPreview,
  weekCount,
  generationContextLoading,
  trainingHistorySummary,
  overloadRecommendations,
  onWeekCountChange,
  previewWeek,
  onPreviewWeekChange,
  onNotesChange,
  onGenerate,
  onConfirm,
  onRegenerate,
  onClose,
}) {
  if (!isOpen) return null;

  // Get the weeks in the preview (week1, week2, etc.)
  const previewWeeks = generatedPreview ? Object.keys(generatedPreview).filter(k => k.startsWith('week')).sort() : [];
  const currentPreviewData = generatedPreview && previewWeek ? generatedPreview[previewWeek] : null;
  const weekSummaries = trainingHistorySummary?.weeks || [];

  // Get weeks to show as context
  const contextWeeks = [generationWeek - 3, generationWeek - 2, generationWeek - 1].filter(w => w > 0);
  const recommendationIcon = {
    increase: TrendingUp,
    deload: ShieldAlert,
    stale: PauseCircle,
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center overflow-y-auto">
      <div className="w-full max-w-2xl bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6 my-4 max-h-[90vh] overflow-y-auto">
        <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
              <Brain className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Review + Generate</h2>
              <p className="text-sm text-zinc-400">
                Adaptive AI coach • starting Week {generationWeek}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg"
            disabled={aiLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!generatedPreview ? (
          <>
            {/* Context Summary */}
            <div className="space-y-4 mb-6">
              {/* Athletes */}
              <div className="bg-zinc-800/50 rounded-xl p-4">
                <h3 className="font-semibold text-sm text-zinc-300 mb-3 flex items-center gap-2">
                  <User className="w-4 h-4 text-orange-500" />
                  Athletes
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(profiles).map(([id, p]) => (
                    <div
                      key={id}
                      className="flex items-center gap-2 bg-zinc-700/50 px-3 py-1.5 rounded-lg"
                    >
                      <AvatarDisplay user={p} size="xs" />
                      <span className="text-sm font-medium">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equipment */}
              <div className="bg-zinc-800/50 rounded-xl p-4">
                <h3 className="font-semibold text-sm text-zinc-300 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-green-500" />
                  Available Equipment ({equipment.length} items)
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {equipment.slice(0, 10).map(item => (
                    <span
                      key={item}
                      className="text-xs bg-zinc-700/50 px-2 py-1 rounded"
                    >
                      {item}
                    </span>
                  ))}
                  {equipment.length > 10 && (
                    <span className="text-xs text-zinc-400 px-2 py-1">
                      +{equipment.length - 10} more
                    </span>
                  )}
                </div>
              </div>

              {/* Previous Weeks */}
              <div className="bg-zinc-800/50 rounded-xl p-4">
                <h3 className="font-semibold text-sm text-zinc-300 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  Review Before Generate
                </h3>
                <div className="flex gap-2">
                  {contextWeeks.map(w => (
                    <div
                      key={w}
                      className={`flex-1 p-3 rounded-lg text-center ${
                        workoutProgram[w]
                          ? 'bg-green-500/20 border border-green-500/30'
                          : 'bg-zinc-700/30 border border-zinc-600/30'
                      }`}
                    >
                      <p className="text-xs text-zinc-400">Week {w}</p>
                      <p className="text-sm font-medium">
                        {workoutProgram[w] ? '✓ Available' : 'No data'}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-zinc-500 mt-3">
                  The AI will also use your last 4 weeks of completed sessions, missed days, and overload flags.
                </p>
              </div>

              <div className="bg-zinc-800/50 rounded-xl p-4">
                <h3 className="font-semibold text-sm text-zinc-300 mb-3 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-cyan-400" />
                  Training History Review
                </h3>
                {generationContextLoading ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading recent training history...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {weekSummaries.length > 0 ? weekSummaries.slice().reverse().map((week) => (
                      <div key={week.week_number} className="rounded-lg border border-zinc-700/50 bg-zinc-900/40 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">Week {week.week_number}</p>
                          <p className="text-xs text-zinc-400">
                            {week.completed_days.length}/{week.scheduled_days.length || week.completed_days.length} days completed
                          </p>
                        </div>
                        {week.missed_days.length > 0 && (
                          <p className="mt-2 text-xs text-amber-300">
                            Missed: {week.missed_days.map((day) => `${day.day_name}${day.reason ? ` (${day.reason})` : ''}`).join(', ')}
                          </p>
                        )}
                        {week.exercise_sessions.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                            {week.exercise_sessions.slice(0, 3).map((session) => (
                              <li key={`${week.week_number}-${session.day_name}-${session.exercise_name}`}>
                                {session.day_name} • {session.exercise_name} • {session.sets_logged} sets @ {session.avg_actual_weight || session.avg_prescribed_weight || 0} lbs • {session.hit_all_reps ? 'reps hit' : 'reps missed'}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )) : (
                      <p className="text-sm text-zinc-400">No recent training history found yet.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="bg-zinc-800/50 rounded-xl p-4">
                <h3 className="font-semibold text-sm text-zinc-300 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  Progressive Overload Signals
                </h3>
                {generationContextLoading ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading recommendations...
                  </div>
                ) : overloadRecommendations.length > 0 ? (
                  <div className="space-y-2">
                    {overloadRecommendations.slice(0, 5).map((recommendation) => {
                      const Icon = recommendationIcon[recommendation.type] || TrendingUp;
                      const tone = recommendation.type === 'increase'
                        ? 'text-emerald-300 border-emerald-500/20 bg-emerald-500/10'
                        : recommendation.type === 'deload'
                        ? 'text-amber-300 border-amber-500/20 bg-amber-500/10'
                        : 'text-zinc-300 border-zinc-600/40 bg-zinc-700/20';

                      return (
                        <div key={recommendation.exercise_name} className={`rounded-lg border p-3 ${tone}`}>
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Icon className="w-4 h-4" />
                            {recommendation.status_label || recommendation.type}
                          </div>
                          <p className="mt-1 text-xs">{recommendation.message}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">No overload adjustments flagged right now.</p>
                )}
              </div>

              {/* Program Length Selection */}
              <div className="bg-zinc-800/50 rounded-xl p-4">
                <h3 className="font-semibold text-sm text-zinc-300 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-purple-500" />
                  Program Length
                </h3>
                <div className="flex gap-2">
                  {[2, 4, 6].map(count => (
                    <button
                      key={count}
                      onClick={() => onWeekCountChange(count)}
                      className={`flex-1 py-3 rounded-xl text-center font-semibold transition-all ${
                        weekCount === count
                          ? 'bg-purple-500/20 border-2 border-purple-500 text-purple-400'
                          : 'bg-zinc-700/50 border-2 border-transparent text-zinc-400 hover:text-white'
                      }`}
                    >
                      {count} Weeks
                    </button>
                  ))}
                </div>
                <p className="text-xs text-zinc-500 mt-2 text-center">
                  Generating weeks {generationWeek} - {generationWeek + weekCount - 1}
                </p>
              </div>
            </div>

            {/* Notes Input */}
            <div className="mb-6">
              <label className="text-sm font-medium text-zinc-300 mb-2 block">
                Special Requests or Notes for AI Coach
              </label>
              <textarea
                value={aiNotes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Examples:
• Focus more on upper body this week
• Include more Olympic lifting
• I have a shoulder injury - avoid overhead pressing
• Increase conditioning intensity
• Add more core work"
                className="w-full h-32 px-4 py-3 bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm resize-none"
              />
            </div>

            {/* Error Message */}
            {aiError && (
              <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-400 text-sm">
                    Generation Failed
                  </p>
                  <p className="text-sm text-red-300/80 mt-1">{aiError}</p>
                </div>
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={onGenerate}
              disabled={aiLoading}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-green-500/25"
            >
              {aiLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating {weekCount} Weeks...
                </>
              ) : (
                <>
                  <Zap className="w-5 h-5" />
                  Review + Generate {weekCount}-Week Program
                </>
              )}
            </button>

            <p className="text-xs text-zinc-500 text-center mt-4">
              Reviews last 4 weeks of logs, misses, and overload signals before writing the next block
            </p>
          </>
        ) : (
          <>
            {/* Preview Generated Workout */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="font-semibold text-green-400">
                  {previewWeeks.length} Week{previewWeeks.length > 1 ? 's' : ''} Generated Successfully!
                </span>
              </div>

              {/* Week Tabs */}
              {previewWeeks.length > 1 && (
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                  {previewWeeks.map((weekKey, idx) => (
                    <button
                      key={weekKey}
                      onClick={() => onPreviewWeekChange(weekKey)}
                      className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
                        previewWeek === weekKey
                          ? 'bg-purple-500/20 border border-purple-500 text-purple-400'
                          : 'bg-zinc-800 text-zinc-400 hover:text-white'
                      }`}
                    >
                      Week {generationWeek + idx}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {currentPreviewData && Object.entries(currentPreviewData).map(([day, workout]) => (
                  <div key={day} className="bg-zinc-800/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{day}</h4>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          workout.focus === 'Upper Body'
                            ? 'bg-orange-500/20 text-orange-400'
                            : workout.focus === 'Lower Body'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-blue-500/20 text-blue-400'
                        }`}
                      >
                        {workout.focus}
                      </span>
                    </div>
                    {workout.exercises?.length > 0 ? (
                      <ul className="space-y-1">
                        {workout.exercises.map((ex, i) => (
                          <li key={i} className="text-sm text-zinc-400">
                            • {ex.name}: {ex.sets}×{ex.reps}
                            {ex.percentages && (
                              <span className="text-zinc-500">
                                {' '}
                                @ {ex.percentages.join('/')}%
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-zinc-500">Rest and recovery</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onRegenerate}
                className="flex-1 py-4 rounded-xl bg-zinc-800 font-semibold hover:bg-zinc-700 transition-colors"
              >
                Regenerate
              </button>
              <button
                onClick={onConfirm}
                className="flex-1 py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                Add {previewWeeks.length} Week{previewWeeks.length > 1 ? 's' : ''} to Program
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
