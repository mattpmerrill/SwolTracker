import { db } from '../lib/supabase';
import { validate, profileUpdateSchema } from '../lib/validation';

/**
 * Profile-update + avatar-upload side-effects. Mutates setProfiles and
 * bubbles program_start_date changes to the caller when present.
 */
export function useProfileActions({ authUser, currentUser, setProfiles, setProgramStartDate, toast }) {
  const handleUpdateProfile = async (updates) => {
    if (!authUser) return;
    const { success, data: validUpdates, error } = validate(profileUpdateSchema, updates);
    if (!success) { toast.error(error); return; }
    const updated = await db.updateProfile(authUser.id, validUpdates);
    if (updated) {
      setProfiles((prev) => ({ ...prev, [currentUser]: { ...prev[currentUser], ...updated } }));
      if (validUpdates.program_start_date) setProgramStartDate(validUpdates.program_start_date);
    }
  };

  const handleUploadAvatar = async (file) => {
    if (!authUser) return;
    const result = await db.uploadAvatar(authUser.id, file);
    if (result?.url) {
      setProfiles((prev) => ({ ...prev, [currentUser]: { ...prev[currentUser], avatar_url: result.url, avatar: null } }));
    }
  };

  return { handleUpdateProfile, handleUploadAvatar };
}
