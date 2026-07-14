import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { LOADING_PHRASES } from '../constants/onboardingOptions';
import { canProceed as canProceedFor, compileData } from '../components/SimpleOnboarding/validation';

const SCREENS = ['basics', 'training', 'equipment', 'dates', 'generating'];

/**
 * 4-screen grouped onboarding fallback for users without an AI agent.
 * Collects the same fields as the old 11-step form but batches them into
 * basics → training → equipment → dates, then kicks off workout generation.
 */
export function useSimpleOnboarding({ user, onComplete, onGenerateWorkout }) {
  const [screenIndex, setScreenIndex] = useState(0);

  const [displayName, setDisplayName] = useState(user?.name || user?.email?.split('@')[0] || '');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState(30);
  const [weight, setWeight] = useState(150);
  const [fitnessGoals, setFitnessGoals] = useState([]);
  const [workoutDays, setWorkoutDays] = useState([]);
  const [workoutDuration, setWorkoutDuration] = useState('');
  const [equipment, setEquipment] = useState([]);
  const [workoutLocation, setWorkoutLocation] = useState('');
  const [programStartDate, setProgramStartDate] = useState(() => new Date().toISOString().split('T')[0]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);

  const screen = SCREENS[screenIndex];

  useEffect(() => {
    if (!isGenerating) return undefined;
    setLoadingPhraseIndex(Math.floor(Math.random() * LOADING_PHRASES.length));
    const interval = setInterval(() => {
      setLoadingPhraseIndex((prev) => (prev + 1) % LOADING_PHRASES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const fields = {
    displayName, gender, age, weight,
    fitnessGoals, workoutDays, workoutDuration,
    workoutLocation, equipment, programStartDate,
  };

  const canProceed = () => canProceedFor(screen, fields);

  const handleGenerate = async () => {
    setScreenIndex(SCREENS.indexOf('generating'));
    setIsGenerating(true);
    setGenerationFailed(false);
    setGenerationProgress('Saving your profile...');
    try {
      setGenerationProgress('Creating your personalized workout plan...');
      const success = await onGenerateWorkout(compileData(fields));
      if (!success) {
        setIsGenerating(false);
        setGenerationFailed(true);
        setGenerationProgress('There was an issue generating your workout. Please try again.');
        return;
      }
      setIsGenerating(false);
      setGenerationProgress('Your workout plan is ready!');
      confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
      setTimeout(() => {
        confetti({ particleCount: 100, angle: 60, spread: 55, origin: { x: 0 } });
        confetti({ particleCount: 100, angle: 120, spread: 55, origin: { x: 1 } });
      }, 250);
      setTimeout(() => onComplete(), 2500);
    } catch (err) {
      console.error('Simple onboarding generate failed:', err);
      setIsGenerating(false);
      setGenerationFailed(true);
      setGenerationProgress('Something went wrong. Please try again.');
    }
  };

  const handleNext = async () => {
    if (!canProceed()) return;
    if (screen === 'dates') {
      await handleGenerate();
      return;
    }
    setScreenIndex((i) => Math.min(i + 1, SCREENS.length - 1));
  };

  const handleBack = () => {
    if (screenIndex > 0 && screen !== 'generating') setScreenIndex((i) => i - 1);
  };

  const toggleGoal = (id) => setFitnessGoals((p) => (p.includes(id) ? p.filter((g) => g !== id) : [...p, id]));
  const toggleDay = (id) => setWorkoutDays((p) => (p.includes(id) ? p.filter((d) => d !== id) : [...p, id]));
  const toggleEquipment = (id) => setEquipment((p) => (p.includes(id) ? p.filter((e) => e !== id) : [...p, id]));

  return {
    screen, screenIndex, totalScreens: SCREENS.length - 1,

    displayName, setDisplayName,
    gender, setGender,
    age, setAge,
    weight, setWeight,
    fitnessGoals, toggleGoal,
    workoutDays, toggleDay,
    workoutDuration, setWorkoutDuration,
    equipment, toggleEquipment,
    workoutLocation, setWorkoutLocation,
    programStartDate, setProgramStartDate,

    isGenerating, generationFailed, generationProgress, loadingPhraseIndex,

    canProceed, handleNext, handleBack, handleGenerate,
    onComplete,
  };
}
