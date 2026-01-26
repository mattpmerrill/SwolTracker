import { Target } from 'lucide-react';

/**
 * Quick reference card showing percentages of a selected lift
 */
export default function QuickReference({
  selectedExercise,
  maxWeight,
}) {
  const percentages = [65, 70, 75, 80, 85, 90];

  return (
    <div className="mt-8 p-5 bg-gradient-to-br from-orange-500/10 to-red-500/10 rounded-2xl border border-orange-500/20">
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <Target className="w-5 h-5 text-orange-500" />
        Quick Reference ({selectedExercise})
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {percentages.map(pct => (
          <div key={pct} className="text-center p-3 bg-zinc-900/50 rounded-xl">
            <p className="text-xs text-zinc-400 mb-1">{pct}%</p>
            <p className="font-bold">
              {Math.round((maxWeight || 0) * pct / 100 / 5) * 5}
            </p>
            <p className="text-xs text-zinc-500">lbs</p>
          </div>
        ))}
      </div>
    </div>
  );
}
