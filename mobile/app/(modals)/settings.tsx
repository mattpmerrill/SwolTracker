import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, Alert,
  ActivityIndicator, Switch, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Settings, User, Dumbbell, LogOut, ChevronRight,
  ChevronDown, X, Check, Bell, AlertCircle, Heart, Sparkles, Crown,
} from 'lucide-react-native';

import { useAuth } from '../../contexts/AuthContext';
import { useProfileStore } from '../../stores/profileStore';
import { useWorkoutStore } from '../../stores/workoutStore';
import { useSocialStore } from '../../stores/socialStore';
import { useAiStore } from '../../stores/aiStore';
import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { signOut } from '../../lib/supabase';
import { db } from '../../lib/db';
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  requestNotificationPermission,
  getNotificationPermissionStatus,
  scheduleWorkoutReminders,
  cancelWorkoutReminders,
  scheduleWeeklySummary,
  cancelWeeklySummary,
  type NotificationPrefs,
} from '../../lib/notifications';
import {
  loadHealthPrefs,
  saveHealthPrefs,
  isHealthKitAvailable,
  initHealthKit,
  readLatestBodyWeight,
  type HealthPrefs,
} from '../../lib/health';

// ── Constants ─────────────────────────────────────────────────────────────────

const EQUIPMENT_OPTIONS = [
  'Barbell', 'Dumbbells', 'Bench', 'Squat Rack', 'Kettlebells',
  'Pull-Up Bar', 'Cable Machine', 'Treadmill', 'Rower', 'Weight Machines',
];

