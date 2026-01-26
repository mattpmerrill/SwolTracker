import { X, Brain, Zap, Check, Shield, Package, Plus } from 'lucide-react';

/**
 * Main settings modal
 */
export default function SettingsModal({
  isOpen,
  groupRole,
  groupLeader,
  currentUser,
  userId,
  workoutProgram,
  equipment,
  programStartDate,
  actualCurrentWeek,
  isAdmin,
  onClose,
  onOpenAiGenerator,
  onOpenAdmin,
  onOpenEquipment,
  onRemoveEquipment,
}) {
  if (!isOpen) return null;

  // Find next week without a program
  const getNextUnprogrammedWeek = () => {
    let nextWeek = 1;
    while (workoutProgram[nextWeek]) nextWeek++;
    return nextWeek;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[80vh] overflow-y-auto">
        <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI Coach Section */}
        <div className="mb-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-2xl border border-green-500/20 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold">AI Coach</h3>
              <p className="text-xs text-zinc-400">
                {groupRole === 'member'
                  ? `Following ${groupLeader?.name}'s workouts`
                  : 'Powered by ChatGPT'}
              </p>
            </div>
          </div>

          {groupRole === 'member' ? (
            <div className="w-full py-3 rounded-xl bg-blue-500/20 border border-blue-500/30 text-center">
              <p className="text-sm text-blue-400 font-medium">
                Following {groupLeader?.name}'s Program
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Leave the group to generate your own workouts
              </p>
            </div>
          ) : (
            <button
              onClick={() => {
                onOpenAiGenerator(getNextUnprogrammedWeek());
                onClose();
              }}
              disabled={currentUser !== userId}
              className={`w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm ${
                currentUser !== userId ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <Zap className="w-4 h-4" />
              Generate Next Week's Program
            </button>
          )}

          <div className="mt-4 grid grid-cols-4 gap-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(weekNum => {
              const hasProgram = workoutProgram[weekNum];
              return (
                <div
                  key={weekNum}
                  className={`p-2 rounded-lg border text-center ${
                    hasProgram
                      ? 'bg-green-500/20 border-green-500/30'
                      : 'bg-zinc-800/50 border-zinc-700'
                  }`}
                >
                  <p className="text-xs font-bold text-zinc-300">W{weekNum}</p>
                  {hasProgram && (
                    <Check className="w-3 h-3 text-green-500 mx-auto mt-1" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Admin Section - Only visible to admins */}
        {isAdmin && (
          <div className="mb-6">
            <button
              onClick={() => {
                onClose();
                onOpenAdmin();
              }}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-xl text-purple-400 font-medium hover:from-purple-500/30 hover:to-pink-500/30 transition-all flex items-center justify-center gap-2"
            >
              <Shield className="w-5 h-5" />
              Open Admin Area
            </button>
          </div>
        )}

        {/* Equipment Section */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold flex items-center gap-2">
              <Package className="w-5 h-5 text-orange-500" />
              Gym Equipment
            </h3>
            <button
              onClick={() => {
                onClose();
                onOpenEquipment();
              }}
              className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {equipment.map(item => (
              <div
                key={item}
                className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 rounded-lg text-sm"
              >
                <span>{item}</span>
                <button
                  onClick={() => onRemoveEquipment(item)}
                  className="text-zinc-500 hover:text-red-400"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Program Info */}
        <div className="p-4 bg-zinc-800/50 rounded-xl">
          <h3 className="font-semibold mb-2">Program Started</h3>
          <p className="text-zinc-400 text-sm">
            {new Date(programStartDate).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}
          </p>
          <p className="text-xs text-zinc-500 mt-1">
            Currently on Week {actualCurrentWeek}
          </p>
        </div>
      </div>
    </div>
  );
}
