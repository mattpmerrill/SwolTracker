import { supabase } from './supabase';
import { getPowerSync } from './powersync';

// Import shared repository factories
import { createProfilesRepo } from '../../src/lib/repositories/profiles';
import { createGymsRepo } from '../../src/lib/repositories/gyms';
import { createMaxesRepo } from '../../src/lib/repositories/maxes';
import { createProgramsRepo } from '../../src/lib/repositories/programs';
import { createLogsRepo } from '../../src/lib/repositories/logs';
import { createInsightsRepo } from '../../src/lib/repositories/insights';
import { createSocialRepo } from '../../src/lib/repositories/social';
import { createAdminAuthRepo } from '../../src/lib/repositories/adminAuth';
import { createAppSettingsRepo } from '../../src/lib/repositories/appSettings';
import { createPromptsRepo } from '../../src/lib/repositories/prompts';
import { createErrorsRepo } from '../../src/lib/repositories/errors';
import { createOnboardingRepo } from '../../src/lib/repositories/onboarding';

// Compose domain repositories with mobile Supabase client
// Writes go through Supabase (PowerSync queues them offline)
const profilesRepo = createProfilesRepo(supabase);
const gymsRepo = createGymsRepo(supabase);
const maxesRepo = createMaxesRepo(supabase, {
  getGymMembers: gymsRepo.getGymMembers,
});
const programsRepo = createProgramsRepo(supabase);
const logsRepo = createLogsRepo(supabase);
const insightsRepo = createInsightsRepo(supabase);
const socialRepo = createSocialRepo(supabase, {
  getProfile: profilesRepo.getProfile,
  getUserMaxes: maxesRepo.getUserMaxes,
});
const adminAuthRepo = createAdminAuthRepo(supabase);
const appSettingsRepo = createAppSettingsRepo(supabase);
const promptsRepo = createPromptsRepo(supabase);
const errorsRepo = createErrorsRepo(supabase);
const onboardingRepo = createOnboardingRepo(supabase, {
  getProfile: profilesRepo.getProfile,
});

// Unified db object - same interface as web
// All writes go through Supabase repos (PowerSync handles offline queueing)
// For reads, PowerSync provides local SQLite access via getPowerSync()
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
};

// Direct PowerSync SQLite access for fast local reads
export function getLocalDb() {
  return getPowerSync();
}

export type Db = typeof db;
