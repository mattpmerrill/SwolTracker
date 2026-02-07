import { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { Plus, TrendingUp } from 'lucide-react-native';

import { useAuth } from '../../contexts/AuthContext';
import { useProfileStore } from '../../stores/profileStore';
import { MaxCard } from '../../components/maxes/MaxCard';
import { QuickReference } from '../../components/maxes/QuickReference';
import { AddLiftModal } from '../../components/maxes/AddLiftModal';

export default function MaxesScreen() {
  const { user } = useAuth();
  const { maxes, updateMax, deleteMax } = useProfileStore();
  const [showAddLift, setShowAddLift] = useState(false);
  const [addLiftName, setAddLiftName] = useState('');
  const [selectedLift, setSelectedLift] = useState<string | null>(null);

  const sortedMaxes = Object.entries(maxes).sort(([a], [b]) => a.localeCompare(b));

  const handleUpdateWeight = useCallback(
    async (exerciseName: string, weight: number) => {
      if (!user?.id) return;
      await updateMax(user.id, exerciseName, weight);
    },
    [user?.id]
  );

  const handleDelete = useCallback(
    async (exerciseName: string) => {
      if (!user?.id) return;
      await deleteMax(user.id, exerciseName);
      if (selectedLift === exerciseName) setSelectedLift(null);
    },
    [user?.id, selectedLift]
  );

  const handleAddLift = useCallback(
    async (exerciseName: string, weight: number) => {
      if (!user?.id) return;
      await updateMax(user.id, exerciseName, weight);
    },
    [user?.id]
  );

  return (
    <View className="flex-1 bg-zinc-950">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3">
        <View>
          <Text className="text-zinc-50 text-2xl font-bold">1RM Maxes</Text>
          <Text className="text-zinc-500 text-sm">
            {sortedMaxes.length} lift{sortedMaxes.length !== 1 ? 's' : ''} tracked
          </Text>
        </View>
        <Pressable
          onPress={() => { setAddLiftName(''); setShowAddLift(true); }}
          className="bg-orange-500 w-10 h-10 rounded-xl items-center justify-center"
        >
          <Plus size={20} color="white" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        {sortedMaxes.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8 pt-20">
            <View className="w-16 h-16 bg-zinc-800 rounded-2xl items-center justify-center mb-4">
              <TrendingUp size={32} color="#f97316" />
            </View>
            <Text className="text-zinc-50 text-xl font-bold text-center">No lifts tracked yet</Text>
            <Text className="text-zinc-400 text-sm text-center mt-2 mb-6">
              Add your 1RM to get percentage-based weights in your workouts.
            </Text>
            <Pressable
              onPress={() => setShowAddLift(true)}
              className="bg-orange-500 flex-row items-center px-5 py-3 rounded-xl"
            >
              <Plus size={16} color="white" />
              <Text className="text-white font-semibold ml-2">Add Your First Lift</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Lift List */}
            <View className="mx-4 rounded-2xl overflow-hidden border border-zinc-800/50">
              {sortedMaxes.map(([name, weight]) => (
                <Pressable
                  key={name}
                  onLongPress={() => setSelectedLift(selectedLift === name ? null : name)}
                >
                  <MaxCard
                    exerciseName={name}
                    weight={weight}
                    onUpdateWeight={handleUpdateWeight}
                    onDelete={handleDelete}
                  />
                </Pressable>
              ))}
            </View>

            {/* Quick Reference for selected lift */}
            {selectedLift && maxes[selectedLift] && (
              <View className="mt-4">
                <QuickReference
                  exerciseName={selectedLift}
                  maxWeight={maxes[selectedLift]}
                />
              </View>
            )}

            <View className="h-8" />
          </>
        )}
      </ScrollView>

      <AddLiftModal
        visible={showAddLift}
        initialName={addLiftName}
        onAdd={handleAddLift}
        onClose={() => setShowAddLift(false)}
      />
    </View>
  );
}
