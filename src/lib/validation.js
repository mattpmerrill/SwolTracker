import { z } from 'zod'
import { BLOCK_ID_RE, isValidBlockScore } from '../utils/workoutBlocks'

// Profile schemas — must accept every field ProfileArea writes.
// program_start_date is deliberately absent: it is write-once (set at onboarding), and this
// schema is strict, so a profile update that includes it fails validation.
export const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  display_name: z.string().min(1).max(100).optional(),
  avatar: z.string().max(10).optional().nullable(),
  avatar_url: z.string().url().max(500).optional().nullable(),
  group_name: z.string().max(100).optional(),
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

export const searchQuerySchema = z.string().min(2).max(50).trim()

// Block score (AMRAP / For Time). Field rules are the table's; the cross-field
// rule is the shared isValidBlockScore, so web, MCP and the CHECK agree.
export const BLOCK_SCORE_NOTE_MAX = 280

export const blockScoreSchema = z.object({
  block_id: z.string().regex(BLOCK_ID_RE),
  benchmark: z.string().regex(BLOCK_ID_RE).nullable().optional(),
  score_type: z.enum(['amrap', 'for_time']),
  rounds: z.number().int().min(0).max(999).nullable().optional(),
  reps: z.number().int().min(0).max(9999).nullable().optional(),
  time_seconds: z.number().int().min(1).max(36000).nullable().optional(),
  capped: z.boolean().default(false),
  note: z.string().trim().max(BLOCK_SCORE_NOTE_MAX, `Note is too long (max ${BLOCK_SCORE_NOTE_MAX} characters)`).nullable().optional(),
}).superRefine((score, ctx) => {
  if (isValidBlockScore(score.score_type, score)) return
  const message = score.score_type === 'amrap'
    ? 'Enter the rounds you completed.'
    : score.capped
      ? 'Enter the rounds or reps you completed before the cap.'
      : 'Enter your finish time as m:ss, or mark that you hit the cap.'
  ctx.addIssue({ code: 'custom', message })
})

// Agent chat schemas
// /api/chad response. Day payloads stay unknown here: the server already
// validated them, and the UI only reads them defensively (see utils/chadProposal.js).
export const chadResponseSchema = z.object({
  reply: z.string().default(''),
  history: z.array(z.unknown()),
  pending: z.object({
    state: z.string().min(1),
    proposal: z.object({
      week: z.number().int(),
      day: z.string(),
      summary: z.string().optional(),
      before: z.unknown().nullable(),
      after: z.unknown(),
    }),
  }).nullable().default(null),
  changed: z.boolean().default(false),
})

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