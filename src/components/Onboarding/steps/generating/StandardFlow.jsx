import { Loader2, Sparkles, AlertCircle, RotateCcw } from 'lucide-react';
import { LOADING_PHRASES } from '../../constants';

export default function StandardFlow({ onboarding }) {
  const { isGenerating, generationFailed, generationProgress, loadingPhraseIndex, handleGenerateWorkout, onComplete } = onboarding;
  const currentPhrase = LOADING_PHRASES[loadingPhraseIndex];

  return (
    <div className="text-center animate-in fade-in zoom-in duration-500">
      <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl ${
        generationFailed
          ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-500/30'
          : 'bg-gradient-to-br from-orange-500 to-purple-600 shadow-orange-500/30 animate-pulse-slow'
      }`}>
        {isGenerating ? <Loader2 className="w-12 h-12 text-white animate-spin" />
          : generationFailed ? <AlertCircle className="w-12 h-12 text-white" />
          : <Sparkles className="w-12 h-12 text-white" />}
      </div>
      <h2 className={`text-4xl font-black mb-6 tracking-tight ${
        generationFailed
          ? 'text-red-400'
          : 'bg-gradient-to-r from-orange-400 via-pink-500 to-purple-500 bg-clip-text text-transparent'
      }`}>
        {isGenerating ? 'Creating Your Plan' : generationFailed ? 'Oops!' : 'All Done!'}
      </h2>
      <p className="text-xl text-zinc-300 mb-8 font-medium">{generationProgress}</p>
      {isGenerating ? (
        <div className="max-w-sm mx-auto">
          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 rounded-full animate-progress" style={{ width: '100%' }} />
          </div>
          <div className="mt-8 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50 min-h-[80px] flex items-center justify-center">
            <div key={loadingPhraseIndex} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <span className="text-3xl mb-2 block">{currentPhrase.emoji}</span>
              <p className="text-zinc-300 font-medium">{currentPhrase.text}</p>
            </div>
          </div>
          <p className="text-xs text-zinc-600 mt-4">Your AI Coach is crafting a personalized 4-week program</p>
        </div>
      ) : generationFailed ? (
        <div className="max-w-sm mx-auto mt-8">
          <button
            onClick={handleGenerateWorkout}
            className="w-full flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 transition-all"
          >
            <RotateCcw className="w-5 h-5" />
            Try Again
          </button>
          <p className="text-zinc-500 text-xs mt-4">If this keeps happening, please contact support</p>
        </div>
      ) : (
        <div className="max-w-sm mx-auto mt-8">
          <p className="text-zinc-400 text-sm mb-4">Redirecting you to your workouts...</p>
          <button
            onClick={onComplete}
            className="w-full px-8 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white shadow-xl shadow-orange-500/20 hover:shadow-orange-500/40 transition-all"
          >
            Start Your Journey
          </button>
        </div>
      )}
    </div>
  );
}
