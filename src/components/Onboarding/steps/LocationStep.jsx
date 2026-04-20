import { Home, Building2 } from 'lucide-react';

export default function LocationStep({ onboarding }) {
  const { workoutLocation, setWorkoutLocation } = onboarding;
  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">Where will you workout?</h2>
      <p className="text-zinc-400 mb-8 text-lg">This helps us tailor your workouts</p>
      <div className="flex gap-6 justify-center max-w-md mx-auto">
        <button
          onClick={() => setWorkoutLocation('home')}
          className={`flex-1 p-8 rounded-3xl border transition-all duration-300 group ${
            workoutLocation === 'home'
              ? 'bg-green-500/10 border-green-500/50 text-green-400 shadow-xl shadow-green-500/10 ring-2 ring-green-500/20'
              : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800/50'
          }`}
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-zinc-900 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Home className={`w-10 h-10 ${workoutLocation === 'home' ? 'text-green-400' : 'text-zinc-500'}`} />
          </div>
          <p className="font-bold text-xl mb-1">Home</p>
          <p className="text-xs text-zinc-500 font-medium">Home gym setup</p>
        </button>
        <button
          onClick={() => setWorkoutLocation('gym')}
          className={`flex-1 p-8 rounded-3xl border transition-all duration-300 group ${
            workoutLocation === 'gym'
              ? 'bg-blue-500/10 border-blue-500/50 text-blue-400 shadow-xl shadow-blue-500/10 ring-2 ring-blue-500/20'
              : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800/50'
          }`}
        >
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-zinc-900 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <Building2 className={`w-10 h-10 ${workoutLocation === 'gym' ? 'text-blue-400' : 'text-zinc-500'}`} />
          </div>
          <p className="font-bold text-xl mb-1">Gym</p>
          <p className="text-xs text-zinc-500 font-medium">Commercial gym</p>
        </button>
      </div>
    </div>
  );
}
