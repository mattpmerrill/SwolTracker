import { Dumbbell } from 'lucide-react';
import { useAgentOnboarding } from '../../hooks/useAgentOnboarding';
import WelcomeScreen from './steps/WelcomeScreen';
import ConnectScreen from './steps/ConnectScreen';
import ConfirmScreen from './steps/ConfirmScreen';

const SCREEN_ORDER = ['welcome', 'connect', 'confirm'];

export default function AgentOnboarding({ user, onComplete, onUseFallback, supabase }) {
  const agentOnboarding = useAgentOnboarding({ user, onComplete, supabase });
  const { screen } = agentOnboarding;

  const stepIndex = SCREEN_ORDER.indexOf(screen);
  const progress = ((stepIndex + 1) / SCREEN_ORDER.length) * 100;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden font-sans">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent opacity-50" />
        <div className="absolute bottom-0 left-0 w-full h-full bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent opacity-50" />
      </div>

      <div className="fixed top-0 left-0 right-0 h-1 bg-zinc-900 z-50">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 via-teal-500 to-purple-600 transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="relative z-10 pt-10 px-6 flex justify-between items-center max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center">
            <Dumbbell className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">SwolTracker</span>
        </div>
        <div className="text-sm font-medium text-zinc-500 bg-zinc-900/50 px-4 py-2 rounded-full backdrop-blur-sm border border-zinc-800">
          Step {stepIndex + 1} of {SCREEN_ORDER.length}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 relative z-10 my-8">
        <div className="w-full max-w-3xl">
          <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 shadow-2xl rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden">
            <div className="absolute -top-32 -left-32 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
            <div className="relative z-10 min-h-[400px] flex flex-col justify-center">
              {screen === 'welcome' && (
                <WelcomeScreen agentOnboarding={agentOnboarding} onUseFallback={onUseFallback} />
              )}
              {screen === 'connect' && <ConnectScreen agentOnboarding={agentOnboarding} />}
              {screen === 'confirm' && <ConfirmScreen agentOnboarding={agentOnboarding} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
