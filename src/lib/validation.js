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

// Chad weekly check-in (ADR-006). Response shapes of /api/checkin and the rows the app reads through
// RLS, as pinned in shared/checkin-contract.ts. Day payloads stay unknown: the server validated them
// and the UI reads them defensively (see utils/chadProposal.js).
const checkinDay = z.enum(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
const checkinStatus = z.enum(['drafting', 'pending', 'applied', 'partial', 'declined', 'expired', 'failed'])

export const checkinStatusResponseSchema = z.object({
  eligible: z.boolean(),
  reason: z.enum(['disabled', 'rollout', 'group_member', 'no_gym']).optional(),
  enabled: z.boolean(),
  configured: z.boolean().default(true),
})

export const checkinSettingsResponseSchema = z.object({ enabled: z.boolean() })

export const checkinDecideResultSchema = z.object({
  status: z.enum(['applied', 'partial', 'declined', 'failed']),
  applied: z.array(z.object({ id: z.string(), day: checkinDay })).default([]),
  skipped: z.array(z.object({ id: z.string(), day: checkinDay, reason: z.string() })).default([]),
})

export const checkinMissedResultSchema = z.object({
  status: z.enum(['accepted', 'declined']),
  fromDay: checkinDay,
  toDay: checkinDay,
})

export const checkinEventResponseSchema = z.object({ queued: z.boolean() })

export const checkinRowSchema = z.object({
  id: z.string().min(1),
  review_week: z.number().int(),
  target_week: z.number().int(),
  status: checkinStatus,
  recap: z.object({
    headline: z.string().default(''),
    wins: z.array(z.string()).default([]),
    watch: z.array(z.string()).default([]),
    tone: z.enum(['normal', 'serious']).default('normal'),
    stats: z.object({ scheduled: z.number(), completed: z.number(), missed: z.number() }).optional(),
  }).default({ headline: '', wins: [], watch: [], tone: 'normal' }),
  changes: z.array(z.object({
    id: z.string().min(1),
    day: checkinDay,
    summary: z.string().default(''),
    reason: z.string().default(''),
    before: z.unknown().nullable().default(null),
    after: z.unknown(),
  })).default([]),
  result: z.object({
    applied: z.array(z.object({ id: z.string(), day: checkinDay })).default([]),
    skipped: z.array(z.object({ id: z.string(), day: checkinDay, reason: z.string() })).default([]),
  }).nullable().default(null),
  expires_at: z.string().nullable().default(null),
  decided_at: z.string().nullable().default(null),
  created_at: z.string().nullable().default(null),
})

export const missedOfferRowSchema = z.object({
  id: z.string().min(1),
  week: z.number().int(),
  from_day: checkinDay,
  to_day: checkinDay,
  status: z.enum(['pending', 'accepted', 'declined', 'expired']),
  expires_at: z.string().nullable().default(null),
  created_at: z.string().nullable().default(null),
})

export const coachSettingsRowSchema = z.object({ weekly_checkin: z.boolean() })

// get_chad_usage(p_days) is admin-only and stable, but the numbers arrive as JSON from a SQL function:
// coerce so one null never blanks the tab.
const usageNumber = z.coerce.number().catch(0)
export const chadUsageSchema = z.object({
  days: usageNumber,
  totals: z.object({
    runs: usageNumber,
    tokens: usageNumber,
    cost_usd: usageNumber,
    active_users: usageNumber,
    cost_per_active_user: z.coerce.number().nullable().catch(null).default(null),
  }).default({ runs: 0, tokens: 0, cost_usd: 0, active_users: 0, cost_per_active_user: null }),
  by_instigation: z.array(z.object({
    instigation: z.string(),
    runs: usageNumber,
    tokens: usageNumber,
    cost_usd: usageNumber,
    active_users: usageNumber,
  })).default([]),
  top_users: z.array(z.object({
    user_id: z.string(),
    email: z.string().nullable().default(null),
    runs: usageNumber,
    tokens: usageNumber,
    cost_usd: usageNumber,
  })).default([]),
  approval: z.object({
    applied: usageNumber,
    partial: usageNumber,
    declined: usageNumber,
    expired: usageNumber,
    open: usageNumber,
    failed: usageNumber,
    approval_rate: z.coerce.number().nullable().catch(null).default(null),
  }).default({ applied: 0, partial: 0, declined: 0, expired: 0, open: 0, failed: 0, approval_rate: null }),
  median_hours_to_decision: z.coerce.number().nullable().catch(null).default(null),
  reliability: z.object({ failures: usageNumber, retries: usageNumber }).default({ failures: 0, retries: 0 }),
  daily_cost: z.array(z.object({
    day: z.string(),
    cost_usd: usageNumber,
    tokens: usageNumber,
    runs: usageNumber,
  })).default([]),
})

// Admin: Chad token prices in $ per million tokens, stored as app_settings chad_price_per_mtok JSON.
export const chadPriceSchema = z.object({
  input: z.number().min(0).max(1000),
  output: z.number().min(0).max(1000),
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