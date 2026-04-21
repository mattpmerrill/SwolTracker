import { Calendar } from 'lucide-react';

export default function DatesStep({ onboarding }) {
  const {
    programStartDate, setProgramStartDate,
    displayName, fitnessGoals, workoutDays, workoutDuration, equipment,
  } = onboarding;

  const today = new Date().toISOString().split('T')[0];
  const selectedDate = new Date(programStartDate);
  const formattedDate = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const setNextMonday = () => {
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
    setProgramStartDate(nextMonday.toISOString().split('T')[0]);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-emerald-500/20">
          <Calendar className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-3xl font-black tracking-tight">Start date</h2>
        <p className="text-zinc-400 mt-2">Pick week 1's first day. You can start now or wait.</p>
      </div>

      <div className="max-w-md mx-auto space-y-4">
        <input
          type="date"
          value={programStartDate}
          min={today}
          onChange={(e) => setProgramStartDate(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-700/50 rounded-2xl py-4 px-5 text-center text-lg font-bold outline-none text-white focus:border-emerald-500/50 transition-all cursor-pointer [color-scheme:dark]"
        />

        <div className="p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50 text-center">
          <p className="text-emerald-400 font-semibold">{formattedDate}</p>
          <p className="text-zinc-500 text-sm mt-1">Week 1 begins on this day</p>
        </div>

        <div className="flex gap-2 justify-center">
          <button
            onClick={() => setProgramStartDate(today)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              programStartDate === today
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:border-zinc-600'
            }`}
          >
            Today
          </button>
          <button
            onClick={setNextMonday}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:border-zinc-600 transition-all"
          >
            Next Monday
          </button>
        </div>

        <div className="pt-4 p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/50 text-sm text-zinc-300 space-y-1">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Review</div>
          <div><span className="text-zinc-500">Name:</span> {displayName || '—'}</div>
          <div><span className="text-zinc-500">Goals:</span> {fitnessGoals.join(', ') || '—'}</div>
          <div><span className="text-zinc-500">Days:</span> {workoutDays.join(', ') || '—'}</div>
          <div><span className="text-zinc-500">Session:</span> {workoutDuration || '—'}</div>
          <div><span className="text-zinc-500">Equipment:</span> {equipment.length} item{equipment.length === 1 ? '' : 's'}</div>
        </div>
      </div>
    </div>
  );
}
