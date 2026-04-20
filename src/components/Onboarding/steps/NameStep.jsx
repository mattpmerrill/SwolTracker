import { User } from 'lucide-react';

export default function NameStep({ onboarding }) {
  const { displayName, setDisplayName } = onboarding;
  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-blue-500/20">
        <User className="w-8 h-8 text-blue-400" />
      </div>
      <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">What should we call you?</h2>
      <p className="text-zinc-400 mb-8 text-lg">This will be your display name in the app</p>
      <div className="relative max-w-sm mx-auto group">
        <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl opacity-20 group-focus-within:opacity-100 transition duration-500 blur"></div>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Enter your name"
          className="relative w-full bg-zinc-900 border border-zinc-700/50 rounded-2xl py-5 px-6 text-center text-2xl font-bold outline-none text-white placeholder-zinc-700 focus:text-white transition-all shadow-xl"
          autoFocus
        />
      </div>
    </div>
  );
}
