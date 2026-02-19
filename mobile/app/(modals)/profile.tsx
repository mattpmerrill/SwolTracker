import { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  X, Heart, Flame, Scale, Wind,
  Dumbbell, Home, Building2,
} from 'lucide-react-native';

import { useAuth } from '../../contexts/AuthContext';
import { useProfileStore } from '../../stores/profileStore';
import { Input, Button } from '../../components/ui';

// ── Constants (mirrors onboarding) ────────────────────────────────────────────

const AVATAR_OPTIONS = [
  '💪', '🏋️', '🔥', '🦁', '🐺', '💯', '🚀', '🎯',
  '⚡', '🏆', '🦾', '🥊', '🏃', '🧗', '🤸', '🥋',
  '🏊', '🚴', '🧘', '🎽', '👊', '💥', '🌟', '🔱',
];

const FITNESS_GOALS = [
  { id: 'strength', label: 'Strength', icon: Dumbbell, color: '#f97316' },
  { id: 'cardio', label: 'Cardio', icon: Heart, color: '#ef4444' },
  { id: 'fat_burn', label: 'Fat Burn', icon: Flame, color: '#eab308' },
  { id: 'weight_loss', label: 'Weight Loss', icon: Scale, color: '#22c55e' },
  { id: 'flexibility', label: 'Flexibility', icon: Wind, color: '#a855f7' },
];

const DAYS = [
  { id: 'Monday', label: 'Mon' }, { id: 'Tuesday', label: 'Tue' },
  { id: 'Wednesday', label: 'Wed' }, { id: 'Thursday', label: 'Thu' },
  { id: 'Friday', label: 'Fri' }, { id: 'Saturday', label: 'Sat' },
  { id: 'Sunday', label: 'Sun' },
];

const DURATIONS = [
  { id: '30 min', desc: 'Short & Effective' },
  { id: '45 min', desc: 'Balanced Session' },
  { id: '1 hour', desc: 'Full Workout' },
  { id: '1+ hour', desc: 'Extended Training' },
];

const GENDERS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'non-binary', label: 'Non-binary' },
  { id: 'prefer_not', label: 'Prefer not to say' },
];

// ── Small helpers ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">
      {children}
    </Text>
  );
}

