import { useState, useCallback } from 'react';
import { db } from '../lib/supabase';
import { callLlmProvider } from '../lib/llm';
import { logError, ErrorCategory, ErrorSeverity } from '../lib/errorService';

/**
 * Hook for AI workout generation
 */
export function useAiWorkout({
  currentUser,
  gymId,
  profiles,
  equipment,
  workoutProgram,
  exerciseLog,
  setWorkoutProgram,
  setCurrentWeek,
  toast,
}) {
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const [aiNotes, setAiNotes] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [generatedPreview, setGeneratedPreview] = useState(null);
  const [generationWeek, setGenerationWeek] = useState(null);

  // Get context from recent weeks for AI
  const getRecentWeeksContext = useCallback((targetWeek) => {
    const weeksToInclude = [];
    for (let w = Math.max(1, targetWeek - 3); w < targetWeek; w++) {
      if (workoutProgram[w]) {
        weeksToInclude.push({ week: w, program: workoutProgram[w] });
      }
    }
    return weeksToInclude;
  }, [workoutProgram]);

  // Get progress data for recent weeks
  const getProgressForWeeks = useCallback((weeks) => {
    const progress = {};
    weeks.forEach(({ week }) => {
      progress[week] = {};
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      dayNames.forEach(day => {
        const dayLog = [];
        Object.keys(exerciseLog).forEach(key => {
          if (key.includes(`-${week}-${day}-`) && exerciseLog[key]?.completed) {
            dayLog.push(exerciseLog[key]);
          }
        });
        if (dayLog.length > 0) {
          progress[week][day] = dayLog;
        }
      });
    });
    return progress;
  }, [exerciseLog]);

  // Open the AI generator modal
  const openAiGenerator = useCallback((weekNum) => {
    setGenerationWeek(weekNum);
    setAiNotes('');
    setAiError('');
    setGeneratedPreview(null);
    setShowAiGenerator(true);
  }, []);

  // Close the AI generator modal
  const closeAiGenerator = useCallback(() => {
    setShowAiGenerator(false);
    setGeneratedPreview(null);
  }, []);

  // Generate workout with AI
  const generateAiWorkout = useCallback(async () => {
    setAiLoading(true);
    setAiError('');
    setGeneratedPreview(null);

    try {
      // Get the LLM provider and API key
      const provider = await db.getLlmProvider();
      const apiKey = await db.getGlobalApiKey();
      if (!apiKey) {
        setAiError('No API key configured. Please contact the administrator.');
        setAiLoading(false);
        return;
      }

      const recentWeeks = getRecentWeeksContext(generationWeek);
      const progressData = getProgressForWeeks(recentWeeks);

      const systemPrompt = `You are an elite strength and conditioning coach with 20+ years of experience training athletes. You design periodized programs that build systematically on previous weeks while preventing overtraining and promoting recovery.

Your philosophy:
- Progressive overload is key but must be balanced with recovery
- Exercise variety prevents plateaus and keeps athletes engaged
- Compound movements form the foundation, accessory work fills gaps
- Conditioning should complement strength work, not detract from it
- Every workout should have purpose and build toward long-term goals

You will generate a complete week of workouts in JSON format that can be directly parsed. Be precise and follow the exact structure provided.`;

      const userPrompt = `Generate Week ${generationWeek} workout program for the following athlete(s):

## ATHLETE PROFILES:
${Object.entries(profiles).map(([id, p]) => `
**${p.name}** (${p.avatar})
Current 1RM Maxes:
${Object.entries(p.maxes || {}).map(([lift, weight]) => `- ${lift}: ${weight} lbs`).join('\n')}
`).join('\n')}

## AVAILABLE GYM EQUIPMENT:
${equipment.join(', ')}

## PREVIOUS WEEKS PROGRAMMING:
${recentWeeks.length > 0 ? recentWeeks.map(({ week, program }) => `
### Week ${week}:
${Object.entries(program).filter(([day]) => day !== 'Sunday').map(([day, workout]) => `
**${day} - ${workout.focus}:**
${workout.exercises?.map(ex => `- ${ex.name}: ${ex.sets}x${ex.reps}${ex.percentages ? ` @ ${ex.percentages.join('/')}% 1RM` : ''}`).join('\n') || 'Rest Day'}
`).join('')}
`).join('\n') : 'No previous weeks available - create a foundational program.'}

## LOGGED PROGRESS FROM RECENT WEEKS:
${Object.keys(progressData).length > 0 ? JSON.stringify(progressData, null, 2) : 'No logged progress yet - this may be their first week tracking.'}

## ATHLETE'S NOTES & REQUESTS:
${aiNotes || 'No specific requests - continue progressive programming based on previous weeks.'}

## INSTRUCTIONS:
1. Create a 6-day program (Monday-Saturday, Sunday is always rest)
2. Follow the same weekly structure: alternate Upper Body and Lower Body days
3. Use percentages of 1RM for main lifts (typically 65%, 70%, 75% across 3 sets)
4. Progress appropriately from previous weeks (slightly increased volume or intensity)
5. Include a conditioning finisher for each day
6. Only use exercises possible with the available equipment
7. Match the style and format of previous weeks

## REQUIRED JSON FORMAT:
Respond with ONLY valid JSON in this exact structure (no markdown, no explanation, just JSON):
{
  "Monday": {
    "focus": "Upper Body",
    "exercises": [
      {
        "name": "Exercise Name",
        "sets": 3,
        "reps": "8-12",
        "percentages": [65, 70, 75],
        "muscleGroups": "Primary, Secondary",
        "note": "Optional coaching note"
      }
    ]
  },
  "Tuesday": { ... },
  "Wednesday": { ... },
  "Thursday": { ... },
  "Friday": { ... },
  "Saturday": { ... },
  "Sunday": { "focus": "Rest Day", "exercises": [] }
}

For exercises without percentage-based loading (bodyweight, conditioning, etc.), set "percentages": null.`;

      let result;
      try {
        result = await callLlmProvider(provider, apiKey, systemPrompt, userPrompt, 'weekly', db, currentUser);
      } catch (error) {
        // Log failed API call (error already logged by LLM service)
        await db.logApiUsage(currentUser, 'weekly_generation', provider, null, null, false, error.message);
        throw error; // Re-throw with user-friendly message from LLM service
      }

      // Log successful API usage
      await db.logApiUsage(currentUser, 'weekly_generation', result.model, result.usage.prompt_tokens, result.usage.completion_tokens, true, null);

      // Parse the JSON response
      const cleanedResponse = result.content.replace(/```json|```/g, '').trim();
      let generatedProgram;
      try {
        generatedProgram = JSON.parse(cleanedResponse);
      } catch (parseError) {
        // Log parsing error with context
        await logError(db, {
          category: ErrorCategory.PARSING,
          message: 'Failed to parse AI workout response',
          severity: ErrorSeverity.ERROR,
          userId: currentUser,
          component: 'useAiWorkout.js',
          operation: 'generateAiWorkout.parseJson',
          originalError: parseError,
          context: { responseSnippet: cleanedResponse.substring(0, 500) }
        });
        throw new Error('The AI response was in an unexpected format. Please try again.');
      }

      // Validate structure
      const requiredDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      for (const day of requiredDays) {
        if (!generatedProgram[day]) {
          throw new Error(`Missing day: ${day}`);
        }
      }

      setGeneratedPreview(generatedProgram);

    } catch (error) {
      console.error('AI Generation Error:', error);
      const errorMessage = error.message || 'Failed to generate workout. Please try again.';
      setAiError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setAiLoading(false);
    }
  }, [generationWeek, profiles, equipment, aiNotes, currentUser, getRecentWeeksContext, getProgressForWeeks, toast]);

  // Confirm and save the generated workout
  const confirmGeneratedWorkout = useCallback(async () => {
    if (!generatedPreview || !generationWeek) return;

    setWorkoutProgram(prev => ({
      ...prev,
      [generationWeek]: generatedPreview
    }));

    // Persist to Supabase
    if (gymId) {
      await db.saveWorkoutProgram(
        gymId,
        generationWeek,
        generatedPreview,
        currentUser,
        true, // aiGenerated
        aiNotes
      );
    }

    setShowAiGenerator(false);
    setGeneratedPreview(null);
    setCurrentWeek(generationWeek);
  }, [generatedPreview, generationWeek, gymId, currentUser, aiNotes, setWorkoutProgram, setCurrentWeek]);

  // Clear the preview to regenerate
  const clearPreview = useCallback(() => {
    setGeneratedPreview(null);
  }, []);

  return {
    showAiGenerator,
    setShowAiGenerator,
    aiNotes,
    setAiNotes,
    aiLoading,
    aiError,
    generatedPreview,
    generationWeek,
    openAiGenerator,
    closeAiGenerator,
    generateAiWorkout,
    confirmGeneratedWorkout,
    clearPreview,
  };
}
