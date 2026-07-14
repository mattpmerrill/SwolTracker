import { db } from '../lib/supabase';
import { reportWriteFailure, ErrorCategory } from '../lib/errorService';
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
      toast.success?.('Profile updated');
    } else {
      await reportWriteFailure({
        db,
        toast,
        userId: authUser.id,
        component: 'useProfileActions.js',
        operation: 'handleUpdateProfile',
        message: 'updateProfile returned null/false',
        userMessage: 'Could not save profile. Try again.',
        context: { keys: Object.keys(validUpdates || {}) },
      });
    }
  };

  const handleUploadAvatar = async (file) => {
    if (!authUser) return;
    try {
      const result = await db.uploadAvatar(authUser.id, file);
      if (result?.url) {
        setProfiles((prev) => ({ ...prev, [currentUser]: { ...prev[currentUser], avatar_url: result.url, avatar: null } }));
        toast.success?.('Photo updated');
      } else {
        await reportWriteFailure({
          db,
          toast,
          userId: authUser.id,
          component: 'useProfileActions.js',
          operation: 'handleUploadAvatar',
          message: 'uploadAvatar returned no url',
          userMessage: 'Failed to upload your photo. Please try a smaller image.',
          category: ErrorCategory.AVATAR,
          errorType: 'upload_failed',
        });
      }
    } catch (err) {
      await reportWriteFailure({
        db,
        toast,
        userId: authUser.id,
        component: 'useProfileActions.js',
        operation: 'handleUploadAvatar',
        message: err?.message || 'uploadAvatar threw',
        userMessage: 'Failed to upload your photo. Please try a smaller image.',
        originalError: err,
        category: ErrorCategory.AVATAR,
        errorType: 'upload_failed',
      });
    }
  };

  return { handleUpdateProfile, handleUploadAvatar };
}
