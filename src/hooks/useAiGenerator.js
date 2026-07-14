import { useState, useCallback, useEffect } from 'react';
import { db } from '../lib/supabase';
import { generateWithLlm } from '../lib/llm';
import { logError, reportWriteFailure, ErrorCategory, ErrorSeverity } from '../lib/errorService';
import { validate, aiNotesSchema, weekCountSchema } from '../lib/validation';

/**
 * Hook for managing AI workout generation state and logic
 */
export function useAiGenerator({ currentUser, profiles, equipment, workoutProgram, gymId, toast, setWorkoutProgram, setCurrentWeek }) {
  const [aiNotes, setAiNotes] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [generatedPreview, setGeneratedPreview] = useState(null);
  const [generationWeek, setGenerationWeek] = useState(null);
  const [weekCount, setWeekCount] = useState(4);
  const [previewWeek, setPreviewWeek] = useState('week1');
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const [generationContextLoading, setGenerationContextLoading] = useState(false);
  const [trainingHistorySummary, setTrainingHistorySummary] = useState(null);
  const [overloadRecommendations, setOverloadRecommendations] = useState([]);

  /**
   * @param {number} weekNum - first week to generate
   * @param {{ weekCount?: number }} [options] - optional defaults (Phase 3.7 continuity uses weekCount: 1)
   */
  const openAiGenerator = useCallback((weekNum, options = {}) => {
    const nextCount = Number.isFinite(options.weekCount) ? options.weekCount : 4;
    setGenerationWeek(weekNum);
    setAiNotes('');
    setAiError('');
    setGeneratedPreview(null);
    setWeekCount(nextCount);
    setPreviewWeek('week1');
    setTrainingHistorySummary(null);
    setOverloadRecommendations([]);
    setShowAiGenerator(true);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const loadGenerationContext = async () => {
      if (!showAiGenerator || !currentUser || !gymId) return;

      setGenerationContextLoading(true);
      try {
        const [history, overload] = await Promise.all([
          db.getTrainingHistorySummary(currentUser, gymId, 4),
          db.getOverloadRecommendations(currentUser, gymId, 4),
        ]);

        if (isCancelled) return;
        setTrainingHistorySummary(history);
        setOverloadRecommendations(overload?.recommendations || []);
      } catch (error) {
        if (!isCancelled) {
          setAiError(error.message || 'Failed to load training history.');
        }
      } finally {
        if (!isCancelled) {
          setGenerationContextLoading(false);
        }
      }
    };

    loadGenerationContext();

    return () => {
      isCancelled = true;
    };
  }, [showAiGenerator, currentUser, gymId]);

  const generateAiWorkout = useCallback(async () => {
    setAiLoading(true);
    setAiError('');
    setGeneratedPreview(null);

    // Validate inputs
    const notesResult = validate(aiNotesSchema, aiNotes);
    const weekResult = validate(weekCountSchema, weekCount);
    if (!weekResult.success) { setAiError('Invalid week count.'); setAiLoading(false); return; }
    const validNotes = notesResult.success ? notesResult.data : '';
    const validWeekCount = weekResult.data;

    try {
      const provider = await db.getLlmProvider();

      const recentWorkoutLogs = await db.getRecentWorkoutLogs(currentUser, 4);

      const recentWeeks = [];
      for (let w = Math.max(1, generationWeek - 3); w < generationWeek; w++) {
        if (workoutProgram[w]) recentWeeks.push({ week: w, program: workoutProgram[w] });
      }

      let promptTemplate = await db.getPromptTemplate('multi_week_workout_generator');

      const athletesInfo = Object.entries(profiles).map(([id, p]) =>
        `${p.name}: maxes = ${JSON.stringify(p.maxes || {})}`
      ).join('\n');

      const recentWorkoutsFormatted = recentWorkoutLogs.length > 0
        ? JSON.stringify(recentWorkoutLogs, null, 2)
        : 'No recent workout data available';
      const trainingHistoryText = trainingHistorySummary?.summary || 'No training history summary available';
      const overloadText = overloadRecommendations.length > 0
        ? overloadRecommendations.map((recommendation) => recommendation.message).join('\n')
        : 'No overload recommendations right now';

      const userProfile = profiles[currentUser];

      if (promptTemplate) {
        promptTemplate = promptTemplate
          .replace(/\{\{display_name\}\}/g, userProfile?.name || 'Athlete')
          .replace(/\{\{athletes\}\}/g, athletesInfo)
          .replace(/\{\{equipment\}\}/g, equipment.join(', '))
          .replace(/\{\{start_week\}\}/g, String(generationWeek))
          .replace(/\{\{week_count\}\}/g, String(validWeekCount))
          .replace(/\{\{user_notes\}\}/g, validNotes || 'None')
          .replace(/\{\{recent_workouts\}\}/g, recentWorkoutsFormatted)
          .replace(/\{\{previous_weeks\}\}/g, JSON.stringify(recentWeeks))
          .replace(/\{\{training_history_summary\}\}/g, trainingHistoryText)
          .replace(/\{\{overload_recommendations\}\}/g, overloadText);
      }

      const systemPrompt = promptTemplate || `You are an elite strength and conditioning coach. Generate ${validWeekCount} weeks of workouts in JSON format.`;
      const userPrompt = !promptTemplate ? `Generate a ${validWeekCount}-week workout program starting from Week ${generationWeek}. Athletes: ${athletesInfo}. Equipment: ${equipment.join(', ')}. Previous weeks context: ${JSON.stringify(recentWeeks)}. Training history summary: ${trainingHistoryText}. Progressive overload recommendations: ${overloadText}. Recent workout performance: ${recentWorkoutsFormatted}. Notes: ${validNotes || 'None'}. Return JSON only with structure: { week1: { Monday-Sunday }, week2: {...}, ... } - each day having focus and exercises array.` : 'Generate the workout program based on the context provided.';

      const result = await generateWithLlm(provider, systemPrompt, userPrompt, 'weekly', db, currentUser);
      await db.logApiUsage(currentUser, 'weekly_generation', result.model, result.usage.prompt_tokens, result.usage.completion_tokens, true, null);

      let cleanedResponse = result.content.replace(/```json/gi, '').replace(/```/g, '').trim();
      const firstBrace = cleanedResponse.indexOf('{');
      const lastBrace = cleanedResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedResponse = cleanedResponse.slice(firstBrace, lastBrace + 1);
      }

      if (!cleanedResponse) {
        throw new Error('The AI returned an empty response. Please try again.');
      }

      let generatedProgram;
      try {
        generatedProgram = JSON.parse(cleanedResponse);
      } catch (parseError) {
        await logError(db, {
          category: ErrorCategory.PARSING,
          message: 'Failed to parse AI workout response: ' + parseError.message,
          severity: ErrorSeverity.ERROR,
          userId: currentUser,
          component: 'useAiGenerator.js',
          operation: 'generateAiWorkout.parseJson',
          originalError: parseError,
          context: { responseSnippet: cleanedResponse.substring(0, 500), responseLength: cleanedResponse.length },
        });
        throw new Error('The AI response was incomplete or malformed. Try generating again — this can happen with large programs.');
      }

      const requiredDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      for (let i = 1; i <= validWeekCount; i++) {
        const weekKey = `week${i}`;
        if (!generatedProgram[weekKey]) throw new Error(`Missing ${weekKey} in response`);
        for (const day of requiredDays) {
          if (!generatedProgram[weekKey][day]) throw new Error(`Missing ${day} in ${weekKey}`);
        }
      }

      setGeneratedPreview(generatedProgram);
      setPreviewWeek('week1');
    } catch (error) {
      setAiError(error.message || 'Failed to generate workout.');
      toast.error(error.message);
    } finally {
      setAiLoading(false);
    }
  }, [currentUser, profiles, equipment, workoutProgram, gymId, generationWeek, weekCount, aiNotes, toast, trainingHistorySummary, overloadRecommendations]);

  const confirmGeneratedWorkout = useCallback(async () => {
    if (!generatedPreview || !generationWeek) return;

    const weekKeys = Object.keys(generatedPreview).filter(k => k.startsWith('week')).sort();
    const updates = {};
    const previousProgram = workoutProgram;

    try {
      for (let i = 0; i < weekKeys.length; i++) {
        const weekKey = weekKeys[i];
        const targetWeek = generationWeek + i;
        updates[targetWeek] = generatedPreview[weekKey];

        if (gymId) {
          const saved = await db.saveWorkoutProgram(gymId, targetWeek, generatedPreview[weekKey], currentUser, true, aiNotes);
          if (!saved) {
            throw new Error(`Failed to save week ${targetWeek}`);
          }
        }
      }

      setWorkoutProgram(prev => ({ ...prev, ...updates }));
      setShowAiGenerator(false);
      setGeneratedPreview(null);
      setCurrentWeek(generationWeek);
      toast.success(`${weekKeys.length} week${weekKeys.length > 1 ? 's' : ''} added to your program!`);
    } catch (error) {
      setWorkoutProgram(previousProgram);
      await reportWriteFailure({
        db,
        toast,
        userId: currentUser,
        component: 'useAiGenerator.js',
        operation: 'confirmGeneratedWorkout',
        message: error?.message || 'confirmGeneratedWorkout failed',
        userMessage: 'Could not save the generated program. Try again.',
        originalError: error,
        context: { generationWeek, weekCount: weekKeys.length },
      });
    }
  }, [generatedPreview, generationWeek, gymId, currentUser, aiNotes, toast, setWorkoutProgram, setCurrentWeek, workoutProgram]);

  return {
    aiNotes,
    setAiNotes,
    aiLoading,
    aiError,
    generatedPreview,
    setGeneratedPreview,
    generationWeek,
    weekCount,
    setWeekCount,
    previewWeek,
    setPreviewWeek,
    showAiGenerator,
    setShowAiGenerator,
    generationContextLoading,
    trainingHistorySummary,
    overloadRecommendations,
    openAiGenerator,
    generateAiWorkout,
    confirmGeneratedWorkout,
  };
}
