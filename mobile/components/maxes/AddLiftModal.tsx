import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useState } from 'react';
import { Plus } from 'lucide-react-native';
import { Button } from '../ui';

interface AddLiftModalProps {
  visible: boolean;
  initialName?: string;
  onAdd: (exerciseName: string, weight: number) => void;
  onClose: () => void;
}

export function AddLiftModal({ visible, initialName, onAdd, onClose }: AddLiftModalProps) {
  const [name, setName] = useState(initialName || '');
  const [weight, setWeight] = useState('');

  if (!visible) return null;

  const handleAdd = () => {
    const w = parseFloat(weight);
    if (!name.trim() || isNaN(w) || w <= 0) return;
    onAdd(name.trim(), w);
    setName('');
    setWeight('');
    onClose();
  };

  return (
    <View className="absolute inset-0 bg-black/60 justify-end">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="bg-zinc-900 rounded-t-3xl px-6 pt-6 pb-10">
          <View className="w-10 h-1 bg-zinc-700 rounded-full self-center mb-4" />
          <Text className="text-zinc-50 text-xl font-bold mb-4">Add 1RM Lift</Text>

          <View className="mb-4">
            <Text className="text-zinc-400 text-sm mb-1.5">Exercise Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Bench Press"
              placeholderTextColor="#71717a"
              autoFocus={!initialName}
              className="bg-zinc-800 text-zinc-100 rounded-xl px-4 py-3 text-base border border-zinc-700"
            />
          </View>

          <View className="mb-6">
            <Text className="text-zinc-400 text-sm mb-1.5">Weight (lbs)</Text>
            <TextInput
              value={weight}
              onChangeText={setWeight}
              placeholder="e.g. 225"
              placeholderTextColor="#71717a"
              keyboardType="numeric"
              autoFocus={!!initialName}
              className="bg-zinc-800 text-zinc-100 rounded-xl px-4 py-3 text-base border border-zinc-700"
              onSubmitEditing={handleAdd}
            />
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Button title="Cancel" onPress={onClose} variant="secondary" />
            </View>
            <View className="flex-1">
              <Button
                title="Add Lift"
                onPress={handleAdd}
                disabled={!name.trim() || !weight}
                icon={<Plus size={16} color="white" />}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
