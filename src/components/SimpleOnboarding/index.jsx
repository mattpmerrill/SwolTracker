import { Dumbbell, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSimpleOnboarding } from '../../hooks/useSimpleOnboarding';
import { SCREEN_ORDER } from './validation';
import BasicsStep from './steps/BasicsStep';
import TrainingStep from './steps/TrainingStep';
import EquipmentStep from './steps/EquipmentStep';
import DatesStep from './steps/DatesStep';
import GeneratingStep from './steps/GeneratingStep';

const STEP_COMPONENTS = {
  basics: BasicsStep,
  training: TrainingStep,
  equipment: EquipmentStep,
  dates: DatesStep,
  generating: GeneratingStep,
};

export default function SimpleOnboarding({ user, onComplete, onGenerateWorkout }) {
  const onboarding = useSimpleOnboarding({ user, onComplete, onGenerateWorkout });
  const { screen, screenIndex, totalScreens, canProceed, handleNext, handleBack } = onboarding;

  const StepComponent = STEP_COMPONENTS[screen];
  const progress = ((screenIndex + 1) / (totalScreens + 1)) * 100;
  const showNav = screen !== 'generating';
  const isLastForm = screen === 'dates';

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden font-sans">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent opacity-50" />
        <div className="absolute bottom-0 left-0 w-full h-full bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent opacity-50" />
      </div>

      <div className="fixed top-0 left-0 right-0 h-1 bg-zinc-900 z-50">
        <div
          className="h-full bg-gradient-to-r from-orange-500 via-red-500 to-purple-600 transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="relative z-10 pt-10 px-6 flex justify-between items-center max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <Dumbbell className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">SwolTracker</span>
        </div>
        {screen !== 'generating' && (
          <div className="text-sm font-medium text-zinc-500 bg-zinc-900/50 px-4 py-2 rounded-full backdrop-blur-sm border border-zinc-800">
            Step {Math.min(screenIndex + 1, SCREEN_ORDER.length)} of {SCREEN_ORDER.length}
          </div>
        )}
      </div>

      <div className="flex-1 flex items-center justify-center p-6 relative z-10 my-8">
        <div className="w-full max-w-3xl">
          <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 shadow-2xl rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden">
            <div className="absolute -top-32 -left-32 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
            <div className="relative z-10 min-h-[400px] flex flex-col">
              <div className="flex-1">
                {StepComponent && <StepComponent onboarding={onboarding} />}
              </div>
              {showNav && (
                <div className="flex justify-between w-full mt-12">
                  <button
                    onClick={handleBack}
                    className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-semibold transition-all ${
                      screenIndex === 0
                        ? 'opacity-0 pointer-events-none'
                        : 'bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                    <span className="text-lg">Back</span>
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className={`flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-lg transition-all shadow-xl ${
                      canProceed()
                        ? 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white shadow-orange-500/20 hover:shadow-orange-500/40'
                        : 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-800'
                    }`}
                  >
                    {isLastForm ? 'Generate plan' : 'Continue'}
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
