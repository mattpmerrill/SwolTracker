import { Flame, TrendingUp } from 'lucide-react';

/**
 * Progress stats grid showing workouts completed and weeks programmed
 */
export default function ProgressStats({
  totalCompletedWorkouts,
  weeksProgrammed,
}) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 rounded-2xl p-5 border border-orange-500/20">
        <Flame className="w-8 h-8 text-orange-500 mb-3" />
        <p className="text-3xl font-bold">{totalCompletedWorkouts}</p>
        <p className="text-sm text-zinc-400">Workouts Completed</p>
      </div>
      <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-2xl p-5 border border-green-500/20">
        <TrendingUp className="w-8 h-8 text-green-500 mb-3" />
        <p className="text-3xl font-bold">{weeksProgrammed}</p>
        <p className="text-sm text-zinc-400">Weeks Programmed</p>
      </div>
    </div>
  );
}
