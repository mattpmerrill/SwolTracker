import { Plus } from 'lucide-react';
import { MaxCard, QuickReference } from '../components/Maxes';

/**
 * Maxes (1RM) tab screen composition
 */
export default function MaxesScreen({
  user,
  editingMax,
  tempMaxValue,
  selectedReferenceExercise,
  onSelectReference,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onTempValueChange,
  onDeleteLift,
  onOpenAddLift,
}) {
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold mb-1">1 Rep Maxes</h2>
          <p className="text-zinc-400">Track your strength progress</p>
        </div>
        <button
          onClick={onOpenAddLift}
          className="p-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-3">
        {Object.entries(user?.maxes || {}).map(([lift, weight]) => (
          <MaxCard
            key={lift}
            lift={lift}
            weight={weight}
            isEditing={editingMax === lift}
            tempValue={tempMaxValue}
            isSelected={selectedReferenceExercise === lift}
            onSelect={() => onSelectReference(lift)}
            onStartEdit={() => onStartEdit(lift, weight)}
            onSaveEdit={() => onSaveEdit(lift, tempMaxValue)}
            onCancelEdit={onCancelEdit}
            onTempValueChange={onTempValueChange}
            onDelete={() => onDeleteLift(lift)}
          />
        ))}
      </div>

      <QuickReference
        selectedExercise={selectedReferenceExercise}
        maxWeight={user?.maxes?.[selectedReferenceExercise]}
      />
    </>
  );
}
