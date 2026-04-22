import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { db } from '../lib/supabase';
import { STEPS, LOADING_PHRASES } from '../components/Onboarding/constants';

/**
 * Owns all onboarding state + side-effects: form fields, step navigation,
 * agent handshake, workout generation. The presentation layer (step
 * components + container) consumes the returned shape and is otherwise
 * stateless.
 */
export function useOnboarding({ user, onComplete, onGenerateWorkout, onPrepareForAgent, supabase }) {
  const [step, setStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);

  const [hasAgent, setHasAgent] = useState(false);
  const [agentChoice, setAgentChoice] = useState(null);
  const [apiKey, setApiKey] = useState(null);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);
  const [configCopied, setConfigCopied] = useState(false);
  const [contextCopied, setContextCopied] = useState(false);
  const [agentWeeksReceived, setAgentWeeksReceived] = useState(0);
  const [agentGymId, setAgentGymId] = useState(null);
  const [agentPollingTimeout, setAgentPollingTimeout] = useState(false);
  const [pollingGeneration, setPollingGeneration] = useState(0);

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

  const currentStep = STEPS[step];

  useEffect(() => {
    if (!isGenerating) return;
    setLoadingPhraseIndex(Math.floor(Math.random() * LOADING_PHRASES.length));
    const interval = setInterval(() => {
      setLoadingPhraseIndex((prev) => (prev + 1) % LOADING_PHRASES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isGenerating]);

  useEffect(() => {
    if (!hasAgent || !agentGymId || !user?.id || agentWeeksReceived >= 4) return;
    const TIMEOUT_MS = 5 * 60 * 1000;
    let cancelled = false;

    const refreshWeekCount = async () => {
      try {
        const programs = await db.getAllWorkoutPrograms(agentGymId);
        const weekCount = Object.keys(programs).length;
        if (cancelled) return;
        setAgentWeeksReceived((prev) => (weekCount > prev ? weekCount : prev));
        if (weekCount >= 4) {
          confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
          setTimeout(() => {
            confetti({ particleCount: 100, angle: 60, spread: 55, origin: { x: 0 } });
            confetti({ particleCount: 100, angle: 120, spread: 55, origin: { x: 1 } });
          }, 250);
        }
      } catch (err) {
        console.error('Week count refresh error:', err);
      }
    };

    // Seed: catch weeks saved before the subscription is established.
    refreshWeekCount();

    const channel = supabase
      .channel(`onboarding-program-saved-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_events', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const ev = payload.new;
          if (ev?.event_name !== 'program.saved') return;
          if (ev.payload?.gym_id && ev.payload.gym_id !== agentGymId) return;
          refreshWeekCount();
        },
      )
      .subscribe();

    const timeout = setTimeout(() => {
      if (!cancelled) setAgentPollingTimeout(true);
    }, TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [hasAgent, agentGymId, agentWeeksReceived, pollingGeneration, user?.id, supabase]);

  const canProceed = () => {
    switch (currentStep) {
      case 'welcome': return true;
      case 'agent': return true;
      case 'name': return displayName.trim().length > 0;
      case 'gender': return gender !== '';
      case 'age': return age > 0;
      case 'weight': return weight > 0;
      case 'goals': return fitnessGoals.length > 0;
      case 'days': return workoutDays.length > 0;
      case 'duration': return workoutDuration !== '';
      case 'equipment': return equipment.length > 0;
      case 'location': return workoutLocation !== '';
      case 'startDate': return programStartDate !== '';
      default: return false;
    }
  };

  const compileOnboardingData = () => ({
    displayName, gender, age, weightLbs: weight,
    fitnessGoals, workoutDays, workoutDuration,
    workoutLocation, equipment, programStartDate,
  });

  const handleGenerateWorkout = async () => {
    setIsGenerating(true);
    setGenerationFailed(false);
    setGenerationProgress('Saving your profile...');
    try {
      setGenerationProgress('Creating your personalized workout plan...');
      const success = await onGenerateWorkout(compileOnboardingData());
      if (success) {
        setIsGenerating(false);
        setGenerationProgress('Your workout plan is ready!');
        confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
        setTimeout(() => {
          confetti({ particleCount: 100, angle: 60, spread: 55, origin: { x: 0 } });
          confetti({ particleCount: 100, angle: 120, spread: 55, origin: { x: 1 } });
        }, 250);
        setTimeout(() => onComplete(), 2500);
      } else {
        setGenerationProgress('There was an issue generating your workout. Please try again.');
        setIsGenerating(false);
        setGenerationFailed(true);
      }
    } catch (error) {
      console.error('Error during onboarding:', error);
      setGenerationProgress('Something went wrong. Please try again.');
      setIsGenerating(false);
      setGenerationFailed(true);
    }
  };

  const handlePrepareAndPoll = async () => {
    setIsGenerating(true);
    setGenerationFailed(false);
    setGenerationProgress('Setting up your profile...');
    try {
      const result = await onPrepareForAgent(compileOnboardingData());
      if (!result?.gymId) {
        setGenerationFailed(true);
        setGenerationProgress('Failed to set up profile. Please try again.');
        setIsGenerating(false);
        return;
      }
      setAgentGymId(result.gymId);
      setIsGenerating(false);
      setGenerationProgress('');
    } catch (error) {
      console.error('Error preparing for agent:', error);
      setGenerationFailed(true);
      setGenerationProgress('Something went wrong. Please try again.');
      setIsGenerating(false);
    }
  };

  const handleFallbackGenerate = async () => {
    setHasAgent(false);
    setAgentGymId(null);
    setAgentWeeksReceived(0);
    setAgentPollingTimeout(false);
    await handleGenerateWorkout();
  };

  const handleNext = async () => {
    if (step >= STEPS.length - 1) return;
    if (STEPS[step + 1] === 'generating') {
      setStep(step + 1);
      if (hasAgent) await handlePrepareAndPoll();
      else await handleGenerateWorkout();
    } else {
      setStep(step + 1);
    }
  };

  const handleBack = () => { if (step > 0) setStep(step - 1); };

  const toggleGoal = (id) => setFitnessGoals((p) => (p.includes(id) ? p.filter((g) => g !== id) : [...p, id]));
  const toggleDay = (id) => setWorkoutDays((p) => (p.includes(id) ? p.filter((d) => d !== id) : [...p, id]));
  const toggleEquipment = (id) => setEquipment((p) => (p.includes(id) ? p.filter((e) => e !== id) : [...p, id]));

  const handleConnectAgent = async () => {
    setAgentChoice('yes');
    setHasAgent(true);
    try {
      const { data, error } = await supabase.rpc('create_api_key', {
        p_name: 'Onboarding Agent',
        p_scopes: ['read', 'write:logs', 'write:program', 'coach'],
      });
      if (error || !data?.success) {
        console.error('Failed to create API key:', error || data?.error);
        return;
      }
      setApiKey(data.key);
    } catch (err) {
      console.error('Error creating API key:', err);
    }
  };

  const copyToClipboard = (text, setter) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const buildAgentContextBlock = () => `I just set up my SwolTracker profile. Here are my details:

- Name: ${displayName}
- Gender: ${gender} | Age: ${age} | Weight: ${weight} lbs
- Goals: ${fitnessGoals.join(', ')}
- Workout Days: ${workoutDays.join(', ')}
- Duration: ${workoutDuration}
- Equipment: ${equipment.join(', ')}
- Location: ${workoutLocation}

Please use the SwolTracker MCP tools to create my 4-week workout program. Start with \`get_profile\` to confirm my details, then use \`generate_workout_program\` to save weeks 1 through 4.`;

  const retryPolling = () => { setAgentPollingTimeout(false); setPollingGeneration((p) => p + 1); };

  return {
    step, currentStep,
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

    hasAgent, agentChoice, setAgentChoice, setHasAgent,
    apiKey, apiKeyCopied, setApiKeyCopied,
    configCopied, setConfigCopied,
    contextCopied, setContextCopied,
    agentWeeksReceived, agentPollingTimeout,

    canProceed, handleNext, handleBack,
    handleConnectAgent, handleGenerateWorkout, handlePrepareAndPoll, handleFallbackGenerate,
    copyToClipboard, buildAgentContextBlock, retryPolling,
    onComplete,
  };
}
