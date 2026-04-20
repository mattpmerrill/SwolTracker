import { Scale } from 'lucide-react';

export default function WeightStep({ onboarding }) {
  const { weight, setWeight } = onboarding;
  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-green-500/20">
        <Scale className="w-8 h-8 text-green-400" />
      </div>
      <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">What's your current weight?</h2>
      <p className="text-zinc-400 mb-8 text-lg">We'll use this to calculate your workout weights</p>
      <div className="flex items-center justify-center gap-8">
        <button
          onClick={() => setWeight(Math.max(50, weight - 5))}
          className="w-16 h-16 bg-zinc-800/50 hover:bg-zinc-700 hover:scale-105 rounded-2xl text-3xl font-bold transition-all border border-zinc-700/50 flex items-center justify-center"
        >-</button>
        <div className="w-48 text-center">
          <div className="text-7xl font-black text-white tracking-tighter drop-shadow-lg">{weight}</div>
          <div className="text-zinc-500 text-base font-medium mt-2">pounds</div>
        </div>
        <button
          onClick={() => setWeight(Math.min(500, weight + 5))}
          className="w-16 h-16 bg-zinc-800/50 hover:bg-zinc-700 hover:scale-105 rounded-2xl text-3xl font-bold transition-all border border-zinc-700/50 flex items-center justify-center"
        >+</button>
      </div>
      <div className="max-w-sm mx-auto mt-10 px-4">
        <input
          type="range"
          min="50"
          max="400"
          step="5"
          value={weight}
          onChange={(e) => setWeight(parseInt(e.target.value))}
          className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500 hover:accent-green-400 transition-all"
        />
      </div>
    </div>
  );
}
