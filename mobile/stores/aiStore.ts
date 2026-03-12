import { create } from 'zustand';
import { db } from '../lib/db';
import { callLlmProvider } from '../lib/llm';
import { validate, aiNotesSchema, weekCountSchema } from '../../src/lib/validation';

interface AiState {
  aiNotes: string;
  aiLoading: boolean;
  aiError: string;
  generationContextLoading: boolean;
  generatedPreview: any | null;
  generationWeek: number | null;
  weekCount: number;
  previewWeek: string;
  showAiGenerator: boolean;
  trainingHistorySummary: any | null;
  overloadRecommendations: any[];

  // Actions
  setAiNotes: (notes: string) => void;
  setWeekCount: (count: number) => void;
  setPreviewWeek: (week: string) => void;
  setShowAiGenerator: (show: boolean) => void;
  setGeneratedPreview: (preview: any | null) => void;
  loadGenerationContext: (params: { currentUser: string; gymId: string; }) => Promise<void>;

  openAiGenerator: (weekNum: number) => void;
  generateAiWorkout: (params: {
    currentUser: string;
    profiles: Record<string, any>;
    equipment: string[];
    workoutProgram: Record<number, any>;
    gymId: string;
  }) => Promise<void>;
  confirmGeneratedWorkout: (params: {
    currentUser: string;
    gymId: string;
    onComplete: (updates: Record<number, any>, startWeek: number) => void;
  }) => Promise<void>;

  reset: () => void;
}

export const useAiStore = create<AiState>((set, get) => ({
  aiNotes: '',
  aiLoading: false,
  aiError: '',
  generationContextLoading: false,
  generatedPreview: null,
  generationWeek: null,
  weekCount: 4,
  previewWeek: 'week1',
  showAiGenerator: false,
  trainingHistorySummary: null,
  overloadRecommendations: [],

  setAiNotes: (notes) => set({ aiNotes: notes }),
  setWeekCount: (count) => set({ weekCount: count }),
  setPreviewWeek: (week) => set({ previewWeek: week }),
  setShowAiGenerator: (show) => set({ showAiGenerator: show }),
  setGeneratedPreview: (preview) => set({ generatedPreview: preview }),
  loadGenerationContext: async ({ currentUser, gymId }) => {
    set({ generationContextLoading: true, aiError: '' });
    try {
      const [history, overload] = await Promise.all([
        db.getTrainingHistorySummary(currentUser, gymId, 4),
        db.getOverloadRecommendations(currentUser, gymId, 4),
      ]);

      set({
        trainingHistorySummary: history,
        overloadRecommendations: overload?.recommendations || [],
      });
    } catch (error: any) {
      set({ aiError: error.message || 'Failed to load training history.' });
    } finally {
      set({ generationContextLoading: false });
    }
  },

  openAiGenerator: (weekNum) => set({
    generationWeek: weekNum,
    aiNotes: '',
    aiError: '',
    generationContextLoading: false,
    generatedPreview: null,
    weekCount: 4,
    previewWeek: 'week1',
    showAiGenerator: true,
    trainingHistorySummary: null,
    overloadRecommendations: [],
  }),

  generateAiWorkout: async ({ currentUser, profiles, equipment, workoutProgram, gymId }) => {
    const { aiNotes, weekCount, generationWeek } = get();
    set({ aiLoading: true, aiError: '', generatedPreview: null });

    const notesResult = validate(aiNotesSchema, aiNotes);
    const weekResult = validate(weekCountSchema, weekCount);
    if (!weekResult.success) {
      set({ aiError: 'Invalid week count.', aiLoading: false });
      return;
    }
    const validNotes = notesResult.success ? notesResult.data : '';
    const validWeekCount = weekResult.data;

    try {
      const provider = await db.getLlmProvider();
      const apiKey = null;

      const recentWorkoutLogs = await db.getRecentWorkoutLogs(currentUser, 4);

      const recentWeeks: any[] = [];
      for (let w = Math.max(1, (generationWeek || 1) - 3); w < (generationWeek || 1); w++) {
        if (workoutProgram[w]) recentWeeks.push({ week: w, program: workoutProgram[w] });
      }

      let promptTemplate = await db.getPromptTemplate('multi_week_workout_generator');

      const athletesInfo = Object.entries(profiles).map(([_id, p]: [string, any]) =>
        `${p.name}: maxes = ${JSON.stringify(p.maxes || {})}`
      ).join('\n');

      const recentWorkoutsFormatted = recentWorkoutLogs?.length > 0
        ? JSON.stringify(recentWorkoutLogs, null, 2)
        : 'No recent workout data available';
      const trainingHistoryText = get().trainingHistorySummary?.summary || 'No training history summary available';
      const overloadText = get().overloadRecommendations.length > 0
        ? get().overloadRecommendations.map((recommendation: any) => recommendation.message).join('\n')
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
      const userPrompt = !promptTemplate
        ? `Generate a ${validWeekCount}-week workout program starting from Week ${generationWeek}. Athletes: ${athletesInfo}. Equipment: ${equipment.join(', ')}. Previous weeks context: ${JSON.stringify(recentWeeks)}. Training history summary: ${trainingHistoryText}. Progressive overload recommendations: ${overloadText}. Recent workout performance: ${recentWorkoutsFormatted}. Notes: ${validNotes || 'None'}. Return JSON only with structure: { week1: { Monday-Sunday }, week2: {...}, ... } - each day having focus and exercises array.`
        : 'Generate the workout program based on the context provided.';

      const result = await callLlmProvider(provider, apiKey, systemPrompt, userPrompt, 'weekly', db, currentUser);
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

      set({ generatedPreview: generatedProgram, previewWeek: 'week1' });
    } catch (error: any) {
      set({ aiError: error.message || 'Failed to generate workout.' });
    } finally {
      set({ aiLoading: false });
    }
  },

  confirmGeneratedWorkout: async ({ currentUser, gymId, onComplete }) => {
    const { generatedPreview, generationWeek, aiNotes } = get();
    if (!generatedPreview || !generationWeek) return;

    const weekKeys = Object.keys(generatedPreview).filter(k => k.startsWith('week')).sort();
    const updates: Record<number, any> = {};

    for (let i = 0; i < weekKeys.length; i++) {
      const weekKey = weekKeys[i];
      const targetWeek = generationWeek + i;
      updates[targetWeek] = generatedPreview[weekKey];

      if (gymId) {
        await (db as any).saveWorkoutProgram(gymId, targetWeek, generatedPreview[weekKey], currentUser, true, aiNotes || null);
      }
    }

    set({ showAiGenerator: false, generatedPreview: null });
    onComplete(updates, generationWeek);
  },

  reset: () => set({
    aiNotes: '',
    aiLoading: false,
    aiError: '',
    generationContextLoading: false,
    generatedPreview: null,
    generationWeek: null,
    weekCount: 4,
    previewWeek: 'week1',
    showAiGenerator: false,
    trainingHistorySummary: null,
    overloadRecommendations: [],
  }),
}));
