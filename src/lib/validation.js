import { z } from 'zod'

const programStartDateSchema = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isNaN(Date.parse(value)),
  { message: 'program_start_date must be a calendar date (YYYY-MM-DD) or ISO datetime' },
)

// Profile schemas — must accept every field ProfileArea writes.
export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  display_name: z.string().min(1).max(100).optional(),
  avatar: z.string().max(10).optional().nullable(),
  avatar_url: z.string().url().max(500).optional().nullable(),
  group_name: z.string().max(100).optional(),
  program_start_date: programStartDateSchema.optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  age: z.number().int().min(13).max(99).optional(),
  weight_lbs: z.number().min(50).max(500).optional(),
  fitness_goals: z.array(z.string().max(100)).max(10).optional(),
  workout_days: z.array(z.string().max(20)).max(7).optional(),
  workout_duration: z.string().min(1).max(50).optional(),
  workout_location: z.enum(['home', 'gym']).optional(),
}).strict()

// Workout schemas
export const maxWeightSchema = z.object({
  exerciseName: z.string().min(1).max(100).trim(),
  weight: z.number().int().min(0).max(9999),
})

export const equipmentNameSchema = z.string().min(1).max(100).trim()

export const searchQuerySchema = z.string().min(1).max(100).trim()

// Onboarding schema
export const onboardingSchema = z.object({
  displayName: z.string().min(1).max(100).trim(),
  gender: z.enum(['male', 'female', 'other']),
  age: z.union([z.number().int().min(13).max(99), z.string().min(1).max(3)]),
  weightLbs: z.union([z.number().min(50).max(500), z.string().min(1).max(4)]),
  workoutLocation: z.string().min(1).max(100),
  fitnessGoals: z.array(z.string().max(100)).min(1).max(10),
  workoutDays: z.array(z.string().max(20)).min(1).max(7),
  workoutDuration: z.string().min(1).max(50),
  equipment: z.array(z.string().max(100)).max(50),
  programStartDate: z.string().optional(),
})

// Agent chat schemas
export const agentChatMessageSchema = z.string().trim().min(1, 'Message cannot be empty').max(5000, 'Message too long (max 5000 characters)')

// AI generation schemas
export const aiNotesSchema = z.string().max(1000).optional()

export const weekCountSchema = z.number().int().min(1).max(12)

/**
 * Validate data against a schema, returning { success, data, error }
 */
export function validate(schema, data) {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data, error: null }
  }
  const issues = result.error?.issues ?? result.error?.errors ?? []
  return {
    success: false,
    data: null,
    error: issues.map(e => e.message).join(', ') || 'Invalid input',
  }
}
