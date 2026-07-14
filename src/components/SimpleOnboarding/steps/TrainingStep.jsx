import { Target, Calendar, Clock, Check } from 'lucide-react';
import { FITNESS_GOALS, DAYS_OF_WEEK, DURATIONS } from '../../../constants/onboardingOptions';

const GOAL_COLORS = {
  orange: 'bg-orange-500/10 border-orange-500/50 text-orange-400',
  red: 'bg-red-500/10 border-red-500/50 text-red-400',
  yellow: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400',
  green: 'bg-green-500/10 border-green-500/50 text-green-400',
  purple: 'bg-purple-500/10 border-purple-500/50 text-purple-400',
};

export default function TrainingStep({ onboarding }) {
  const {
    fitnessGoals, toggleGoal,
    workoutDays, toggleDay,
    workoutDuration, setWorkoutDuration,
  } = onboarding;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-orange-500/20">
          <Target className="w-8 h-8 text-orange-400" />
        </div>
        <h2 className="text-3xl font-black tracking-tight">Your training</h2>
        <p className="text-zinc-400 mt-2">Goals, workout days, and session length.</p>
      </div>

      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Fitness goals</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {FITNESS_GOALS.map((g) => {
              const Icon = g.icon;
              const isSel = fitnessGoals.includes(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => toggleGoal(g.id)}
                  className={`p-3 rounded-2xl border transition-all relative ${
                    isSel ? GOAL_COLORS[g.color] : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <Icon className="w-6 h-6 mx-auto mb-1.5" />
                  <p className="font-semibold text-sm">{g.label}</p>
                  {isSel && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-black" strokeWidth={4} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Workout days
          </label>
          <div className="flex flex-wrap gap-2 justify-center">
            {DAYS_OF_WEEK.map((day) => {
              const isSel = workoutDays.includes(day.id);
              return (
                <button
                  key={day.id}
                  onClick={() => toggleDay(day.id)}
                  className={`w-14 h-14 rounded-2xl border font-bold text-sm transition-all ${
                    isSel
                      ? 'bg-blue-500 text-white border-blue-400 shadow-lg shadow-blue-500/30'
                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white'
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Session length
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {DURATIONS.map((dur) => {
              const isSel = workoutDuration === dur.id;
              return (
                <button
                  key={dur.id}
                  onClick={() => setWorkoutDuration(dur.id)}
                  className={`p-3 rounded-2xl border transition-all ${
                    isSel
                      ? 'bg-purple-500/10 border-purple-500/50 text-purple-400'
                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <p className="font-bold text-sm">{dur.label}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
