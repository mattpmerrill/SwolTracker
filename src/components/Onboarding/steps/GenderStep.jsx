const OPTIONS = [
  {
    id: 'male', emoji: '👨', label: 'Male',
    selected: 'bg-blue-500/10 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/20',
    hoverBg: 'bg-blue-500/5',
  },
  {
    id: 'female', emoji: '👩', label: 'Female',
    selected: 'bg-pink-500/10 border-pink-500/50 text-pink-400 shadow-lg shadow-pink-500/20',
    hoverBg: 'bg-pink-500/5',
  },
  {
    id: 'other', emoji: '🧑', label: 'Other',
    selected: 'bg-purple-500/10 border-purple-500/50 text-purple-400 shadow-lg shadow-purple-500/20',
    hoverBg: 'bg-purple-500/5',
  },
];

export default function GenderStep({ onboarding }) {
  const { gender, setGender } = onboarding;
  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">What's your gender?</h2>
      <p className="text-zinc-400 mb-8 text-lg">This helps us customize your workouts</p>
      <div className="flex gap-4 justify-center max-w-md mx-auto">
        {OPTIONS.map((o) => {
          const isSel = gender === o.id;
          return (
            <button
              key={o.id}
              onClick={() => setGender(o.id)}
              className={`flex-1 p-8 rounded-3xl border transition-all duration-300 relative group overflow-hidden ${
                isSel ? o.selected : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
              }`}
            >
              <div className={`absolute inset-0 ${o.hoverBg} opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${isSel ? 'opacity-100' : ''}`} />
              <div className="text-6xl mb-4 transform group-hover:scale-110 transition-transform duration-300">{o.emoji}</div>
              <p className="font-bold text-xl relative z-10">{o.label}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