function Chip({
  label, selected, onPress, color,
}: { label: string; selected: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable
      onPress={onPress}
      className={`px-3 py-2 rounded-xl border mr-2 mb-2 ${
        selected ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-700 bg-zinc-800'
      }`}
    >
      <Text
        className="text-sm font-medium"
        style={{ color: selected ? (color || '#f97316') : '#a1a1aa' }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ProfileModal() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, updateProfile } = useProfileStore();

  // Parse stored JSON arrays safely
  const parseArr = (val: any): string[] => {
    if (Array.isArray(val)) return val;
    try { return JSON.parse(val) || []; } catch { return []; }
  };

  const [name, setName] = useState(profile?.name || '');
  const [avatar, setAvatar] = useState(profile?.avatar || '💪');
  const [gender, setGender] = useState(profile?.gender || '');
  const [fitnessGoals, setFitnessGoals] = useState<string[]>(parseArr(profile?.fitness_goals));
  const [workoutDays, setWorkoutDays] = useState<string[]>(parseArr(profile?.workout_days));
  const [duration, setDuration] = useState(profile?.workout_duration || '');
  const [location, setLocation] = useState(profile?.workout_location || '');

  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const toggle = (arr: string[], item: string, setter: (v: string[]) => void) => {
    setter(arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]);
  };

  const isDirty =
    name.trim() !== (profile?.name || '') ||
    avatar !== (profile?.avatar || '💪') ||
    gender !== (profile?.gender || '') ||
    JSON.stringify(fitnessGoals) !== JSON.stringify(parseArr(profile?.fitness_goals)) ||
    JSON.stringify(workoutDays) !== JSON.stringify(parseArr(profile?.workout_days)) ||
    duration !== (profile?.workout_duration || '') ||
    location !== (profile?.workout_location || '');

  const handleSave = async () => {
    if (!user?.id || !name.trim()) return;
    setSaving(true);
    try {
      await updateProfile(user.id, {
        name: name.trim(),
        avatar,
        gender,
        fitness_goals: JSON.stringify(fitnessGoals),
        workout_days: JSON.stringify(workoutDays),
        workout_duration: duration,
        workout_location: location,
      });
      router.back();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-zinc-950"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-14 pb-3 border-b border-zinc-800/50">
        <Text className="text-zinc-50 text-xl font-bold">Edit Profile</Text>
        <Pressable onPress={() => router.back()} className="p-2">
          <X size={22} color="#a1a1aa" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar picker */}
        <View className="items-center mb-6">
          <Pressable
            onPress={() => setShowAvatarPicker(true)}
            className="relative"
          >
            <Text style={{ fontSize: 72 }}>{avatar}</Text>
            <View className="absolute -bottom-1 -right-1 bg-orange-500 w-7 h-7 rounded-full items-center justify-center">
              <Text className="text-white text-xs">✎</Text>
            </View>
          </Pressable>
          <Text className="text-zinc-500 text-xs mt-2">Tap to change</Text>
        </View>

        {/* Name */}
        <View className="mb-5">
          <SectionLabel>Display Name</SectionLabel>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
          />
        </View>

        {/* Email (read-only) */}
        <View className="mb-5">
          <SectionLabel>Email</SectionLabel>
          <Input
            value={user?.email || ''}
            editable={false}
            containerClassName="opacity-50"
          />
        </View>

        {/* Gender */}
        <View className="mb-5">
          <SectionLabel>Gender</SectionLabel>
          <View className="flex-row flex-wrap">
            {GENDERS.map((g) => (
              <Chip
                key={g.id}
                label={g.label}
                selected={gender === g.id}
                onPress={() => setGender(g.id)}
              />
            ))}
          </View>
        </View>

        {/* Fitness goals */}
        <View className="mb-5">
          <SectionLabel>Fitness Goals</SectionLabel>
          <View className="flex-row flex-wrap">
            {FITNESS_GOALS.map((g) => (
              <Chip
                key={g.id}
                label={g.label}
                selected={fitnessGoals.includes(g.id)}
                onPress={() => toggle(fitnessGoals, g.id, setFitnessGoals)}
                color={g.color}
              />
            ))}
          </View>
        </View>

        {/* Workout days */}
        <View className="mb-5">
          <SectionLabel>Workout Days</SectionLabel>
          <View className="flex-row flex-wrap">
            {DAYS.map((d) => (
              <Chip
                key={d.id}
                label={d.label}
                selected={workoutDays.includes(d.id)}
                onPress={() => toggle(workoutDays, d.id, setWorkoutDays)}
              />
            ))}
          </View>
        </View>

        {/* Session duration */}
        <View className="mb-5">
          <SectionLabel>Session Duration</SectionLabel>
          <View className="flex-row flex-wrap">
            {DURATIONS.map((d) => (
              <Chip
                key={d.id}
                label={d.id}
                selected={duration === d.id}
                onPress={() => setDuration(d.id)}
              />
            ))}
          </View>
        </View>

        {/* Workout location */}
        <View className="mb-6">
          <SectionLabel>Workout Location</SectionLabel>
          <View className="flex-row gap-3">
            <Pressable
              onPress={() => setLocation('home')}
              className={`flex-1 flex-row items-center justify-center py-3 rounded-xl border ${
                location === 'home'
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-zinc-700 bg-zinc-800'
              }`}
            >
              <Home size={18} color={location === 'home' ? '#f97316' : '#a1a1aa'} />
              <Text
                className={`ml-2 font-medium ${
                  location === 'home' ? 'text-orange-400' : 'text-zinc-400'
                }`}
              >
                Home
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setLocation('gym')}
              className={`flex-1 flex-row items-center justify-center py-3 rounded-xl border ${
                location === 'gym'
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-zinc-700 bg-zinc-800'
              }`}
            >
              <Building2 size={18} color={location === 'gym' ? '#f97316' : '#a1a1aa'} />
              <Text
                className={`ml-2 font-medium ${
                  location === 'gym' ? 'text-orange-400' : 'text-zinc-400'
                }`}
              >
                Gym
              </Text>
            </Pressable>
          </View>
        </View>

        <Button
          title="Save Changes"
          onPress={handleSave}
          loading={saving}
          disabled={!name.trim() || !isDirty}
        />
      </ScrollView>

      {/* Avatar picker modal */}
      <Modal
        visible={showAvatarPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAvatarPicker(false)}
      >
        <Pressable
          className="flex-1 bg-black/60 justify-end"
          onPress={() => setShowAvatarPicker(false)}
        >
          <Pressable onPress={() => {}}>
            <View className="bg-zinc-900 rounded-t-3xl px-4 pt-4 pb-10 border-t border-zinc-800">
              <View className="flex-row items-center justify-between mb-4">
                <Text className="text-zinc-50 text-lg font-bold">Choose Avatar</Text>
                <Pressable onPress={() => setShowAvatarPicker(false)} className="p-2">
                  <X size={20} color="#a1a1aa" />
                </Pressable>
              </View>
              <View className="flex-row flex-wrap justify-between">
                {AVATAR_OPTIONS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => {
                      setAvatar(emoji);
                      setShowAvatarPicker(false);
                    }}
                    className={`w-16 h-16 items-center justify-center rounded-2xl mb-3 border ${
                      avatar === emoji
                        ? 'border-orange-500 bg-orange-500/10'
                        : 'border-zinc-800 bg-zinc-800'
                    }`}
                  >
                    <Text style={{ fontSize: 32 }}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}
