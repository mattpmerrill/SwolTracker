import { Dumbbell, Check } from 'lucide-react';
import { EQUIPMENT } from '../constants';

export default function EquipmentStep({ onboarding }) {
  const { equipment, toggleEquipment } = onboarding;
  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-orange-500/20">
        <Dumbbell className="w-8 h-8 text-orange-400" />
      </div>
      <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">What equipment do you have?</h2>
      <p className="text-zinc-400 mb-8 text-lg">Select all equipment you have access to</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
        {EQUIPMENT.map((eq) => {
          const isSelected = equipment.includes(eq.id);
          return (
            <button
              key={eq.id}
              onClick={() => toggleEquipment(eq.id)}
              className={`p-4 rounded-2xl border transition-all text-sm font-medium relative overflow-hidden group ${
                isSelected
                  ? 'bg-orange-500/10 border-orange-500/50 text-orange-400 shadow-lg shadow-orange-500/10'
                  : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                {isSelected && <Check className="w-4 h-4" />}
                <p>{eq.label}</p>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-zinc-500 mt-6 font-medium">
        {equipment.length} item{equipment.length !== 1 ? 's' : ''} selected
      </p>
    </div>
  );
}
