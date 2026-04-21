import { Dumbbell, Home, Building2, Check } from 'lucide-react';
import { EQUIPMENT } from '../../Onboarding/constants';

export default function EquipmentStep({ onboarding }) {
  const {
    workoutLocation, setWorkoutLocation,
    equipment, toggleEquipment,
  } = onboarding;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-orange-500/20">
          <Dumbbell className="w-8 h-8 text-orange-400" />
        </div>
        <h2 className="text-3xl font-black tracking-tight">Where and what</h2>
        <p className="text-zinc-400 mt-2">Where you train and what you've got.</p>
      </div>

      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Location</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setWorkoutLocation('home')}
              className={`p-5 rounded-2xl border transition-all ${
                workoutLocation === 'home'
                  ? 'bg-green-500/10 border-green-500/50 text-green-400'
                  : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <Home className="w-7 h-7 mx-auto mb-2" />
              <p className="font-bold">Home</p>
              <p className="text-xs opacity-70 mt-0.5">Home gym</p>
            </button>
            <button
              onClick={() => setWorkoutLocation('gym')}
              className={`p-5 rounded-2xl border transition-all ${
                workoutLocation === 'gym'
                  ? 'bg-blue-500/10 border-blue-500/50 text-blue-400'
                  : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              <Building2 className="w-7 h-7 mx-auto mb-2" />
              <p className="font-bold">Gym</p>
              <p className="text-xs opacity-70 mt-0.5">Commercial</p>
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">
            Equipment ({equipment.length})
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {EQUIPMENT.map((eq) => {
              const isSel = equipment.includes(eq.id);
              return (
                <button
                  key={eq.id}
                  onClick={() => toggleEquipment(eq.id)}
                  className={`p-3 rounded-2xl border transition-all text-sm font-medium ${
                    isSel
                      ? 'bg-orange-500/10 border-orange-500/50 text-orange-400'
                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    {isSel && <Check className="w-3.5 h-3.5" />}
                    <span>{eq.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
