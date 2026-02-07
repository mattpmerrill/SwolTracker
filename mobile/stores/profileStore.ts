import { create } from 'zustand';
import { db } from '../lib/db';

interface ProfileState {
  profile: any | null;
  profiles: Record<string, any>;
  maxes: Record<string, number>;
  equipment: string[];
  gymId: string | null;

  // Actions
  setProfile: (profile: any) => void;
  setProfiles: (profiles: Record<string, any>) => void;
  setMaxes: (maxes: Record<string, number>) => void;
  setEquipment: (equipment: string[]) => void;
  setGymId: (gymId: string | null) => void;

  loadProfile: (userId: string) => Promise<void>;
  updateProfile: (userId: string, updates: any) => Promise<void>;
  updateMax: (userId: string, exerciseName: string, weight: number) => Promise<void>;
  deleteMax: (userId: string, exerciseName: string) => Promise<void>;

  reset: () => void;
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  profiles: {},
  maxes: {},
  equipment: [],
  gymId: null,

  setProfile: (profile) => set({ profile }),
  setProfiles: (profiles) => set({ profiles }),
  setMaxes: (maxes) => set({ maxes }),
  setEquipment: (equipment) => set({ equipment }),
  setGymId: (gymId) => set({ gymId }),

  loadProfile: async (userId) => {
    try {
      const [profile, gyms] = await Promise.all([
        db.getProfile(userId),
        db.getMyGyms(userId),
      ]);

      const gymId = gyms?.[0]?.gym_id || null;
      set({ profile, gymId });

      if (gymId) {
        const [maxes, equipment, members] = await Promise.all([
          db.getUserMaxes(userId),
          db.getGymEquipment(gymId),
          db.getGymMembers(gymId),
        ]);

        // Build profiles map from gym members
        const profiles: Record<string, any> = {};
        if (Array.isArray(members)) {
          for (const member of members) {
            const memberProfile = await db.getProfile(member.user_id);
            const memberMaxes = await db.getUserMaxes(member.user_id);
            if (memberProfile) {
              profiles[member.user_id] = { ...memberProfile, maxes: memberMaxes };
            }
          }
        }

        // Convert maxes array to key-value
        const maxMap: Record<string, number> = {};
        if (Array.isArray(maxes)) {
          maxes.forEach((m: any) => {
            maxMap[m.exercise_name] = m.weight_lbs;
          });
        }

        const equipNames = Array.isArray(equipment) ? equipment.map((e: any) => e.name) : [];

        set({ maxes: maxMap, equipment: equipNames, profiles });
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  },

  updateProfile: async (userId, updates) => {
    await db.updateProfile(userId, updates);
    set((state) => ({
      profile: state.profile ? { ...state.profile, ...updates } : null,
    }));
  },

  updateMax: async (userId, exerciseName, weight) => {
    await db.updateMax(userId, exerciseName, weight);
    set((state) => ({
      maxes: { ...state.maxes, [exerciseName]: weight },
    }));
  },

  deleteMax: async (userId, exerciseName) => {
    await db.deleteMax(userId, exerciseName);
    set((state) => {
      const newMaxes = { ...state.maxes };
      delete newMaxes[exerciseName];
      return { maxes: newMaxes };
    });
  },

  reset: () => set({
    profile: null,
    profiles: {},
    maxes: {},
    equipment: [],
    gymId: null,
  }),
}));
