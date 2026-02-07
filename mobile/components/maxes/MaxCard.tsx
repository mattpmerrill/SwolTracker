import { View, Text, TextInput, Pressable, Alert } from 'react-native';
import { useState } from 'react';
import { Trash2, Check, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { SharedValue } from 'react-native-reanimated';

interface MaxCardProps {
  exerciseName: string;
  weight: number;
  onUpdateWeight: (exerciseName: string, weight: number) => void;
  onDelete: (exerciseName: string) => void;
}

export function MaxCard({ exerciseName, weight, onUpdateWeight, onDelete }: MaxCardProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(weight));

  const handleSave = () => {
    const newWeight = parseFloat(editValue);
    if (isNaN(newWeight) || newWeight <= 0) {
      setEditValue(String(weight));
      setEditing(false);
      return;
    }
    onUpdateWeight(exerciseName, newWeight);
    setEditing(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Max',
      `Remove ${exerciseName} from your lifts?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            onDelete(exerciseName);
          },
        },
      ]
    );
  };

  const renderRightActions = (_progress: SharedValue<number>, _dragX: SharedValue<number>) => (
    <Pressable
      onPress={handleDelete}
      className="bg-red-500 items-center justify-center px-6 rounded-r-2xl"
    >
      <Trash2 size={20} color="white" />
    </Pressable>
  );

  return (
    <Swipeable renderRightActions={renderRightActions} overshootRight={false}>
      <View className="bg-zinc-900 px-4 py-4 flex-row items-center justify-between border-b border-zinc-800/50">
        <Text className="text-zinc-100 text-base font-medium flex-1">{exerciseName}</Text>

        {editing ? (
          <View className="flex-row items-center gap-2">
            <TextInput
              value={editValue}
              onChangeText={setEditValue}
              keyboardType="numeric"
              autoFocus
              selectTextOnFocus
              className="bg-zinc-800 text-zinc-100 text-base font-bold px-3 py-1.5 rounded-lg w-20 text-right"
              onSubmitEditing={handleSave}
            />
            <Text className="text-zinc-500 text-sm">lbs</Text>
            <Pressable onPress={handleSave} className="p-1.5">
              <Check size={18} color="#4ade80" />
            </Pressable>
            <Pressable
              onPress={() => { setEditValue(String(weight)); setEditing(false); }}
              className="p-1.5"
            >
              <X size={18} color="#71717a" />
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setEditing(true)}>
            <Text className="text-orange-400 text-lg font-bold">{weight} lbs</Text>
          </Pressable>
        )}
      </View>
    </Swipeable>
  );
}
