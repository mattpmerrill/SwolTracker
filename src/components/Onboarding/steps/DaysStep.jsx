import { Calendar } from 'lucide-react';
import { DAYS_OF_WEEK } from '../constants';

export default function DaysStep({ onboarding }) {
  const { workoutDays, toggleDay } = onboarding;
  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-blue-500/20">
        <Calendar className="w-8 h-8 text-blue-400" />
      </div>
      <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">Which days will you workout?</h2>
      <p className="text-zinc-400 mb-8 text-lg">Select your preferred training days</p>
      <div className="flex flex-wrap justify-center gap-4 max-w-md mx-auto">
        {DAYS_OF_WEEK.map((day) => {
          const isSelected = workoutDays.includes(day.id);
          return (
            <button
              key={day.id}
              onClick={() => toggleDay(day.id)}
              className={`w-16 h-16 rounded-2xl border transition-all font-bold text-lg ${
                isSelected
                  ? 'bg-blue-500 shadow-lg shadow-blue-500/30 text-white border-blue-400 scale-105'
                  : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {day.label}
            </button>
          );
        })}
      </div>
      <div className="mt-8 flex items-center justify-center gap-2 text-zinc-500">
        <span className={`text-2xl font-bold transition-all ${workoutDays.length > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
          {workoutDays.length}
        </span>
        <span>day{workoutDays.length !== 1 ? 's' : ''} selected</span>
      </div>
    </div>
  );
}
