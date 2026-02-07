import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Settings, User, Dumbbell, LogOut, ChevronRight, X,
} from 'lucide-react-native';

import { useAuth } from '../../contexts/AuthContext';
import { useProfileStore } from '../../stores/profileStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useSocialStore } from '../../stores/socialStore';
import { useAiStore } from '../../stores/aiStore';
import { signOut } from '../../lib/supabase';

function SettingsRow({ icon: Icon, label, onPress, danger }: {
  icon: any; label: string; onPress: () => void; danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between py-4 px-4 border-b border-zinc-800/50"
    >
      <View className="flex-row items-center">
        <Icon size={20} color={danger ? '#ef4444' : '#a1a1aa'} />
        <Text className={`ml-3 text-base font-medium ${danger ? 'text-red-400' : 'text-zinc-100'}`}>
          {label}
        </Text>
      </View>
      <ChevronRight size={18} color="#52525b" />
    </Pressable>
  );
}

export default function SettingsModal() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, equipment, reset: resetProfile } = useProfileStore();
  const { reset: resetWorkout } = useWorkoutStore();
  const { reset: resetSocial } = useSocialStore();
  const { reset: resetAi } = useAiStore();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          resetProfile();
          resetWorkout();
          resetSocial();
          resetAi();
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-zinc-950">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-14 pb-3">
        <View className="flex-row items-center">
          <Settings size={24} color="#f97316" />
          <Text className="text-zinc-50 text-xl font-bold ml-2">Settings</Text>
        </View>
        <Pressable onPress={() => router.back()} className="p-2">
          <X size={22} color="#a1a1aa" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile Card */}
        <View className="mx-4 mb-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
          <View className="flex-row items-center">
            <Text className="text-4xl mr-4">{profile?.avatar || '💪'}</Text>
            <View>
              <Text className="text-zinc-50 text-lg font-bold">{profile?.name || 'User'}</Text>
              <Text className="text-zinc-500 text-sm">{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* Menu */}
        <View className="mx-4 bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <SettingsRow icon={User} label="Edit Profile" onPress={() => router.push('/(modals)/profile')} />
          <SettingsRow icon={Dumbbell} label="Equipment" onPress={() => {}} />
        </View>

        <View className="mx-4 mt-4 bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <SettingsRow icon={LogOut} label="Sign Out" onPress={handleSignOut} danger />
        </View>

        {/* Version */}
        <Text className="text-zinc-600 text-xs text-center mt-8">SwolTracker v1.0.0</Text>
      </ScrollView>
    </View>
  );
}
