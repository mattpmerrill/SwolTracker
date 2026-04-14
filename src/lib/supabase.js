import { createClient } from '@supabase/supabase-js'
import { createProfilesRepo } from './repositories/profiles'
import { createWorkoutsRepo } from './repositories/workouts'
import { createSocialRepo } from './repositories/social'
import { createAdminRepo } from './repositories/admin'
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
const workoutsRepo = createWorkoutsRepo(supabase)
const socialRepo = createSocialRepo(supabase, {
  getProfile: profilesRepo.getProfile,
  getUserMaxes: workoutsRepo.getUserMaxes,
})
const adminRepo = createAdminRepo(supabase, {
  getProfile: profilesRepo.getProfile,
})
const agentChatRepo = createAgentChatRepo(supabase)

export const db = {
  ...profilesRepo,
  ...workoutsRepo,
  ...socialRepo,
  ...adminRepo,
  ...agentChatRepo,
}
