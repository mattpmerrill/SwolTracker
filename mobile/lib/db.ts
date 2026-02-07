import { supabase } from './supabase';
import { getPowerSync } from './powersync';

// Import shared repository factories
import { createProfilesRepo } from '../../src/lib/repositories/profiles';
import { createWorkoutsRepo } from '../../src/lib/repositories/workouts';
import { createSocialRepo } from '../../src/lib/repositories/social';
import { createAdminRepo } from '../../src/lib/repositories/admin';

// Compose domain repositories with mobile Supabase client
// Writes go through Supabase (PowerSync queues them offline)
const profilesRepo = createProfilesRepo(supabase);
const workoutsRepo = createWorkoutsRepo(supabase);
const socialRepo = createSocialRepo(supabase, {
  getProfile: profilesRepo.getProfile,
  getUserMaxes: workoutsRepo.getUserMaxes,
});
const adminRepo = createAdminRepo(supabase, {
  getProfile: profilesRepo.getProfile,
});

// Unified db object - same interface as web
// All writes go through Supabase repos (PowerSync handles offline queueing)
// For reads, PowerSync provides local SQLite access via getPowerSync()
export const db = {
  ...profilesRepo,
  ...workoutsRepo,
  ...socialRepo,
  ...adminRepo,
};

// Direct PowerSync SQLite access for fast local reads
export function getLocalDb() {
  return getPowerSync();
}

export type Db = typeof db;
