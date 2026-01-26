import { BarChart3 } from 'lucide-react';

/**
 * Bar chart showing strength levels across lifts
 */
export default function StrengthLevels({ maxes }) {
  const maxWeight = Math.max(...Object.values(maxes || {}), 0);
  const barScale = maxWeight * 1.2; // Add 20% buffer for visual headroom

  return (
    <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 p-5">
      <h3 className="font-bold mb-4 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-blue-400" />
        Strength Levels
      </h3>
      <div className="space-y-4">
        {Object.keys(maxes || {}).length > 0 ? (
          Object.entries(maxes).map(([lift, weight]) => (
            <div key={lift}>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-zinc-400">{lift}</span>
                <span className="font-semibold">{weight} lbs</span>
              </div>
              <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-500"
                  style={{ width: `${(weight / barScale) * 100}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="text-zinc-500 text-sm">
            No maxes logged yet. Add your 1RMs in the Maxes tab!
          </p>
        )}
      </div>
    </div>
  );
}
