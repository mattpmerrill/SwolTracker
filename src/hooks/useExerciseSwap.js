import { useState, useCallback } from 'react';
import { db } from '../lib/supabase';
import { generateWithLlm } from '../lib/llm';
import { reportWriteFailure, ErrorCategory } from '../lib/errorService';

/**
 * Hook for handling exercise swap/alternative suggestions
 */
export function useExerciseSwap({ equipment, currentUser, toast }) {
  const [swapState, setSwapState] = useState({
    loading: false,
    exerciseIndex: null,
    alternative: null,
  });

  const requestSwap = useCallback(async (exercise, exerciseIndex) => {
    setSwapState({ loading: true, exerciseIndex, alternative: null });

    try {
      const provider = await db.getLlmProvider();

      const systemPrompt = 'You are a fitness expert. Suggest exercise alternatives that target the same muscle groups. Return ONLY valid JSON, no markdown, no explanation.';

      const userPrompt = `Given this exercise: ${exercise.name} targeting ${exercise.muscleGroups} with ${exercise.sets}×${exercise.reps}, suggest ONE alternative exercise that targets the same muscle groups. Available equipment: ${equipment.join(', ')}. Return ONLY valid JSON with this exact schema: { "name": "...", "muscleGroups": "...", "sets": ${exercise.sets}, "reps": "${exercise.reps}", "note": "Alternative for ${exercise.name}" }. Keep the same sets and reps.${exercise.percentages ? ' Include "percentages": [' + exercise.percentages.join(', ') + '] since the original had them.' : ' Do not include percentages.'}`;

      const result = await generateWithLlm(provider, systemPrompt, userPrompt, 'swap', db, currentUser);

      // Extract JSON from the response (LLMs often wrap it in friendly text)
      let cleanedResponse = result.content.replace(/```json/gi, '').replace(/```/g, '').trim();
      const firstBrace = cleanedResponse.indexOf('{');
      const lastBrace = cleanedResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedResponse = cleanedResponse.slice(firstBrace, lastBrace + 1);
      }

      if (!cleanedResponse) {
        throw new Error('The AI returned an empty response. Try again.');
      }

      const alternative = JSON.parse(cleanedResponse);

      if (!alternative.name || !alternative.muscleGroups || !alternative.sets || !alternative.reps) {
        throw new Error('Invalid exercise format returned');
      }

      setSwapState({ loading: false, exerciseIndex, alternative });
    } catch (error) {
      setSwapState({ loading: false, exerciseIndex: null, alternative: null });
      await reportWriteFailure({
        db,
        toast,
        userId: currentUser,
        component: 'useExerciseSwap.js',
        operation: 'requestSwap',
        message: error?.message || 'requestSwap failed',
        userMessage: 'Failed to find alternative. Try again.',
        originalError: error,
        category: ErrorCategory.LLM,
        context: { exercise: exercise?.name, exerciseIndex },
      });
    }
  }, [equipment, currentUser, toast]);

  const clearSwap = useCallback(() => {
    setSwapState({ loading: false, exerciseIndex: null, alternative: null });
  }, []);

  return {
    swapState,
    requestSwap,
    clearSwap,
  };
}
