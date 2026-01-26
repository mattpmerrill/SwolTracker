import { Check, X, Edit3, Trash2, CheckCircle } from 'lucide-react';

/**
 * Single max lift card with edit/delete functionality
 */
export default function MaxCard({
  lift,
  weight,
  isEditing,
  tempValue,
  isSelected,
  isViewingBuddy,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onTempValueChange,
  onDelete,
}) {
  return (
    <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 p-4">
      <div className="flex items-center justify-between">
        <div
          className={`flex-1 cursor-pointer transition-colors ${
            isSelected ? 'text-orange-500' : 'text-white'
          }`}
          onClick={onSelect}
        >
          <h4 className="font-semibold flex items-center gap-2">
            {lift}
            {isSelected && <CheckCircle className="w-4 h-4" />}
          </h4>
        </div>
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={tempValue}
              onChange={(e) => onTempValueChange(e.target.value)}
              className="w-24 px-3 py-2 bg-zinc-800 rounded-lg text-right font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
              autoFocus
            />
            <button
              onClick={onSaveEdit}
              className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center hover:bg-green-400"
            >
              <Check className="w-5 h-5" />
            </button>
            <button
              onClick={onCancelEdit}
              className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center hover:bg-zinc-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className="text-2xl font-bold">{weight}</span>
              <span className="text-zinc-400 ml-1">lbs</span>
            </div>
            {!isViewingBuddy && (
              <>
                <button
                  onClick={onStartEdit}
                  className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center hover:bg-zinc-700"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
                <button
                  onClick={onDelete}
                  className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
