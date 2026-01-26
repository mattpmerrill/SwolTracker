/**
 * Today's workout focus card with completion ring
 */
export default function WorkoutFocus({
  currentDay,
  workout,
  completionPercentage,
}) {
  if (!workout) return null;

  const focusColors = {
    'Rest Day': 'bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20',
    'Upper Body': 'bg-gradient-to-br from-orange-500/10 to-yellow-500/10 border border-orange-500/20',
    'Lower Body': 'bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20',
  };

  const colorClass = focusColors[workout.focus] || focusColors['Upper Body'];

  return (
    <div className="mt-6 mb-6">
      <div className={`rounded-2xl p-5 ${colorClass}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              {currentDay}
            </span>
            <h3 className="text-2xl font-bold mt-1">{workout.focus}</h3>
            {workout.exercises?.length > 0 && (
              <p className="text-sm text-zinc-400 mt-1">
                {workout.exercises.length} exercises
              </p>
            )}
          </div>
          {workout.focus !== 'Rest Day' && (
            <div className="relative w-16 h-16">
              <svg className="w-16 h-16 transform -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  className="text-zinc-800"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  stroke="url(#gradient)"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${completionPercentage * 1.76} 176`}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#f97316" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                {completionPercentage}%
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
