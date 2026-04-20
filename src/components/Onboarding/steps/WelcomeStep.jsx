import { Dumbbell } from 'lucide-react';

export default function WelcomeStep() {
  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="w-24 h-24 bg-zinc-800/50 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-orange-500/10 ring-1 ring-white/10">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-3xl" />
        <Dumbbell className="w-12 h-12 text-orange-500 relative z-10" />
      </div>
      <h1 className="text-5xl font-black mb-6 tracking-tight text-white drop-shadow-sm">
        Welcome to <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">SwolTracker</span>
      </h1>
      <p className="text-xl text-zinc-300 mb-8 leading-relaxed max-w-lg mx-auto">
        Congratulations on taking the first step to getting <span className="text-orange-400 font-bold">SWOL</span>!
      </p>
      <div className="p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50 max-w-md mx-auto backdrop-blur-sm">
        <p className="text-zinc-400 text-sm">
          Let's set up your profile and create a personalized workout plan that will help you crush your fitness goals.
        </p>
      </div>
    </div>
  );
}
