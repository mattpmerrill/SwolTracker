import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Dumbbell, ChevronRight, ChevronLeft, Check,
  Heart, Flame, Scale, Wind, Target, Calendar,
  Clock, Home, Building2, Sparkles, RotateCcw,
} from 'lucide-react-native';

import { useAuth } from '../../contexts/AuthContext';
import { useProfileStore } from '../../stores/profileStore';
import { useAiStore } from '../../stores/aiStore';
import { db } from '../../lib/db';
import { ProgressDots } from '../../components/onboarding/ProgressDots';

const STEPS = ['welcome', 'name', 'gender', 'goals', 'days', 'duration', 'equipment', 'location', 'generating'];

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

const EQUIPMENT = [
  'Barbell', 'Dumbbells', 'Bench', 'Squat Rack', 'Kettlebells',
  'Pull-Up Bar', 'Cable Machine', 'Treadmill', 'Rower', 'Weight Machines',
];

const LOADING_PHRASES = [
  "Calculating optimal gains...",
  "Channeling Arnold's spirit...",
  "Teaching AI to count reps...",
  "Warming up the algorithm...",
  "Calibrating pump levels...",
  "Optimizing for maximum swoleness...",
  "Building your gains blueprint...",
];

export default function OnboardingScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Form state
  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name || '');
  const [gender, setGender] = useState('');
  const [fitnessGoals, setFitnessGoals] = useState<string[]>([]);
  const [workoutDays, setWorkoutDays] = useState<string[]>([]);
  const [workoutDuration, setWorkoutDuration] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([]);
  const [workoutLocation, setWorkoutLocation] = useState('');

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState(0);

  useEffect(() => {
    if (!isGenerating) return;
    setLoadingPhrase(Math.floor(Math.random() * LOADING_PHRASES.length));
    const interval = setInterval(() => {
      setLoadingPhrase((prev) => (prev + 1) % LOADING_PHRASES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const currentStep = STEPS[step];

  const canProceed = () => {
    switch (currentStep) {
      case 'welcome': return true;
      case 'name': return displayName.trim().length > 0;
      case 'gender': return gender !== '';
      case 'goals': return fitnessGoals.length > 0;
      case 'days': return workoutDays.length > 0;
      case 'duration': return workoutDuration !== '';
      case 'equipment': return selectedEquipment.length > 0;
      case 'location': return workoutLocation !== '';
      default: return false;
    }
  };

  const toggle = (arr: string[], item: string, setter: (v: string[]) => void) => {
    setter(arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]);
  };

  const handleGenerate = async () => {
    if (!user?.id) return;
    setIsGenerating(true);
    setGenerationFailed(false);

    try {
      const startDate = new Date().toISOString().split('T')[0];

      // Save profile
      await db.updateProfile(user.id, {
        name: displayName,
        gender,
        fitness_goals: JSON.stringify(fitnessGoals),
        workout_days: JSON.stringify(workoutDays),
        workout_duration: workoutDuration,
        workout_location: workoutLocation,
        program_start_date: startDate,
      });

      // Create gym and add equipment
      const gym = await db.createGym(displayName + "'s Gym", user.id);
      if (gym?.id) {
        for (const eq of selectedEquipment) {
          await db.addEquipment(gym.id, eq);
        }
      }

      // Complete onboarding
      await db.completeOnboarding(user.id);
      setIsGenerating(false);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Onboarding error:', error);
      setIsGenerating(false);
      setGenerationFailed(true);
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      if (STEPS[step + 1] === 'generating') {
        setStep(step + 1);
        handleGenerate();
      } else {
        setStep(step + 1);
      }
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-zinc-950"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Progress */}
      {currentStep !== 'generating' && (
        <View className="pt-14 px-6">
          <ProgressDots total={STEPS.length - 1} current={step} />
        </View>
      )}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Welcome */}
        {currentStep === 'welcome' && (
          <View className="items-center">
            <View className="w-20 h-20 bg-orange-500 rounded-3xl items-center justify-center mb-6">
              <Dumbbell size={40} color="white" />
            </View>
            <Text className="text-zinc-50 text-4xl font-black text-center mb-3">
              Welcome to SwolTracker
            </Text>
            <Text className="text-zinc-400 text-base text-center mb-8">
              Let's set up your profile and create a personalized workout plan.
            </Text>
          </View>
        )}

        {/* Name */}
        {currentStep === 'name' && (
          <View className="items-center">
            <Text className="text-zinc-50 text-2xl font-bold text-center mb-2">
              What should we call you?
            </Text>
            <Text className="text-zinc-400 text-sm text-center mb-8">
              Your display name in the app
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter your name"
              placeholderTextColor="#71717a"
              autoFocus
              className="bg-zinc-900 border border-zinc-700 text-zinc-50 text-xl font-bold text-center rounded-2xl py-4 px-6 w-full max-w-xs"
            />
          </View>
        )}

        {/* Gender */}
        {currentStep === 'gender' && (
          <View className="items-center">
            <Text className="text-zinc-50 text-2xl font-bold text-center mb-8">
              What's your gender?
            </Text>
            <View className="flex-row gap-4">
              {[
                { id: 'male', emoji: '👨', label: 'Male' },
                { id: 'female', emoji: '👩', label: 'Female' },
              ].map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => setGender(g.id)}
                  className={`flex-1 items-center py-8 rounded-3xl border ${
                    gender === g.id
                      ? 'bg-orange-500/10 border-orange-500/50'
                      : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <Text className="text-5xl mb-3">{g.emoji}</Text>
                  <Text className={`text-lg font-bold ${gender === g.id ? 'text-orange-400' : 'text-zinc-400'}`}>
                    {g.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Goals */}
        {currentStep === 'goals' && (
          <View>
            <Text className="text-zinc-50 text-2xl font-bold text-center mb-2">
              What are your fitness goals?
            </Text>
            <Text className="text-zinc-400 text-sm text-center mb-8">Select all that apply</Text>
            <View className="flex-row flex-wrap justify-center gap-3">
              {FITNESS_GOALS.map((goal) => {
                const Icon = goal.icon;
                const selected = fitnessGoals.includes(goal.id);
                return (
                  <Pressable
                    key={goal.id}
                    onPress={() => toggle(fitnessGoals, goal.id, setFitnessGoals)}
                    className={`items-center py-5 px-4 rounded-2xl border min-w-[100px] ${
                      selected
                        ? 'bg-orange-500/10 border-orange-500/50'
                        : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <Icon size={28} color={selected ? goal.color : '#71717a'} />
                    <Text className={`text-sm font-semibold mt-2 ${selected ? 'text-zinc-100' : 'text-zinc-500'}`}>
                      {goal.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Days */}
        {currentStep === 'days' && (
          <View className="items-center">
            <Text className="text-zinc-50 text-2xl font-bold text-center mb-2">
              Which days will you workout?
            </Text>
            <Text className="text-zinc-400 text-sm text-center mb-8">Select your training days</Text>
            <View className="flex-row flex-wrap justify-center gap-3">
              {DAYS.map((day) => {
                const selected = workoutDays.includes(day.id);
                return (
                  <Pressable
                    key={day.id}
                    onPress={() => toggle(workoutDays, day.id, setWorkoutDays)}
                    className={`w-14 h-14 rounded-xl items-center justify-center ${
                      selected ? 'bg-blue-500' : 'bg-zinc-900 border border-zinc-800'
                    }`}
                  >
                    <Text className={`text-sm font-bold ${selected ? 'text-white' : 'text-zinc-400'}`}>
                      {day.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text className="text-zinc-500 text-sm mt-4">
              {workoutDays.length} day{workoutDays.length !== 1 ? 's' : ''} selected
            </Text>
          </View>
        )}

        {/* Duration */}
        {currentStep === 'duration' && (
          <View>
            <Text className="text-zinc-50 text-2xl font-bold text-center mb-8">
              How long do you want to workout?
            </Text>
            <View className="gap-3">
              {DURATIONS.map((dur) => {
                const selected = workoutDuration === dur.id;
                return (
                  <Pressable
                    key={dur.id}
                    onPress={() => setWorkoutDuration(dur.id)}
                    className={`flex-row items-center justify-between p-5 rounded-2xl border ${
                      selected
                        ? 'bg-orange-500/10 border-orange-500/50'
                        : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <View>
                      <Text className={`text-lg font-bold ${selected ? 'text-orange-400' : 'text-zinc-100'}`}>
                        {dur.id}
                      </Text>
                      <Text className="text-zinc-500 text-sm">{dur.desc}</Text>
                    </View>
                    {selected && <Check size={20} color="#f97316" />}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Equipment */}
        {currentStep === 'equipment' && (
          <View>
            <Text className="text-zinc-50 text-2xl font-bold text-center mb-2">
              What equipment do you have?
            </Text>
            <Text className="text-zinc-400 text-sm text-center mb-8">Select all available</Text>
            <View className="flex-row flex-wrap justify-center gap-2">
              {EQUIPMENT.map((eq) => {
                const selected = selectedEquipment.includes(eq);
                return (
                  <Pressable
                    key={eq}
                    onPress={() => toggle(selectedEquipment, eq, setSelectedEquipment)}
                    className={`px-4 py-3 rounded-xl border ${
                      selected
                        ? 'bg-orange-500/10 border-orange-500/50'
                        : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <Text className={`text-sm font-medium ${selected ? 'text-orange-400' : 'text-zinc-400'}`}>
                      {eq}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Location */}
        {currentStep === 'location' && (
          <View className="items-center">
            <Text className="text-zinc-50 text-2xl font-bold text-center mb-8">
              Where will you workout?
            </Text>
            <View className="flex-row gap-4">
              {[
                { id: 'home', Icon: Home, label: 'Home' },
                { id: 'gym', Icon: Building2, label: 'Gym' },
              ].map(({ id, Icon, label }) => {
                const selected = workoutLocation === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => setWorkoutLocation(id)}
                    className={`flex-1 items-center py-8 rounded-3xl border ${
                      selected
                        ? 'bg-orange-500/10 border-orange-500/50'
                        : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <Icon size={36} color={selected ? '#f97316' : '#71717a'} />
                    <Text className={`text-lg font-bold mt-3 ${selected ? 'text-orange-400' : 'text-zinc-400'}`}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Generating */}
        {currentStep === 'generating' && (
          <View className="items-center">
            {isGenerating ? (
              <>
                <View className="w-20 h-20 bg-orange-500 rounded-3xl items-center justify-center mb-6">
                  <ActivityIndicator size="large" color="white" />
                </View>
                <Text className="text-zinc-50 text-2xl font-bold text-center mb-4">
                  Creating Your Plan
                </Text>
                <Text className="text-zinc-400 text-base text-center mb-8">
                  {LOADING_PHRASES[loadingPhrase]}
                </Text>
                <View className="w-full max-w-xs h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <View className="h-full bg-orange-500 rounded-full w-2/3" />
                </View>
              </>
            ) : generationFailed ? (
              <>
                <Text className="text-red-400 text-2xl font-bold text-center mb-4">
                  Something went wrong
                </Text>
                <Pressable
                  onPress={handleGenerate}
                  className="bg-zinc-800 flex-row items-center px-6 py-3.5 rounded-xl mt-4"
                >
                  <RotateCcw size={18} color="white" />
                  <Text className="text-white font-semibold ml-2">Try Again</Text>
                </Pressable>
              </>
            ) : (
              <>
                <View className="w-20 h-20 bg-green-500 rounded-3xl items-center justify-center mb-6">
                  <Sparkles size={40} color="white" />
                </View>
                <Text className="text-zinc-50 text-2xl font-bold text-center mb-4">
                  You're All Set!
                </Text>
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Navigation */}
      {currentStep !== 'generating' && (
        <View className="flex-row justify-between px-6 pb-10 pt-4">
          <Pressable
            onPress={() => setStep(Math.max(0, step - 1))}
            className={`flex-row items-center px-5 py-3 rounded-xl bg-zinc-900 ${step === 0 ? 'opacity-0' : ''}`}
            disabled={step === 0}
          >
            <ChevronLeft size={18} color="#a1a1aa" />
            <Text className="text-zinc-400 font-semibold ml-1">Back</Text>
          </Pressable>

          <Pressable
            onPress={handleNext}
            disabled={!canProceed()}
            className={`flex-row items-center px-6 py-3 rounded-xl ${
              canProceed() ? 'bg-orange-500' : 'bg-zinc-800 opacity-50'
            }`}
          >
            <Text className={`font-semibold mr-1 ${canProceed() ? 'text-white' : 'text-zinc-600'}`}>
              {step === STEPS.length - 2 ? 'Generate Plan' : 'Continue'}
            </Text>
            <ChevronRight size={18} color={canProceed() ? 'white' : '#52525b'} />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
