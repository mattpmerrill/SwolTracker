import { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Camera } from 'lucide-react-native';

import { useAuth } from '../../contexts/AuthContext';
import { useProfileStore } from '../../stores/profileStore';
import { Input, Button } from '../../components/ui';

export default function ProfileModal() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, updateProfile } = useProfileStore();

  const [name, setName] = useState(profile?.name || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!user?.id || !name.trim()) return;
    setSaving(true);
    try {
      await updateProfile(user.id, { name: name.trim() });
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-zinc-950">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-14 pb-3">
        <Text className="text-zinc-50 text-xl font-bold">Edit Profile</Text>
        <Pressable onPress={() => router.back()} className="p-2">
          <X size={22} color="#a1a1aa" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, gap: 16 }}
      >
        {/* Avatar */}
        <View className="items-center mb-4">
          <View className="relative">
            <Text className="text-7xl">{profile?.avatar || '💪'}</Text>
            <Pressable className="absolute -bottom-1 -right-1 bg-orange-500 w-8 h-8 rounded-full items-center justify-center">
              <Camera size={16} color="white" />
            </Pressable>
          </View>
        </View>

        <Input
          label="Display Name"
          value={name}
          onChangeText={setName}
          placeholder="Your name"
        />

        <Input
          label="Email"
          value={user?.email || ''}
          editable={false}
          containerClassName="opacity-50"
        />

        <Button
          title="Save Changes"
          onPress={handleSave}
          loading={saving}
          disabled={!name.trim() || name.trim() === profile?.name}
        />
      </ScrollView>
    </View>
  );
}