const REMINDER_HOURS = [
  { label: '6am', value: 6 },
  { label: '7am', value: 7 },
  { label: '8am', value: 8 },
  { label: '9am', value: 9 },
  { label: '5pm', value: 17 },
  { label: '6pm', value: 18 },
  { label: '7pm', value: 19 },
  { label: '8pm', value: 20 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function equipmentNames(equipment: any[]): string[] {
  return equipment.map((e) => (typeof e === 'string' ? e : e?.name)).filter(Boolean);
}

function SectionLabel({ children }: { children: string }) {
  return (
    <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider px-4 mt-5 mb-1">
      {children}
    </Text>
  );
}

function SettingsRow({
  icon: Icon, label, onPress, danger, rightContent,
}: {
  icon: any; label: string; onPress?: () => void; danger?: boolean;
  rightContent?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between py-4 px-4 border-b border-zinc-800/50"
    >
      <View className="flex-row items-center flex-1 mr-2">
        <Icon size={20} color={danger ? '#ef4444' : '#a1a1aa'} />
        <Text
          className={`ml-3 text-base font-medium ${danger ? 'text-red-400' : 'text-zinc-100'}`}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      {rightContent ?? <ChevronRight size={18} color="#52525b" />}
    </Pressable>
  );
}

// ── Equipment section ─────────────────────────────────────────────────────────

function EquipmentSection({ gymId, equipment, onUpdate }: {
  gymId: string | null;
  equipment: any[];
  onUpdate: (updated: any[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const names = equipmentNames(equipment);

  const toggle = async (name: string) => {
    if (!gymId || saving) return;
    setSaving(name);
    const has = names.includes(name);
    try {
      if (has) {
        await db.removeEquipment(gymId, name);
        onUpdate(equipment.filter((e) => (typeof e === 'string' ? e : e?.name) !== name));
      } else {
        const result = await db.addEquipment(gymId, name);
        onUpdate([...equipment, result ?? name]);
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to update equipment');
    } finally {
      setSaving(null);
    }
  };

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center justify-between py-4 px-4"
      >
        <View className="flex-row items-center">
          <Dumbbell size={20} color="#a1a1aa" />
          <Text className="ml-3 text-base font-medium text-zinc-100">Equipment</Text>
        </View>
        <View className="flex-row items-center gap-2">
          {names.length > 0 && (
            <Text className="text-zinc-500 text-sm">{names.length} selected</Text>
          )}
          {expanded
            ? <ChevronDown size={18} color="#52525b" />
            : <ChevronRight size={18} color="#52525b" />
          }
        </View>
      </Pressable>

      {expanded && (
        <View className="px-4 pb-4">
          <View className="flex-row flex-wrap">
            {EQUIPMENT_OPTIONS.map((item) => {
              const selected = names.includes(item);
              const isLoading = saving === item;
              return (
                <Pressable
                  key={item}
                  onPress={() => toggle(item)}
                  disabled={!!saving}
                  className={`flex-row items-center px-3 py-2 rounded-xl border mr-2 mb-2 ${
                    selected
                      ? 'border-orange-500 bg-orange-500/10'
                      : 'border-zinc-700 bg-zinc-800/50'
                  }`}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#f97316" style={{ marginRight: 4 }} />
                  ) : selected ? (
                    <Check size={13} color="#f97316" style={{ marginRight: 4 }} />
                  ) : null}
                  <Text
                    className="text-sm font-medium"
                    style={{ color: selected ? '#f97316' : '#a1a1aa' }}
                  >
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!gymId && (
            <Text className="text-zinc-600 text-xs mt-1">
              Set up a gym to manage equipment.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Notifications section ─────────────────────────────────────────────────────

function NotificationsSection({ workoutDays }: { workoutDays: string[] }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(loadNotificationPrefs);
  const [permStatus, setPermStatus] = useState<'granted' | 'denied' | 'undetermined'>('undetermined');

  useEffect(() => {
    getNotificationPermissionStatus().then(setPermStatus);
  }, []);

  const persist = useCallback((next: NotificationPrefs) => {
    setPrefs(next);
    saveNotificationPrefs(next);
  }, []);

  const toggleReminders = async (value: boolean) => {
    if (value && permStatus !== 'granted') {
      if (permStatus === 'denied') {
        Alert.alert(
          'Notifications Blocked',
          'Please allow notifications for SwolTracker in your iPhone Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      const granted = await requestNotificationPermission();
      setPermStatus(granted ? 'granted' : 'denied');
      if (!granted) return;
    }

    const next = { ...prefs, remindersEnabled: value };
    persist(next);

    if (value) {
      scheduleWorkoutReminders(workoutDays, next.reminderHour).catch(() => {});
    } else {
      cancelWorkoutReminders().catch(() => {});
    }
  };

  const setReminderHour = (hour: number) => {
    const next = { ...prefs, reminderHour: hour };
    persist(next);
    if (prefs.remindersEnabled) {
      scheduleWorkoutReminders(workoutDays, hour).catch(() => {});
    }
  };

  const toggleSummary = async (value: boolean) => {
    if (value && permStatus !== 'granted') {
      if (permStatus === 'denied') {
        Alert.alert(
          'Notifications Blocked',
          'Please allow notifications for SwolTracker in your iPhone Settings.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      const granted = await requestNotificationPermission();
      setPermStatus(granted ? 'granted' : 'denied');
      if (!granted) return;
    }

    const next = { ...prefs, summaryEnabled: value };
    persist(next);

    if (value) {
      scheduleWeeklySummary().catch(() => {});
    } else {
      cancelWeeklySummary().catch(() => {});
    }
  };

  return (
    <View>
      {/* Permission denied banner */}
      {permStatus === 'denied' && (
        <Pressable
          onPress={() => Linking.openSettings()}
          className="mx-0 mb-0 flex-row items-center bg-orange-500/10 border-b border-zinc-800/50 px-4 py-3"
        >
          <AlertCircle size={16} color="#f97316" />
          <Text className="text-orange-400 text-xs ml-2 flex-1">
            Notifications blocked. Tap to open Settings.
          </Text>
        </Pressable>
      )}

      {/* Workout reminders toggle */}
      <View className="flex-row items-center justify-between py-4 px-4 border-b border-zinc-800/50">
        <View className="flex-row items-center">
          <Bell size={20} color="#a1a1aa" />
          <Text className="ml-3 text-base font-medium text-zinc-100">Workout Reminders</Text>
        </View>
        <Switch
          value={prefs.remindersEnabled}
          onValueChange={toggleReminders}
          trackColor={{ false: '#3f3f46', true: '#f97316' }}
          thumbColor="#ffffff"
        />
      </View>

      {/* Time picker — shown when reminders are on */}
      {prefs.remindersEnabled && (
        <View className="px-4 pb-4 pt-2">
          <Text className="text-zinc-500 text-xs mb-2">Remind me at</Text>
          <View className="flex-row flex-wrap">
            {REMINDER_HOURS.map((opt) => (
              <Pressable
                key={opt.value}
                onPress={() => setReminderHour(opt.value)}
                className={`px-3 py-1.5 rounded-xl border mr-2 mb-2 ${
                  prefs.reminderHour === opt.value
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-zinc-700 bg-zinc-800/50'
                }`}
              >
                <Text
                  className="text-sm font-medium"
                  style={{
                    color: prefs.reminderHour === opt.value ? '#f97316' : '#a1a1aa',
                  }}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          {workoutDays.length === 0 && (
            <Text className="text-zinc-600 text-xs mt-1">
              Set your workout days in Edit Profile to schedule reminders.
            </Text>
          )}
        </View>
      )}

      {/* Weekly summary toggle */}
      <View className="flex-row items-center justify-between py-4 px-4">
        <View className="flex-row items-center">
          <Bell size={20} color="#a1a1aa" />
          <Text className="ml-3 text-base font-medium text-zinc-100">Weekly Summary</Text>
        </View>
        <Switch
          value={prefs.summaryEnabled}
          onValueChange={toggleSummary}
          trackColor={{ false: '#3f3f46', true: '#f97316' }}
          thumbColor="#ffffff"
        />
      </View>
    </View>
  );
}

// ── Health section ────────────────────────────────────────────────────────────

function HealthSection({ isPro, onUpgrade }: { isPro: boolean; onUpgrade: () => void }) {
  const [prefs, setPrefs] = useState<HealthPrefs>(loadHealthPrefs);
  const [bodyWeight, setBodyWeight] = useState<number | null>(null);
  const [initializing, setInitializing] = useState(false);

  // Read body weight on mount if enabled
  useEffect(() => {
    if (prefs.readWeightEnabled) {
      readLatestBodyWeight().then(setBodyWeight).catch(() => {});
    }
  }, []);

  if (!isHealthKitAvailable()) return null;

  // Non-Pro: show upgrade prompt
  if (!isPro) {
    return (
      <Pressable
        onPress={onUpgrade}
        className="flex-row items-center px-4 py-4"
      >
        <Heart size={20} color="#71717a" />
        <View className="ml-3 flex-1">
          <Text className="text-zinc-500 text-base font-medium">Apple Health Sync</Text>
          <Text className="text-zinc-600 text-xs mt-0.5">Pro feature — upgrade to unlock</Text>
        </View>
        <View className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-2 py-1">
          <Text className="text-orange-400 text-xs font-bold">PRO</Text>
        </View>
      </Pressable>
    );
  }

  const persist = (next: HealthPrefs) => {
    setPrefs(next);
    saveHealthPrefs(next);
  };

  const handleToggle = async (key: keyof HealthPrefs, value: boolean) => {
    if (value && !prefs.syncWorkoutsEnabled && !prefs.readWeightEnabled) {
      // First time enabling any Health toggle — request permissions
      setInitializing(true);
      const ok = await initHealthKit();
      setInitializing(false);
      if (!ok) {
        Alert.alert(
          'Apple Health',
          'Could not connect to Apple Health. Please allow access in Settings → Privacy & Security → Health → SwolTracker.',
          [{ text: 'OK' }]
        );
        return;
      }
    }

    const next = { ...prefs, [key]: value };
    persist(next);

    if (key === 'readWeightEnabled' && value) {
      readLatestBodyWeight().then(setBodyWeight).catch(() => {});
    }
    if (key === 'readWeightEnabled' && !value) {
      setBodyWeight(null);
    }
  };

  return (
    <View>
      {initializing && (
        <View className="flex-row items-center px-4 py-3 border-b border-zinc-800/50">
          <ActivityIndicator size="small" color="#ef4444" />
          <Text className="text-zinc-400 text-sm ml-2">Connecting to Apple Health…</Text>
        </View>
      )}

      {/* Sync workouts */}
      <View className="flex-row items-center justify-between py-4 px-4 border-b border-zinc-800/50">
        <View className="flex-row items-center flex-1 mr-2">
          <Heart size={20} color="#ef4444" />
          <View className="ml-3 flex-1">
            <Text className="text-zinc-100 text-base font-medium">Sync Workouts</Text>
            <Text className="text-zinc-500 text-xs mt-0.5">
              Saves strength training sessions to Health
            </Text>
          </View>
        </View>
        <Switch
          value={prefs.syncWorkoutsEnabled}
          onValueChange={(v) => handleToggle('syncWorkoutsEnabled', v)}
          trackColor={{ false: '#3f3f46', true: '#ef4444' }}
          thumbColor="#ffffff"
        />
      </View>

      {/* Read body weight */}
      <View className="flex-row items-center justify-between py-4 px-4">
        <View className="flex-row items-center flex-1 mr-2">
          <Heart size={20} color="#ef4444" />
          <View className="ml-3 flex-1">
            <Text className="text-zinc-100 text-base font-medium">Read Body Weight</Text>
            {bodyWeight ? (
              <Text className="text-zinc-500 text-xs mt-0.5">
                Latest: {bodyWeight} lbs from Health
              </Text>
            ) : (
              <Text className="text-zinc-500 text-xs mt-0.5">
                Uses your weight to personalize AI programs
              </Text>
            )}
          </View>
        </View>
        <Switch
          value={prefs.readWeightEnabled}
          onValueChange={(v) => handleToggle('readWeightEnabled', v)}
          trackColor={{ false: '#3f3f46', true: '#ef4444' }}
          thumbColor="#ffffff"
        />
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SettingsModal() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile, equipment, gymId, setEquipment, reset: resetProfile } = useProfileStore();
  const { reset: resetWorkout } = useWorkoutStore();
  const { reset: resetSocial } = useSocialStore();
  const { reset: resetAi } = useAiStore();
  const { isPro, aiGenerationsUsed, aiGenerationsRemaining, openPaywall } = useSubscriptionStore();

  const workoutDays: string[] = (() => {
    const v = profile?.workout_days;
    if (Array.isArray(v)) return v;
    try { return JSON.parse(v) || []; } catch { return []; }
  })();

  const handleUpgrade = () => {
    openPaywall();
    router.push('/(modals)/paywall');
  };

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
      <View className="flex-row items-center justify-between px-4 pt-14 pb-3 border-b border-zinc-800/50">
        <View className="flex-row items-center">
          <Settings size={24} color="#f97316" />
          <Text className="text-zinc-50 text-xl font-bold ml-2">Settings</Text>
        </View>
        <Pressable onPress={() => router.back()} className="p-2">
          <X size={22} color="#a1a1aa" />
        </Pressable>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Profile card */}
        <View className="mx-4 my-4 bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
          <View className="flex-row items-center">
            <Text style={{ fontSize: 40 }} className="mr-4">{profile?.avatar || '💪'}</Text>
            <View className="flex-1">
              <Text className="text-zinc-50 text-lg font-bold" numberOfLines={1}>
                {profile?.name || 'User'}
              </Text>
              <Text className="text-zinc-500 text-sm" numberOfLines={1}>{user?.email}</Text>
            </View>
          </View>
        </View>

        {/* Subscription */}
        <SectionLabel>Subscription</SectionLabel>
        <View className="mx-4 bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          {isPro ? (
            <View className="flex-row items-center px-4 py-4">
              <Crown size={20} color="#f97316" />
              <View className="ml-3 flex-1">
                <Text className="text-zinc-100 text-base font-medium">SwolTracker Pro</Text>
                <Text className="text-zinc-500 text-xs mt-0.5">All features unlocked</Text>
              </View>
              <View className="bg-orange-500 rounded-lg px-2.5 py-1">
                <Text className="text-white text-xs font-bold">ACTIVE</Text>
              </View>
            </View>
          ) : (
            <Pressable onPress={handleUpgrade} className="flex-row items-center px-4 py-4">
              <Sparkles size={20} color="#f97316" />
              <View className="ml-3 flex-1">
                <Text className="text-zinc-100 text-base font-medium">Upgrade to Pro</Text>
                <Text className="text-zinc-500 text-xs mt-0.5">
                  {aiGenerationsRemaining > 0
                    ? `${aiGenerationsRemaining} free AI generation${aiGenerationsRemaining !== 1 ? 's' : ''} remaining`
                    : 'Free AI generations used — upgrade to continue'}
                </Text>
              </View>
              <ChevronRight size={18} color="#52525b" />
            </Pressable>
          )}
        </View>

        {/* Account */}
        <SectionLabel>Account</SectionLabel>
        <View className="mx-4 bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <SettingsRow
            icon={User}
            label="Edit Profile"
            onPress={() => router.push('/(modals)/profile')}
          />
        </View>

        {/* Training */}
        <SectionLabel>Training</SectionLabel>
        <View className="mx-4 bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <EquipmentSection
            gymId={gymId}
            equipment={equipment}
            onUpdate={setEquipment}
          />
        </View>

        {/* Notifications */}
        <SectionLabel>Notifications</SectionLabel>
        <View className="mx-4 bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <NotificationsSection workoutDays={workoutDays} />
        </View>

        {/* Apple Health */}
        <SectionLabel>Apple Health</SectionLabel>
        <View className="mx-4 bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <HealthSection isPro={isPro} onUpgrade={handleUpgrade} />
        </View>

        {/* Danger zone */}
        <View className="mx-4 mt-5 bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden">
          <SettingsRow icon={LogOut} label="Sign Out" onPress={handleSignOut} danger />
        </View>

        {/* Version */}
        <Text className="text-zinc-600 text-xs text-center mt-8">SwolTracker v1.0.0</Text>
      </ScrollView>
    </View>
  );
}
