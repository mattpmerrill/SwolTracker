import { useState, useCallback } from 'react';
import { defaultEquipment } from '../constants';

/**
 * Hook for managing gym equipment
 */
export function useEquipment(initialEquipment = defaultEquipment) {
  const [equipment, setEquipment] = useState(initialEquipment);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [newEquipmentName, setNewEquipmentName] = useState('');

  const addEquipment = useCallback(() => {
    if (!newEquipmentName.trim() || equipment.includes(newEquipmentName)) return;
    setEquipment(prev => [...prev, newEquipmentName]);
    setNewEquipmentName('');
    setShowAddEquipment(false);
  }, [newEquipmentName, equipment]);

  const removeEquipment = useCallback((item) => {
    setEquipment(prev => prev.filter(e => e !== item));
  }, []);

  const openAddEquipmentModal = useCallback(() => {
    setShowAddEquipment(true);
  }, []);

  const closeAddEquipmentModal = useCallback(() => {
    setShowAddEquipment(false);
    setNewEquipmentName('');
  }, []);

  return {
    equipment,
    setEquipment,
    showAddEquipment,
    newEquipmentName,
    setNewEquipmentName,
    addEquipment,
    removeEquipment,
    openAddEquipmentModal,
    closeAddEquipmentModal,
  };
}
