import { Target, Check } from 'lucide-react';
import { FITNESS_GOALS } from '../constants';

const COLOR_CLASSES = {
  orange: 'bg-orange-500/10 border-orange-500/50 text-orange-400 ring-2 ring-orange-500/20',
  red: 'bg-red-500/10 border-red-500/50 text-red-400 ring-2 ring-red-500/20',
  yellow: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400 ring-2 ring-yellow-500/20',
  green: 'bg-green-500/10 border-green-500/50 text-green-400 ring-2 ring-green-500/20',
  purple: 'bg-purple-500/10 border-purple-500/50 text-purple-400 ring-2 ring-purple-500/20',
};

export default function GoalsStep({ onboarding }) {
  const { fitnessGoals, toggleGoal } = onboarding;
  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-orange-500/20">
        <Target className="w-8 h-8 text-orange-400" />
      </div>
      <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">What are your fitness goals?</h2>
      <p className="text-zinc-400 mb-8 text-lg">Select all that apply</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
        {FITNESS_GOALS.map((goal) => {
          const Icon = goal.icon;
          const isSelected = fitnessGoals.includes(goal.id);
          return (
            <button
              key={goal.id}
              onClick={() => toggleGoal(goal.id)}
              className={`p-6 rounded-3xl border transition-all duration-300 relative group overflow-hidden ${
                isSelected ? COLOR_CLASSES[goal.color] : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
              }`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${isSelected ? 'opacity-100' : ''}`} />
              <Icon className={`w-10 h-10 mx-auto mb-3 transition-colors duration-300 ${isSelected ? '' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
              <p className={`font-bold relative z-10 ${isSelected ? '' : 'text-zinc-400 group-hover:text-zinc-200'}`}>{goal.label}</p>
              {isSelected && (
                <div className="absolute top-3 right-3 animate-in fade-in zoom-in duration-300">
                  <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-black" strokeWidth={4} />
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
