import { X } from 'lucide-react';

/**
 * Modal for adding a new 1RM lift
 */
export default function AddLiftModal({
  isOpen,
  liftName,
  liftWeight,
  onLiftNameChange,
  onLiftWeightChange,
  onAdd,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6">
        <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Add 1RM Lift</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">
              Lift Name
            </label>
            <input
              type="text"
              value={liftName}
              onChange={(e) => onLiftNameChange(e.target.value)}
              placeholder="e.g. Sumo Deadlift"
              className="w-full px-4 py-3 bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">
              1RM Weight (lbs)
            </label>
            <input
              type="number"
              value={liftWeight}
              onChange={(e) => onLiftWeightChange(e.target.value)}
              placeholder="e.g. 315"
              className="w-full px-4 py-3 bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
          <button
            onClick={onAdd}
            disabled={!liftName.trim() || !liftWeight}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Add Lift
          </button>
        </div>
      </div>
    </div>
  );
}
