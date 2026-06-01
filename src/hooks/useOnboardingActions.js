import { db } from '../lib/supabase';
import { generateWithLlm } from '../lib/llm';
import { logError, ErrorCategory, ErrorSeverity } from '../lib/errorService';

/**
 * Onboarding-time actions: generate the first 4 weeks via the built-in LLM
 * fallback, or just prepare the gym + profile so the user's agent can do it.
 */
export function useOnboardingActions({ authUser, gymId, setGymId }) {
  const ensureOnboardingGym = async () => {
    if (gymId) return gymId;
    const gym = await db.createGym('Personal Gym', authUser.id);
    if (!gym?.id) {
      await logError(db, {
        category: ErrorCategory.DATABASE,
        message: 'Failed to create gym during onboarding: ' + (gym?.error?.message || 'unknown error'),
        severity: ErrorSeverity.CRITICAL,
        userId: authUser?.id,
        component: 'useOnboardingActions.js',
        operation: 'ensureOnboardingGym',
        originalError: gym?.error,
        context: { gymResult: gym },
      });
      return null;
    }
    setGymId(gym.id);
    return gym.id;
  };

  const handleGenerateOnboardingWorkout = async (onboardingData) => {
    if (!authUser) return false;

    try {
      const onboardingGymId = await ensureOnboardingGym();
      if (!onboardingGymId) return false; // ensureOnboardingGym already logged the cause

      const profileSaved = await db.completeOnboarding(authUser.id, onboardingData);
      if (!profileSaved) {
        await logError(db, {
          category: ErrorCategory.DATABASE,
          message: 'Failed to save onboarding profile (complete_onboarding RPC returned false)',
          severity: ErrorSeverity.CRITICAL,
          userId: authUser?.id,
          component: 'useOnboardingActions.js',
          operation: 'handleGenerateOnboardingWorkout.completeOnboarding',
          context: { onboardingData },
        });
        return false;
      }

      const promptTemplate = await db.getPromptTemplate('onboarding_workout_generator');
      if (!promptTemplate) {
        await logError(db, {
          category: ErrorCategory.DATABASE,
          message: 'Onboarding prompt template not found (onboarding_workout_generator)',
          severity: ErrorSeverity.ERROR,
          userId: authUser?.id,
          component: 'useOnboardingActions.js',
          operation: 'handleGenerateOnboardingWorkout.getPromptTemplate',
        });
        return false;
      }

      const provider = await db.getLlmProvider();

      const filledPrompt = promptTemplate
        .replace(/\{\{display_name\}\}/g, onboardingData.displayName)
        .replace(/\{\{gender\}\}/g, onboardingData.gender)
        .replace(/\{\{age\}\}/g, onboardingData.age)
        .replace(/\{\{weight_lbs\}\}/g, onboardingData.weightLbs)
        .replace(/\{\{workout_location\}\}/g, onboardingData.workoutLocation)
        .replace(/\{\{fitness_goals\}\}/g, onboardingData.fitnessGoals.join(', '))
        .replace(/\{\{workout_days\}\}/g, onboardingData.workoutDays.join(', '))
        .replace(/\{\{workout_duration\}\}/g, onboardingData.workoutDuration)
        .replace(/\{\{equipment\}\}/g, onboardingData.equipment.join(', '));

      const systemPrompt = 'You are an expert fitness coach. Generate a workout program as JSON only, no markdown, no comments, no explanations. Return ONLY valid JSON.';
      const result = await generateWithLlm(provider, systemPrompt, filledPrompt, 'onboarding', db, authUser.id);
      await db.logApiUsage(authUser.id, 'onboarding_workout', result.model, result.usage.prompt_tokens, result.usage.completion_tokens, true, null);

      let cleanedResponse = result.content.replace(/```json/gi, '').replace(/```/g, '').trim();
      const firstBrace = cleanedResponse.indexOf('{');
      const lastBrace = cleanedResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedResponse = cleanedResponse.slice(firstBrace, lastBrace + 1);
      }

      let generatedProgram;
      try {
        generatedProgram = JSON.parse(cleanedResponse);
      } catch (parseError) {
        await logError(db, {
          category: ErrorCategory.PARSING,
          message: 'Failed to parse AI workout response: ' + parseError.message,
          severity: ErrorSeverity.ERROR,
          userId: authUser?.id,
          component: 'swoltracker.jsx',
          operation: 'handleGenerateOnboardingWorkout.parseJson',
          originalError: parseError,
          context: { responseSnippet: cleanedResponse.substring(0, 500), responseLength: cleanedResponse.length, onboardingData },
        });
        throw new Error('The AI returned an invalid response. Please try again.', { cause: parseError });
      }

      for (let week = 1; week <= 4; week++) {
        const weekKey = `week${week}`;
        if (generatedProgram[weekKey]) {
          await db.saveWorkoutProgram(onboardingGymId, week, generatedProgram[weekKey], authUser.id, true, 'Generated during onboarding');
        }
      }

      return true;
    } catch (error) {
      console.error('Error generating onboarding workout:', error);
      await logError(db, {
        category: ErrorCategory.LLM,
        message: error.message || 'Failed to generate onboarding workout',
        severity: ErrorSeverity.ERROR,
        userId: authUser?.id,
        component: 'swoltracker.jsx',
        operation: 'handleGenerateOnboardingWorkout',
        originalError: error,
        context: { onboardingData },
      });
      return false;
    }
  };

  const handlePrepareForAgent = async (onboardingData) => {
    if (!authUser) return null;

    try {
      const onboardingGymId = await ensureOnboardingGym();
      if (!onboardingGymId) return null; // ensureOnboardingGym already logged the cause

      const profileSaved = await db.completeOnboarding(authUser.id, onboardingData);
      if (!profileSaved) {
        await logError(db, {
          category: ErrorCategory.DATABASE,
          message: 'Failed to save onboarding profile during agent prep (complete_onboarding RPC returned false)',
          severity: ErrorSeverity.CRITICAL,
          userId: authUser?.id,
          component: 'useOnboardingActions.js',
          operation: 'handlePrepareForAgent.completeOnboarding',
          context: { onboardingData },
        });
        return null;
      }

      return { gymId: onboardingGymId };
    } catch (error) {
      console.error('Error preparing for agent:', error);
      await logError(db, {
        category: ErrorCategory.DATABASE,
        message: error.message || 'Failed to prepare for agent during onboarding',
        severity: ErrorSeverity.ERROR,
        userId: authUser?.id,
        component: 'useOnboardingActions.js',
        operation: 'handlePrepareForAgent',
        originalError: error,
        context: { onboardingData },
      });
      return null;
    }
  };

  return {
    handleGenerateOnboardingWorkout,
    handlePrepareForAgent,
  };
}
