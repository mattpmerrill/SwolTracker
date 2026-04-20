import { Clock, Check } from 'lucide-react';
import { DURATIONS } from '../constants';

export default function DurationStep({ onboarding }) {
  const { workoutDuration, setWorkoutDuration } = onboarding;
  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-purple-500/20">
        <Clock className="w-8 h-8 text-purple-400" />
      </div>
      <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">How long do you want to workout?</h2>
      <p className="text-zinc-400 mb-8 text-lg">We'll design workouts that fit your schedule</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
        {DURATIONS.map((dur) => {
          const isSelected = workoutDuration === dur.id;
          return (
            <button
              key={dur.id}
              onClick={() => setWorkoutDuration(dur.id)}
              className={`p-6 rounded-3xl border text-left transition-all ${
                isSelected
                  ? 'bg-purple-500/10 border-purple-500/50 ring-2 ring-purple-500/20'
                  : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <p className={`font-bold text-xl ${isSelected ? 'text-purple-400' : 'text-white'}`}>{dur.label}</p>
                {isSelected && <Check className="w-5 h-5 text-purple-400" />}
              </div>
              <p className={`text-sm ${isSelected ? 'text-purple-300/70' : 'text-zinc-500'}`}>{dur.desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
