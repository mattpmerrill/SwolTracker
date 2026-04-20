import { createClient } from '@supabase/supabase-js'
import { createProfilesRepo } from './repositories/profiles'
import { createGymsRepo } from './repositories/gyms'
import { createMaxesRepo } from './repositories/maxes'
import { createProgramsRepo } from './repositories/programs'
import { createLogsRepo } from './repositories/logs'
import { createInsightsRepo } from './repositories/insights'
import { createSocialRepo } from './repositories/social'
import { createAdminAuthRepo } from './repositories/adminAuth'
import { createAppSettingsRepo } from './repositories/appSettings'
import { createPromptsRepo } from './repositories/prompts'
import { createErrorsRepo } from './repositories/errors'
import { createOnboardingRepo } from './repositories/onboarding'
import { createAgentChatRepo } from './repositories/agent-chat'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found.')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Auth helpers
export const signInWithGoogle = async () => {
  if (!supabase) return { error: { message: 'Supabase not configured' } }

  return await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  })
}

export const signOut = async () => {
  if (!supabase) return
  return await supabase.auth.signOut({ scope: 'local' })
}

export const getCurrentUser = async () => {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Compose domain repositories into unified db object
const profilesRepo = createProfilesRepo(supabase)
const gymsRepo = createGymsRepo(supabase)
const maxesRepo = createMaxesRepo(supabase, {
  getGymMembers: gymsRepo.getGymMembers,
})
const programsRepo = createProgramsRepo(supabase)
const logsRepo = createLogsRepo(supabase)
const insightsRepo = createInsightsRepo(supabase)
const socialRepo = createSocialRepo(supabase, {
  getProfile: profilesRepo.getProfile,
  getUserMaxes: maxesRepo.getUserMaxes,
})
const adminAuthRepo = createAdminAuthRepo(supabase)
const appSettingsRepo = createAppSettingsRepo(supabase)
const promptsRepo = createPromptsRepo(supabase)
const errorsRepo = createErrorsRepo(supabase)
const onboardingRepo = createOnboardingRepo(supabase, {
  getProfile: profilesRepo.getProfile,
})
const agentChatRepo = createAgentChatRepo(supabase)

export const db = {
  ...profilesRepo,
  ...gymsRepo,
  ...maxesRepo,
  ...programsRepo,
  ...logsRepo,
  ...insightsRepo,
  ...socialRepo,
  ...adminAuthRepo,
  ...appSettingsRepo,
  ...promptsRepo,
  ...errorsRepo,
  ...onboardingRepo,
  ...agentChatRepo,
}
