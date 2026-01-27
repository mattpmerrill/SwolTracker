import { Check } from 'lucide-react';
import { ProgressStats, StrengthLevels } from '../components/Progress';

/**
 * Progress tab screen composition
 */
export default function ProgressScreen({
  user,
  totalCompletedWorkouts,
  weeksProgrammed,
}) {
  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-2">Progress</h2>
        <p className="text-zinc-400">Track your gains over time</p>
      </div>

      <ProgressStats
        totalCompletedWorkouts={totalCompletedWorkouts}
        weeksProgrammed={weeksProgrammed}
      />

      <StrengthLevels maxes={user?.maxes} />

      <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
        <div className="flex items-center gap-2 text-green-400">
          <Check className="w-5 h-5" />
          <span className="text-sm font-medium">Progress auto-saved</span>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          Your data persists between sessions
        </p>
      </div>
    </>
  );
}
