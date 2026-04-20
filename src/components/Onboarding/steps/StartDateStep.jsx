import { Calendar } from 'lucide-react';

export default function StartDateStep({ onboarding }) {
  const { programStartDate, setProgramStartDate } = onboarding;
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
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-emerald-500/20">
        <Calendar className="w-8 h-8 text-emerald-400" />
      </div>
      <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">When do you want to start?</h2>
      <p className="text-zinc-400 mb-8 text-lg">Choose the first day of your 4-week program</p>

      <div className="max-w-sm mx-auto">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl opacity-20 group-focus-within:opacity-100 transition duration-500 blur"></div>
          <input
            type="date"
            value={programStartDate}
            min={today}
            onChange={(e) => setProgramStartDate(e.target.value)}
            className="relative w-full bg-zinc-900 border border-zinc-700/50 rounded-2xl py-5 px-6 text-center text-xl font-bold outline-none text-white focus:border-emerald-500/50 transition-all shadow-xl cursor-pointer [color-scheme:dark]"
          />
        </div>

        <div className="mt-6 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
          <p className="text-emerald-400 font-semibold text-lg">{formattedDate}</p>
          <p className="text-zinc-500 text-sm mt-1">Week 1 begins on this day</p>
        </div>

        <div className="mt-6 flex gap-3 justify-center">
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
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              new Date(programStartDate).getDay() === 1 && programStartDate !== today
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:border-zinc-600'
            }`}
          >
            Next Monday
          </button>
        </div>
      </div>
    </div>
  );
}
