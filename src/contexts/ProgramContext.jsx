import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { db } from '../lib/supabase';
import { useToast } from '../components/Toast';
import { validate, equipmentNameSchema } from '../lib/validation';
import { defaultEquipment } from '../constants';
import { calculateCurrentWeek, getTodayDayName } from '../utils/date';

const ProgramContext = createContext(null);

/**
 * Program domain: gym, equipment, weekly program, program start, week/day cursor.
 * Hydrates from the bootstrap bundle; equipment writes hit Supabase.
 */
export function ProgramProvider({ children, bundle }) {
  const toast = useToast();
  const [equipment, setEquipment] = useState(defaultEquipment);
  const [workoutProgram, setWorkoutProgram] = useState({});
  const [programStartDate, setProgramStartDate] = useState(() => new Date().toISOString());
  const [currentWeek, setCurrentWeek] = useState(1);
  const [currentDay, setCurrentDay] = useState(getTodayDayName);
  const [gymId, setGymId] = useState(null);

  useEffect(() => {
    if (!bundle || bundle.kind === 'onboarding') return;
    setGymId(bundle.gymId);
    if (bundle.equipment) setEquipment(bundle.equipment);
    setProgramStartDate(bundle.programStartDate);
    setCurrentWeek(bundle.currentWeek);
    setWorkoutProgram(bundle.workoutProgram || {});
  }, [bundle]);

  const actualCurrentWeek = useMemo(
    () => calculateCurrentWeek(programStartDate),
    [programStartDate],
  );

  const maxWeekInProgram = useMemo(
    () => Math.max(
      ...Object.keys(workoutProgram || {}).map(Number).filter(Number.isFinite),
      actualCurrentWeek,
    ),
    [workoutProgram, actualCurrentWeek],
  );

  const addEquipment = useCallback(async (nameInput) => {
    const { success, data: name } = validate(equipmentNameSchema, nameInput);
    if (!success || equipment.includes(name)) return { ok: false, reason: 'invalid' };
    if (!gymId) {
      toast.error('Gym not ready yet. Try again in a moment.');
      return { ok: false, reason: 'no_gym' };
    }

    const previous = equipment;
    setEquipment((prev) => [...prev, name]);

    const saved = await db.addEquipment(gymId, name);
    if (!saved) {
      setEquipment(previous);
      toast.error('Could not save equipment. Try again.');
      return { ok: false, reason: 'save_failed' };
    }
    return { ok: true, name };
  }, [equipment, gymId, toast]);

  const removeEquipment = useCallback(async (item) => {
    if (!gymId) {
      toast.error('Gym not ready yet. Try again in a moment.');
      return { ok: false, reason: 'no_gym' };
    }

    const previous = equipment;
    setEquipment((prev) => prev.filter((e) => e !== item));

    const ok = await db.removeEquipment(gymId, item);
    if (ok === false) {
      setEquipment(previous);
      toast.error('Could not remove equipment. Try again.');
      return { ok: false, reason: 'save_failed' };
    }
    return { ok: true };
  }, [equipment, gymId, toast]);

  const goToPreviousWeek = useCallback(() => {
    setCurrentWeek((w) => Math.max(1, w - 1));
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentWeek((w) => Math.min(maxWeekInProgram, w + 1));
  }, [maxWeekInProgram]);

  const goToCurrentWeek = useCallback(() => {
    setCurrentWeek(actualCurrentWeek);
    setCurrentDay(getTodayDayName());
  }, [actualCurrentWeek]);

  const value = useMemo(() => ({
    gymId,
    setGymId,
    equipment,
    setEquipment,
    workoutProgram,
    setWorkoutProgram,
    programStartDate,
    setProgramStartDate,
    currentWeek,
    setCurrentWeek,
    currentDay,
    setCurrentDay,
    actualCurrentWeek,
    maxWeekInProgram,
    addEquipment,
    removeEquipment,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
  }), [
    gymId, equipment, workoutProgram, programStartDate, currentWeek, currentDay,
    actualCurrentWeek, maxWeekInProgram, addEquipment, removeEquipment,
    goToPreviousWeek, goToNextWeek, goToCurrentWeek,
  ]);

  return (
    <ProgramContext.Provider value={value}>
      {children}
    </ProgramContext.Provider>
  );
}

export function useProgram() {
  const ctx = useContext(ProgramContext);
  if (!ctx) {
    throw new Error('useProgram must be used within ProgramProvider');
  }
  return ctx;
}
