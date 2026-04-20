export default function AgeStep({ onboarding }) {
  const { age, setAge } = onboarding;
  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">How old are you?</h2>
      <p className="text-zinc-400 mb-8 text-lg">We'll adjust intensity based on your age</p>
      <div className="flex items-center justify-center gap-8">
        <button
          onClick={() => setAge(Math.max(13, age - 1))}
          className="w-16 h-16 bg-zinc-800/50 hover:bg-zinc-700 hover:scale-105 rounded-2xl text-3xl font-bold transition-all border border-zinc-700/50 flex items-center justify-center"
        >-</button>
        <div className="w-40 text-center">
          <div className="text-7xl font-black text-white tracking-tighter drop-shadow-lg">{age}</div>
          <div className="text-zinc-500 text-base font-medium mt-2">years old</div>
        </div>
        <button
          onClick={() => setAge(Math.min(99, age + 1))}
          className="w-16 h-16 bg-zinc-800/50 hover:bg-zinc-700 hover:scale-105 rounded-2xl text-3xl font-bold transition-all border border-zinc-700/50 flex items-center justify-center"
        >+</button>
      </div>
      <div className="max-w-sm mx-auto mt-10 px-4">
        <input
          type="range"
          min="13"
          max="99"
          value={age}
          onChange={(e) => setAge(parseInt(e.target.value))}
          className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-400 transition-all"
        />
      </div>
    </div>
  );
}
