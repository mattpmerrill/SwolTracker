import { User, Scale } from 'lucide-react';

const GENDERS = [
  { id: 'male', emoji: '👨', label: 'Male', color: 'blue' },
  { id: 'female', emoji: '👩', label: 'Female', color: 'pink' },
  { id: 'other', emoji: '🧑', label: 'Other', color: 'purple' },
];

const GENDER_CLASSES = {
  blue: 'bg-blue-500/10 border-blue-500/50 text-blue-400',
  pink: 'bg-pink-500/10 border-pink-500/50 text-pink-400',
  purple: 'bg-purple-500/10 border-purple-500/50 text-purple-400',
};

export default function BasicsStep({ onboarding }) {
  const { displayName, setDisplayName, gender, setGender, age, setAge, weight, setWeight } = onboarding;

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
      <div className="text-center">
        <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-blue-500/20">
          <User className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-3xl font-black tracking-tight">The basics</h2>
        <p className="text-zinc-400 mt-2">Quick profile — name, gender, age, weight.</p>
      </div>

      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full bg-zinc-900 border border-zinc-700/50 rounded-2xl py-4 px-5 text-lg font-bold outline-none text-white placeholder-zinc-600 focus:border-blue-500/50 transition-all"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Gender</label>
          <div className="flex gap-3">
            {GENDERS.map((g) => {
              const isSel = gender === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => setGender(g.id)}
                  className={`flex-1 p-4 rounded-2xl border transition-all ${
                    isSel
                      ? GENDER_CLASSES[g.color]
                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-3xl mb-1">{g.emoji}</div>
                  <div className="font-semibold text-sm">{g.label}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block">Age</label>
            <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl p-4 flex items-center gap-3">
              <button
                onClick={() => setAge(Math.max(13, age - 1))}
                className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-xl"
              >−</button>
              <div className="flex-1 text-center">
                <div className="text-3xl font-black text-white">{age}</div>
                <div className="text-xs text-zinc-500">years</div>
              </div>
              <button
                onClick={() => setAge(Math.min(99, age + 1))}
                className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-xl"
              >+</button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" />
              Weight
            </label>
            <div className="bg-zinc-900 border border-zinc-700/50 rounded-2xl p-4 flex items-center gap-3">
              <button
                onClick={() => setWeight(Math.max(50, weight - 5))}
                className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-xl"
              >−</button>
              <div className="flex-1 text-center">
                <div className="text-3xl font-black text-white">{weight}</div>
                <div className="text-xs text-zinc-500">lbs</div>
              </div>
              <button
                onClick={() => setWeight(Math.min(500, weight + 5))}
                className="w-10 h-10 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-xl"
              >+</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
