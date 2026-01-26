import { useState, useCallback } from 'react';
import { db } from '../lib/supabase';
import { findMaxKey } from '../utils/workout';

/**
 * Hook for managing 1RM (one rep max) lifts
 */
export function useMaxes({ profiles, setProfiles, currentUser, demoMode }) {
  const [editingMax, setEditingMax] = useState(null);
  const [tempMaxValue, setTempMaxValue] = useState('');
  const [showAddLift, setShowAddLift] = useState(false);
  const [newLiftName, setNewLiftName] = useState('');
  const [newLiftWeight, setNewLiftWeight] = useState('');
  const [selectedReferenceExercise, setSelectedReferenceExercise] = useState('Bench Press');

  // Update an existing max
  const updateMax = useCallback(async (lift, value) => {
    const weight = parseInt(value) || 0;
    setProfiles(prev => ({
      ...prev,
      [currentUser]: {
        ...prev[currentUser],
        maxes: { ...prev[currentUser].maxes, [lift]: weight }
      }
    }));
    setEditingMax(null);
    if (!demoMode) {
      await db.updateMax(currentUser, lift, weight);
    }
  }, [currentUser, setProfiles, demoMode]);

  // Add a new lift
  const addNewLift = useCallback(async () => {
    if (!newLiftName.trim() || !newLiftWeight) return;
    const weight = parseInt(newLiftWeight);
    setProfiles(prev => ({
      ...prev,
      [currentUser]: {
        ...prev[currentUser],
        maxes: { ...prev[currentUser].maxes, [newLiftName]: weight }
      }
    }));
    setNewLiftName('');
    setNewLiftWeight('');
    setShowAddLift(false);
    if (!demoMode) {
      await db.updateMax(currentUser, newLiftName.trim(), weight);
    }
  }, [newLiftName, newLiftWeight, currentUser, setProfiles, demoMode]);

  // Quick-add 1RM from workout view - pre-fills exercise name
  const openQuickAddMax = useCallback((exerciseName, userMaxes) => {
    // Try to find a canonical name for the exercise
    const maxKey = findMaxKey(exerciseName, userMaxes || {});
    // Use the canonical name if found, otherwise use the exercise name as-is
    setNewLiftName(maxKey || exerciseName);
    setNewLiftWeight('');
    setShowAddLift(true);
  }, []);

  // Delete a lift
  const deleteLift = useCallback(async (lift) => {
    const newMaxes = { ...profiles[currentUser].maxes };
    delete newMaxes[lift];
    setProfiles(prev => ({
      ...prev,
      [currentUser]: { ...prev[currentUser], maxes: newMaxes }
    }));
    if (!demoMode) {
      await db.deleteMax(currentUser, lift);
    }
  }, [profiles, currentUser, setProfiles, demoMode]);

  // Start editing a max
  const startEditingMax = useCallback((lift, currentValue) => {
    setEditingMax(lift);
    setTempMaxValue(currentValue.toString());
  }, []);

  // Cancel editing
  const cancelEditingMax = useCallback(() => {
    setEditingMax(null);
    setTempMaxValue('');
  }, []);

  // Open add lift modal
  const openAddLiftModal = useCallback(() => {
    setShowAddLift(true);
  }, []);

  // Close add lift modal
  const closeAddLiftModal = useCallback(() => {
    setShowAddLift(false);
    setNewLiftName('');
    setNewLiftWeight('');
  }, []);

  return {
    editingMax,
    tempMaxValue,
    setTempMaxValue,
    showAddLift,
    newLiftName,
    setNewLiftName,
    newLiftWeight,
    setNewLiftWeight,
    selectedReferenceExercise,
    setSelectedReferenceExercise,
    updateMax,
    addNewLift,
    openQuickAddMax,
    deleteLift,
    startEditingMax,
    cancelEditingMax,
    openAddLiftModal,
    closeAddLiftModal,
  };
}
