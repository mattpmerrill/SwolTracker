import { useState, useCallback } from 'react';
import { db } from '../lib/supabase';
import { generateWithLlm } from '../lib/llm';
import { logError, ErrorCategory, ErrorSeverity } from '../lib/errorService';
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

  const openAiGenerator = useCallback((weekNum) => {
    setGenerationWeek(weekNum);
    setAiNotes('');
    setAiError('');
    setGeneratedPreview(null);
    setWeekCount(4);
    setPreviewWeek('week1');
    setShowAiGenerator(true);
  }, []);

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
          .replace(/\{\{previous_weeks\}\}/g, JSON.stringify(recentWeeks));
      }

      const systemPrompt = promptTemplate || `You are an elite strength and conditioning coach. Generate ${validWeekCount} weeks of workouts in JSON format.`;
      const userPrompt = !promptTemplate ? `Generate a ${validWeekCount}-week workout program starting from Week ${generationWeek}. Athletes: ${athletesInfo}. Equipment: ${equipment.join(', ')}. Previous weeks context: ${JSON.stringify(recentWeeks)}. Recent workout performance: ${recentWorkoutsFormatted}. Notes: ${validNotes || 'None'}. Return JSON only with structure: { week1: { Monday-Sunday }, week2: {...}, ... } - each day having focus and exercises array.` : 'Generate the workout program based on the context provided.';

      const result = await generateWithLlm(provider, systemPrompt, userPrompt, 'weekly', db, currentUser);
      await db.logApiUsage(currentUser, 'weekly_generation', result.model, result.usage.prompt_tokens, result.usage.completion_tokens, true, null);

      const cleanedResponse = result.content.replace(/```json|```/g, '').trim();
      const generatedProgram = JSON.parse(cleanedResponse);

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
  }, [currentUser, profiles, equipment, workoutProgram, gymId, generationWeek, weekCount, aiNotes, toast]);

  const confirmGeneratedWorkout = useCallback(async () => {
    if (!generatedPreview || !generationWeek) return;

    const weekKeys = Object.keys(generatedPreview).filter(k => k.startsWith('week')).sort();
    const updates = {};

    for (let i = 0; i < weekKeys.length; i++) {
      const weekKey = weekKeys[i];
      const targetWeek = generationWeek + i;
      updates[targetWeek] = generatedPreview[weekKey];

      if (gymId) {
        await db.saveWorkoutProgram(gymId, targetWeek, generatedPreview[weekKey], currentUser, true, aiNotes);
      }
    }

    setWorkoutProgram(prev => ({ ...prev, ...updates }));
    setShowAiGenerator(false);
    setGeneratedPreview(null);
    setCurrentWeek(generationWeek);
    toast.success(`${weekKeys.length} week${weekKeys.length > 1 ? 's' : ''} added to your program!`);
  }, [generatedPreview, generationWeek, gymId, currentUser, aiNotes, toast, setWorkoutProgram, setCurrentWeek]);

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
    openAiGenerator,
    generateAiWorkout,
    confirmGeneratedWorkout,
  };
}
