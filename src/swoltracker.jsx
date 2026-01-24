import React, { useState, useEffect } from 'react';
import { User, Dumbbell, Calendar, TrendingUp, Settings, ChevronRight, ChevronLeft, Check, Plus, Flame, Target, Zap, Brain, Edit3, X, BarChart3, Clock, Award, UserPlus, Package, Loader2, Trash2, AlertCircle, LogOut, Users, Copy, CheckCircle, Bell } from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase, signInWithGoogle, signOut, db } from './lib/supabase';

// Default workout program data (used when no database or for demo)
const defaultWorkoutProgram = {
  1: {
    Monday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Bench Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Chest, Triceps, Shoulders' },
        { name: 'Pull-Ups', sets: 3, reps: '8-12', percentages: null, muscleGroups: 'Back, Biceps', note: 'Bodyweight or weighted' },
        { name: 'Overhead Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Shoulders, Triceps' },
        { name: 'Rower Finisher', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Full Body Cardio', note: '30s sprint / 30s easy' },
      ],
    },
    Tuesday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Back Squat', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Quads, Glutes, Core' },
        { name: 'Romanian Deadlift', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Hamstrings, Back, Glutes' },
        { name: 'Kettlebell Swings', sets: 3, reps: '10-15', percentages: null, muscleGroups: 'Hips, Core, Power', note: '50-60% deadlift 1RM' },
        { name: 'Assault Bike Finisher', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Cardio', note: '20s max / 40s recovery' },
      ],
    },
    Wednesday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Dumbbell Rows', sets: 3, reps: '8-12/side', percentages: [65, 70, 75], muscleGroups: 'Back, Biceps' },
        { name: 'Incline Bench Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Upper Chest, Shoulders' },
        { name: 'Cable Face Pulls', sets: 3, reps: '10-15', percentages: null, muscleGroups: 'Rear Shoulders, Upper Back', note: '50-60% row equivalent' },
        { name: 'Wall Ball Throws', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Full Body Power', note: '20 throws / 30s rest' },
      ],
    },
    Thursday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Front Squat', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Quads, Core, Mobility' },
        { name: 'Walking Lunges', sets: 3, reps: '8-12/leg', percentages: null, muscleGroups: 'Legs, Glutes, Balance', note: '40-50% squat 1RM total' },
        { name: 'Calf Raises', sets: 3, reps: '10-15', percentages: null, muscleGroups: 'Calves, Stability', note: '65-75% max' },
        { name: 'Weight Sled Push', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Lower Body Power', note: '20m push / 40s rest' },
      ],
    },
    Friday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Cable Rows', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Back, Biceps' },
        { name: 'Dumbbell Chest Flyes', sets: 3, reps: '10-15', percentages: null, muscleGroups: 'Chest, Stabilizers', note: '50-60% bench 1RM' },
        { name: 'Dips', sets: 3, reps: '8-12', percentages: null, muscleGroups: 'Chest, Triceps, Shoulders', note: 'Bodyweight or weighted' },
        { name: 'Treadmill Intervals', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Cardio Recovery', note: '1 min jog / 1 min walk' },
      ],
    },
    Saturday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Deadlift', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Back, Hamstrings, Glutes' },
        { name: 'Step-Ups', sets: 3, reps: '8-12/leg', percentages: null, muscleGroups: 'Quads, Glutes, Functional', note: '40-50% squat 1RM' },
        { name: 'Kettlebell Goblet Squats', sets: 3, reps: '10-15', percentages: null, muscleGroups: 'Legs, Core', note: '50-60% squat 1RM' },
        { name: 'Rower + Bike Combo', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Hybrid Cardio', note: '1 min row / 1 min bike' },
      ],
    },
    Sunday: { focus: 'Rest Day', exercises: [] },
  },
  2: {
    Monday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Push Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Shoulders, Triceps, Power' },
        { name: 'Barbell Rows', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Back, Biceps' },
        { name: 'Handstand Push-Ups', sets: 3, reps: '8-12', percentages: null, muscleGroups: 'Shoulders, Triceps', note: 'Scale with pike if needed' },
        { name: 'Assault Bike Finisher', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Cardio', note: '15s max / 45s easy' },
      ],
    },
    Tuesday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Power Clean', sets: 3, reps: '6-10', percentages: [65, 70, 75], muscleGroups: 'Full Body Power, Olympic' },
        { name: 'Front Squat', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Quads, Core' },
        { name: 'Bulgarian Split Squats', sets: 3, reps: '8-12/leg', percentages: null, muscleGroups: 'Quads, Glutes', note: '40-50% squat 1RM' },
        { name: 'Rower Finisher', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Conditioning', note: '40s hard / 20s easy' },
      ],
    },
    Wednesday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Close-Grip Bench Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Triceps, Chest' },
        { name: 'Pull-Ups', sets: 3, reps: '8-12', percentages: null, muscleGroups: 'Back, Biceps', note: 'Add weight if possible' },
        { name: 'Dumbbell Push Jerks', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Shoulders, Explosive' },
        { name: 'Wall Ball + Burpees', sets: 1, reps: '10 min EMOM', percentages: null, muscleGroups: 'Metcon', note: '10 wall balls + 5 burpees' },
      ],
    },
    Thursday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Hang Snatch', sets: 3, reps: '6-10', percentages: [65, 70, 75], muscleGroups: 'Full Body Power, Olympic' },
        { name: 'Thrusters', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Quads, Shoulders, Conditioning' },
        { name: 'Romanian Deadlift', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Hamstrings, Back' },
        { name: 'Weight Sled Push', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Lower Body Power', note: '25m heavy / 35s rest' },
      ],
    },
    Friday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Seated Cable Rows', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Back, Biceps' },
        { name: 'Incline Dumbbell Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Upper Chest, Shoulders' },
        { name: 'Dips', sets: 3, reps: '8-12', percentages: null, muscleGroups: 'Chest, Triceps', note: 'Weighted if possible' },
        { name: 'Treadmill + Burpees', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Hybrid Cardio', note: '1 min run + 10 burpees' },
      ],
    },
    Saturday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Back Squat', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Quads, Glutes, Core' },
        { name: 'Kettlebell Swings', sets: 3, reps: '12-15', percentages: null, muscleGroups: 'Posterior Chain', note: '60-70% deadlift 1RM' },
        { name: 'Walking Lunges', sets: 3, reps: '10-12/leg', percentages: null, muscleGroups: 'Functional Strength', note: '40-50% squat 1RM' },
        { name: 'Rower + Assault Bike', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Full Body Metcon', note: '500m row + 20 cal bike' },
      ],
    },
    Sunday: { focus: 'Rest Day', exercises: [] },
  },
  3: {
    Monday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Bench Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Chest, Triceps' },
        { name: 'Pull-Ups', sets: 3, reps: '8-12', percentages: null, muscleGroups: 'Back, Biceps', note: 'Weighted if possible' },
        { name: 'Push Jerk', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Shoulders, Explosive Power' },
        { name: 'Rower Finisher', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Cardio', note: '30s sprint / 30s easy' },
      ],
    },
    Tuesday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Back Squat', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Quads, Glutes, Core' },
        { name: 'Power Snatch', sets: 3, reps: '6-10', percentages: [65, 70, 75], muscleGroups: 'Full Body Power' },
        { name: 'Kettlebell Goblet Squats', sets: 3, reps: '10-15', percentages: null, muscleGroups: 'Legs, Core', note: '60% squat 1RM' },
        { name: 'Assault Bike Finisher', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Cardio', note: '20s max / 40s recovery' },
      ],
    },
    Wednesday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Overhead Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Shoulders' },
        { name: 'Barbell Rows', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Back' },
        { name: 'Handstand Push-Ups', sets: 3, reps: '8-12', percentages: null, muscleGroups: 'Shoulders, Triceps', note: 'Add deficit if able' },
        { name: 'Wall Ball + Burpees', sets: 1, reps: '10 min AMRAP', percentages: null, muscleGroups: 'Metcon', note: '15 wall balls + 10 burpees' },
      ],
    },
    Thursday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Clean & Jerk', sets: 3, reps: '6-10', percentages: [65, 70, 75], muscleGroups: 'Full Body Olympic' },
        { name: 'Front Squat', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Quads, Core' },
        { name: 'Walking Lunges', sets: 3, reps: '8-12/leg', percentages: null, muscleGroups: 'Glutes, Balance', note: '40-50% squat 1RM' },
        { name: 'Sled Push Finisher', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Lower Body Power', note: '20m heavy / 40s rest' },
      ],
    },
    Friday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Incline Bench Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Upper Chest' },
        { name: 'Cable Rows', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Back' },
        { name: 'Dips', sets: 3, reps: '8-12', percentages: null, muscleGroups: 'Chest, Triceps', note: 'Weighted' },
        { name: 'Treadmill Intervals', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Cardio Recovery', note: '45s sprint / 75s walk' },
      ],
    },
    Saturday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Deadlift', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Posterior Chain' },
        { name: 'Thrusters', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Quads, Shoulders' },
        { name: 'Step-Ups', sets: 3, reps: '8-12/leg', percentages: null, muscleGroups: 'Functional', note: '40-50% squat 1RM' },
        { name: 'Rower + Bike Combo', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Hybrid Cardio', note: '1 min row / 1 min bike' },
      ],
    },
    Sunday: { focus: 'Rest Day', exercises: [] },
  },
  4: {
    Monday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Overhead Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Shoulders' },
        { name: 'Chest-Supported Dumbbell Rows', sets: 3, reps: '8-12/side', percentages: [65, 70, 75], muscleGroups: 'Back' },
        { name: 'Close-Grip Bench Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Triceps Emphasis' },
        { name: 'Assault Bike Finisher', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Intense Cardio', note: '30s max / 30s easy' },
      ],
    },
    Tuesday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Hang Clean', sets: 3, reps: '6-10', percentages: [65, 70, 75], muscleGroups: 'Power' },
        { name: 'Bulgarian Split Squats', sets: 3, reps: '8-12/leg', percentages: null, muscleGroups: 'Unilateral', note: 'Progressive load' },
        { name: 'Romanian Deadlift', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Hamstrings' },
        { name: 'Rower Finisher', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Conditioning', note: '500m hard / 1 min easy' },
      ],
    },
    Wednesday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Dumbbell Bench Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Chest' },
        { name: 'Pull-Ups', sets: 3, reps: '8-12', percentages: null, muscleGroups: 'Back, Biceps', note: 'Vary grip; weighted if able' },
        { name: 'Lateral + Front Raises', sets: 3, reps: '10-15', percentages: null, muscleGroups: 'Shoulder Endurance', note: 'Lighter weight' },
        { name: 'Burpee + Wall Ball', sets: 1, reps: '10 min EMOM', percentages: null, muscleGroups: 'Metcon', note: '10 burpees + 10 wall balls' },
      ],
    },
    Thursday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Back Squat', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Quads, Glutes', note: 'Pause at bottom' },
        { name: 'Kettlebell Swings (American)', sets: 3, reps: '15-20', percentages: null, muscleGroups: 'Explosive', note: 'Heavy' },
        { name: 'Calf Raises', sets: 3, reps: '12-15', percentages: null, muscleGroups: 'Calves', note: 'Full ROM' },
        { name: 'Sled Push + Pull', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Power', note: 'Alternate push/pull' },
      ],
    },
    Friday: {
      focus: 'Upper Body',
      exercises: [
        { name: 'Seated Dumbbell Press', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Shoulders' },
        { name: 'Barbell Rows', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Back' },
        { name: 'Handstand/Pike Push-Ups', sets: 3, reps: '8-12', percentages: null, muscleGroups: 'Shoulders', note: 'Progress deficit' },
        { name: 'Treadmill Hills', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Cardio', note: 'High incline' },
      ],
    },
    Saturday: {
      focus: 'Lower Body',
      exercises: [
        { name: 'Snatch Pull + Snatch', sets: 3, reps: '6-10 complex', percentages: [65, 70, 75], muscleGroups: 'Technique + Power' },
        { name: 'Front Squat + OH Press', sets: 3, reps: '8-12', percentages: null, muscleGroups: 'Full Body', note: 'Lighter; complex' },
        { name: 'Sumo Deadlift', sets: 3, reps: '8-12', percentages: [65, 70, 75], muscleGroups: 'Variety', note: 'If usually conventional' },
        { name: 'Mixed Cardio Circuit', sets: 1, reps: '10 min', percentages: null, muscleGroups: 'Full Finish', note: 'Row/Bike/Sled' },
      ],
    },
    Sunday: { focus: 'Rest Day', exercises: [] },
  },
};

// Default profiles for demo mode
const defaultProfiles = {
  merrill: {
    id: 'merrill',
    name: 'Merrill',
    avatar: '💪',
    maxes: {
      'Bench Press': 225,
      'Back Squat': 275,
      'Deadlift': 315,
      'Strict Press': 135,
      'Push Press': 155,
      'Power Clean': 185,
      'Front Squat': 225,
      'Overhead Press': 165,
    },
    buddies: [],
    receivedRequests: [],
    sentRequests: [],
    acceptedNotifications: [],
  },
  wren: {
    id: 'wren',
    name: 'Wren',
    avatar: '🔥',
    maxes: {
      'Bench Press': 200,
      'Back Squat': 245,
      'Deadlift': 295,
      'Strict Press': 115,
      'Push Press': 135,
      'Power Clean': 155,
      'Front Squat': 185,
      'Overhead Press': 135,
    },
    buddies: [],
    receivedRequests: [],
    sentRequests: [],
    acceptedNotifications: [],
  },
};

const defaultEquipment = [
  'Dumbbells', 'Barbells', 'Squat Rack', 'Bench', 'Incline Bench', 'Wall Balls',
  'Dip Bar', 'Pull-up Bar', 'Treadmill', 'Rower', 'Assault Bike', 'Bumper Plates',
  'Cable Machine', 'Sled', 'Kettlebells'
];

const avatarOptions = ['💪', '🔥', '⚡', '🏋️', '💥', '🦾', '🎯', '🚀', '⭐', '🏆'];

// Helper functions
const getMondayOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getWeekDates = (programStartDate, weekNumber) => {
  const start = new Date(programStartDate);
  start.setDate(start.getDate() + (weekNumber - 1) * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start, end };
};

const findMaxKey = (exerciseName, maxes) => {
  const lowerName = exerciseName.toLowerCase();
  for (const key of Object.keys(maxes)) {
    if (lowerName.includes(key.toLowerCase()) || key.toLowerCase().includes(lowerName.split(' ')[0])) {
      return key;
    }
  }
  const mappings = {
    'push press': 'Push Press',
    'push jerk': 'Push Press',
    'power clean': 'Power Clean',
    'hang clean': 'Power Clean',
    'power snatch': 'Power Snatch',
    'hang snatch': 'Power Snatch',
    'snatch pull': 'Power Snatch',
    'clean & jerk': 'Power Clean',
    'thrusters': 'Front Squat',
    'dumbbell bench press': 'Bench Press',
    'incline dumbbell press': 'Incline Bench Press',
    'seated dumbbell press': 'Overhead Press',
    'dumbbell overhead press': 'Overhead Press',
    'barbell rows': 'Barbell Rows',
    'cable rows': 'Barbell Rows',
    'seated cable rows': 'Barbell Rows',
    'sumo deadlift': 'Deadlift',
    'chest-supported dumbbell rows': 'Barbell Rows',
  };
  return mappings[lowerName] || null;
};

const calculateWeight = (percentage, maxes, exerciseName) => {
  const maxKey = findMaxKey(exerciseName, maxes);
  if (maxKey && maxes[maxKey]) {
    return Math.round(maxes[maxKey] * (percentage / 100) / 5) * 5;
  }
  return null;
};

// ============================================
// LOGIN PAGE COMPONENT
// ============================================
function LoginPage({ onLogin, isLoading }) {
  const [error, setError] = useState('');

  const handleGoogleLogin = async () => {
    setError('');
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error.message);
    }
  };

  const handleDemoMode = () => {
    onLogin({ demoMode: true });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-transparent to-purple-500/10 pointer-events-none" />

      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-2xl shadow-orange-500/30">
            <Dumbbell className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">SwolTracker</h1>
          <p className="text-zinc-400">Track your gains. Crush your goals.</p>
        </div>

        {/* Login Card */}
        <div className="w-full max-w-sm">
          <div className="bg-zinc-900/80 backdrop-blur-xl rounded-3xl p-8 border border-zinc-800/50 shadow-2xl">
            <h2 className="text-xl font-bold text-center mb-6">Welcome Back</h2>

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Google Login Button */}
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-4 px-6 rounded-xl bg-white text-zinc-900 font-semibold hover:bg-zinc-100 transition-colors flex items-center justify-center gap-3 disabled:opacity-50 mb-4"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-zinc-900 text-zinc-500">or</span>
              </div>
            </div>

            {/* Demo Mode Button */}
            <button
              onClick={handleDemoMode}
              className="w-full py-4 px-6 rounded-xl bg-zinc-800 text-white font-semibold hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2"
            >
              <Zap className="w-5 h-5 text-orange-500" />
              Try Demo Mode
            </button>

            <p className="text-xs text-zinc-500 text-center mt-4">
              Demo mode lets you explore without signing in
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="mt-12 grid grid-cols-3 gap-6 max-w-sm w-full">
          {[
            { icon: Target, label: 'Track 1RMs' },
            { icon: Calendar, label: 'Plan Weeks' },
            { icon: Brain, label: 'AI Coach' },
          ].map((feature, i) => (
            <div key={i} className="text-center">
              <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-zinc-800/50 flex items-center justify-center">
                <feature.icon className="w-6 h-6 text-orange-500" />
              </div>
              <p className="text-xs text-zinc-400">{feature.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="py-6 text-center">
        <p className="text-xs text-zinc-600">Get Swoll Together 💪</p>
      </div>
    </div>
  );
}

// ============================================
// MAIN APP COMPONENT
// ============================================
export default function SwolTracker() {
  // Auth state
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  // App state
  const [isLoading, setIsLoading] = useState(true);
  const [profiles, setProfiles] = useState(defaultProfiles);
  const [currentUser, setCurrentUser] = useState('merrill');
  const [equipment, setEquipment] = useState(defaultEquipment);
  const [exerciseLog, setExerciseLog] = useState({});
  const [workoutProgram, setWorkoutProgram] = useState(defaultWorkoutProgram);
  const [programStartDate, setProgramStartDate] = useState(() => {
    const today = new Date();
    const monday = getMondayOfWeek(today);
    monday.setDate(monday.getDate() - 21);
    return monday.toISOString();
  });

  const [currentWeek, setCurrentWeek] = useState(4);
  const [currentDay, setCurrentDay] = useState(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[new Date().getDay()];
  });
  const [activeTab, setActiveTab] = useState('workout');
  const [gymId, setGymId] = useState(null);

  // Modal states
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [showAddLift, setShowAddLift] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAiGenerator, setShowAiGenerator] = useState(false);

  // Form states
  const [newUserName, setNewUserName] = useState('');
  const [newUserAvatar, setNewUserAvatar] = useState('💪');
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [newLiftName, setNewLiftName] = useState('');
  const [newLiftWeight, setNewLiftWeight] = useState('');
  const [editingMax, setEditingMax] = useState(null);
  const [tempMaxValue, setTempMaxValue] = useState('');

  // AI states
  const [aiNotes, setAiNotes] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [generatedPreview, setGeneratedPreview] = useState(null);
  const [generationWeek, setGenerationWeek] = useState(null);
  const [openaiKey, setOpenaiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);

  const [selectedReferenceExercise, setSelectedReferenceExercise] = useState('Bench Press');

  // Buddy State
  const [viewingBuddy, setViewingBuddy] = useState(null);
  const [buddiesSearch, setBuddiesSearch] = useState('');

  // Derived state for display (allows viewing other profiles)
  const displayUser = viewingBuddy ? profiles[viewingBuddy] : profiles[currentUser];
  // Ensure we fall back to current user if something breaks, but generally displayUser is what we render
  const user = displayUser || profiles[currentUser];

  const todayWorkout = workoutProgram[currentWeek]?.[currentDay];
  const hasWorkoutProgrammed = workoutProgram[currentWeek] !== undefined;
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const weekDates = getWeekDates(programStartDate, currentWeek);

  // Check auth state on mount
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    // Handle OAuth callback and get session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.email);
      setAuthUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load data from Supabase when authUser changes
  useEffect(() => {
    if (!authUser) return;

    const loadSupabaseData = async () => {
      setIsLoading(true);
      try {
        const userId = authUser.id;
        setCurrentUser(userId);

        // 1. Get or Create Profile
        let profile = await db.getProfile(userId);

        // Merge DB profile with local structure
        const mergedProfile = {
          ...defaultProfiles.merrill, // fallback template
          id: userId,
          name: authUser.user_metadata.full_name || authUser.email.split('@')[0],
          avatar: authUser.user_metadata.avatar_url || '💪',
          ...profile,
          maxes: (await db.getUserMaxes(userId)) || {},
          buddies: [],
          receivedRequests: [],
          sentRequests: [],
          acceptedNotifications: []
        };

        setProfiles({ [userId]: mergedProfile });

        // 2. Get or Create Gym
        const gyms = await db.getMyGyms(userId);
        let activeGymId;
        if (gyms.length === 0) {
          const newGym = await db.createGym('Personal Gym', userId);
          activeGymId = newGym?.id;
        } else {
          activeGymId = gyms[0].id;
        }
        setGymId(activeGymId);

        // 3. Load Equipment
        if (activeGymId) {
          const eq = await db.getGymEquipment(activeGymId);
          if (eq.length > 0) setEquipment(eq);

          // 4. Load Workout Programs
          const programs = await db.getAllWorkoutPrograms(activeGymId);
          if (Object.keys(programs).length > 0) {
            setWorkoutProgram(programs);
          }

          // 5. Load ALL workout logs for this gym (not just current week)
          // This ensures logs persist across week navigation and page reloads
          const logs = await db.getAllWorkoutLogs(activeGymId);

          // Convert DB logs to state format
          const newLog = {};
          logs.forEach(l => {
            const key = `${l.user_id}-${l.week_number}-${l.day_name}-${l.exercise_index}-${l.set_index}`;
            newLog[key] = {
              completed: l.completed,
              actualWeight: l.actual_weight,
              actualReps: l.actual_reps
            };
          });
          setExerciseLog(newLog);
        }

      } catch (e) {
        console.error("Error loading Supabase data:", e);
      } finally {
        setIsLoading(false);
      }
    };

    loadSupabaseData();
  }, [authUser]); // Only re-load when auth changes, not when week changes

  // Load data from localStorage (Legacy / Demo)
  useEffect(() => {
    if (authLoading || authUser) return;

    const loadData = async () => {
      try {
        const savedProfiles = localStorage.getItem('swoltracker-profiles');
        const savedEquipment = localStorage.getItem('swoltracker-equipment');
        const savedLog = localStorage.getItem('swoltracker-log');
        const savedProgram = localStorage.getItem('swoltracker-program');
        const savedStartDate = localStorage.getItem('swoltracker-startdate');
        const savedCurrentUser = localStorage.getItem('swoltracker-currentuser');
        const savedOpenaiKey = localStorage.getItem('swoltracker-openai-key');

        if (savedProfiles) setProfiles(JSON.parse(savedProfiles));
        if (savedEquipment) setEquipment(JSON.parse(savedEquipment));
        if (savedLog) setExerciseLog(JSON.parse(savedLog));
        if (savedProgram) setWorkoutProgram(JSON.parse(savedProgram));
        if (savedStartDate) setProgramStartDate(savedStartDate);
        if (savedCurrentUser) setCurrentUser(savedCurrentUser);
        if (savedOpenaiKey) setOpenaiKey(savedOpenaiKey);
      } catch (error) {
        console.log('Error loading data:', error);
      }
      setIsLoading(false);
    };

    loadData();
  }, [authLoading]);

  // Handle Confetti and Notification Clearing when visiting Buddies tab
  useEffect(() => {
    if (activeTab === 'buddies' && user?.acceptedNotifications?.length > 0) {
      // Trigger confetti for accepted requests
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 }
      });

      // Clear notifications
      setProfiles(prev => ({
        ...prev,
        [currentUser]: {
          ...prev[currentUser],
          acceptedNotifications: []
        }
      }));
    }
  }, [activeTab, currentUser, user?.acceptedNotifications]);

  // Save data to localStorage
  useEffect(() => {
    if (isLoading || authLoading) return;

    try {
      localStorage.setItem('swoltracker-profiles', JSON.stringify(profiles));
      localStorage.setItem('swoltracker-equipment', JSON.stringify(equipment));
      localStorage.setItem('swoltracker-log', JSON.stringify(exerciseLog));
      localStorage.setItem('swoltracker-program', JSON.stringify(workoutProgram));
      localStorage.setItem('swoltracker-startdate', programStartDate);
      localStorage.setItem('swoltracker-currentuser', currentUser);
      if (openaiKey) localStorage.setItem('swoltracker-openai-key', openaiKey);
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }, [profiles, equipment, exerciseLog, workoutProgram, programStartDate, currentUser, openaiKey, isLoading, authLoading]);

  // Handle login
  const handleLogin = (options) => {
    if (options?.demoMode) {
      setDemoMode(true);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    if (supabase && !demoMode) {
      await signOut();
    }
    setDemoMode(false);
    setAuthUser(null);
  };

  // Log a set completion
  const logSet = async (exerciseIndex, setIndex, data) => {
    // Generate key
    const key = `${currentUser}-${currentWeek}-${currentDay}-${exerciseIndex}-${setIndex}`;
    const wasCompleted = exerciseLog[key]?.completed || false;
    const newStatus = !wasCompleted;

    // Optimistic update
    const newLog = {
      ...exerciseLog,
      [key]: {
        ...data,
        completed: newStatus
      }
    };
    setExerciseLog(newLog);

    if (demoMode) return;

    // Persist to Supabase
    if (gymId) {
      const result = await db.logSet(
        currentUser,
        gymId,
        currentWeek,
        currentDay,
        exerciseIndex,
        setIndex,
        data.exerciseName || `Exercise ${exerciseIndex + 1}`,
        {
          ...data,
          completed: newStatus
        }
      );
      if (!result) {
        console.error('Failed to save workout log to database');
      }
    } else {
      console.warn('Cannot save workout log: gymId is not set');
    }
  };

  const isSetLogged = (exerciseIndex, setIndex, targetUserId = currentUser) => {
    const key = `${targetUserId}-${currentWeek}-${currentDay}-${exerciseIndex}-${setIndex}`;
    return exerciseLog[key]?.completed;
  };

  const getCompletionPercentage = (week, day, targetUserId = currentUser) => {
    if (!workoutProgram[week] || !workoutProgram[week][day] || !workoutProgram[week][day].exercises) {
      return 0;
    }
    const totalSets = workoutProgram[week][day].exercises.reduce((acc, exercise) => acc + exercise.sets, 0);
    if (totalSets === 0) return 0;

    let completedSets = 0;
    workoutProgram[week][day].exercises.forEach((exercise, exerciseIndex) => {
      for (let setIndex = 0; setIndex < exercise.sets; setIndex++) {
        const key = `${targetUserId}-${week}-${day}-${exerciseIndex}-${setIndex}`;
        if (exerciseLog[key]?.completed) {
          completedSets++;
        }
      }
    });
    return Math.round((completedSets / totalSets) * 100);
  };

  // User management
  const addNewUser = () => {
    if (!newUserName.trim()) return;
    const userId = newUserName.toLowerCase().replace(/\s+/g, '_');
    setProfiles(prev => ({
      ...prev,
      [userId]: {
        id: userId,
        name: newUserName,
        avatar: newUserAvatar,
        maxes: {
          'Bench Press': 135,
          'Back Squat': 185,
          'Deadlift': 225,
          'Overhead Press': 95,
        },
        buddies: [],
        receivedRequests: [],
        sentRequests: [],
        acceptedNotifications: [],
      }
    }));
    setNewUserName('');
    setNewUserAvatar('💪');
    setShowAddUser(false);
    setCurrentUser(userId);
  };

  const deleteUser = (userId) => {
    if (Object.keys(profiles).length <= 1) return;
    const newProfiles = { ...profiles };
    delete newProfiles[userId];
    setProfiles(newProfiles);
    if (currentUser === userId) {
      setCurrentUser(Object.keys(newProfiles)[0]);
    }
  };

  // Buddy Management
  const sendBuddyRequest = (targetId) => {
    if (targetId === currentUser || profiles[currentUser].buddies?.includes(targetId)) return;

    setProfiles(prev => {
      // Avoid duplicates
      const existingSent = prev[currentUser].sentRequests?.find(r => r.to === targetId);
      if (existingSent) return prev;

      return {
        ...prev,
        [currentUser]: {
          ...prev[currentUser],
          sentRequests: [...(prev[currentUser].sentRequests || []), { to: targetId, timestamp: new Date().toISOString() }]
        },
        [targetId]: {
          ...prev[targetId],
          receivedRequests: [...(prev[targetId].receivedRequests || []), { from: currentUser, timestamp: new Date().toISOString() }]
        }
      };
    });
    setBuddiesSearch('');
  };

  const acceptBuddyRequest = (requesterId) => {
    setProfiles(prev => {
      // Remove request from both sides and add to buddies
      const newCurrentUser = { ...prev[currentUser] };
      newCurrentUser.receivedRequests = (newCurrentUser.receivedRequests || []).filter(r => r.from !== requesterId);
      newCurrentUser.buddies = [...(newCurrentUser.buddies || []), requesterId];

      const newRequester = { ...prev[requesterId] };
      newRequester.sentRequests = (newRequester.sentRequests || []).filter(r => r.to !== currentUser);
      newRequester.buddies = [...(newRequester.buddies || []), currentUser];
      // Notify requester that we accepted
      newRequester.acceptedNotifications = [...(newRequester.acceptedNotifications || []), { from: currentUser, timestamp: new Date().toISOString() }];

      return {
        ...prev,
        [currentUser]: newCurrentUser,
        [requesterId]: newRequester
      };
    });

    // Trigger confetti immediately for the accepting user
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const declineBuddyRequest = (requesterId) => {
    setProfiles(prev => {
      const newCurrentUser = { ...prev[currentUser] };
      newCurrentUser.receivedRequests = (newCurrentUser.receivedRequests || []).filter(r => r.from !== requesterId);

      const newRequester = { ...prev[requesterId] };
      newRequester.sentRequests = (newRequester.sentRequests || []).filter(r => r.to !== currentUser);

      return {
        ...prev,
        [currentUser]: newCurrentUser,
        [requesterId]: newRequester
      };
    });
  };

  const removeBuddy = (buddyId) => {
    setProfiles(prev => {
      const newCurrentUser = { ...prev[currentUser] };
      newCurrentUser.buddies = (newCurrentUser.buddies || []).filter(id => id !== buddyId);

      const newBuddy = { ...prev[buddyId] };
      newBuddy.buddies = (newBuddy.buddies || []).filter(id => id !== currentUser);

      return {
        ...prev,
        [currentUser]: newCurrentUser,
        [buddyId]: newBuddy
      };
    });
    if (viewingBuddy === buddyId) {
      setViewingBuddy(null);
    }
  };

  // Equipment management
  const addEquipment = () => {
    if (!newEquipmentName.trim() || equipment.includes(newEquipmentName)) return;
    setEquipment(prev => [...prev, newEquipmentName]);
    setNewEquipmentName('');
    setShowAddEquipment(false);
  };

  const removeEquipment = (item) => {
    setEquipment(prev => prev.filter(e => e !== item));
  };

  // 1RM management
  const updateMax = (lift, value) => {
    setProfiles(prev => ({
      ...prev,
      [currentUser]: {
        ...prev[currentUser],
        maxes: { ...prev[currentUser].maxes, [lift]: parseInt(value) || 0 }
      }
    }));
    setEditingMax(null);
  };

  const addNewLift = () => {
    if (!newLiftName.trim() || !newLiftWeight) return;
    setProfiles(prev => ({
      ...prev,
      [currentUser]: {
        ...prev[currentUser],
        maxes: { ...prev[currentUser].maxes, [newLiftName]: parseInt(newLiftWeight) }
      }
    }));
    setNewLiftName('');
    setNewLiftWeight('');
    setShowAddLift(false);
  };

  const deleteLift = (lift) => {
    const newMaxes = { ...profiles[currentUser].maxes };
    delete newMaxes[lift];
    setProfiles(prev => ({
      ...prev,
      [currentUser]: { ...prev[currentUser], maxes: newMaxes }
    }));
  };

  // AI workout generation with ChatGPT
  const getRecentWeeksContext = (targetWeek) => {
    const weeksToInclude = [];
    for (let w = Math.max(1, targetWeek - 3); w < targetWeek; w++) {
      if (workoutProgram[w]) {
        weeksToInclude.push({ week: w, program: workoutProgram[w] });
      }
    }
    return weeksToInclude;
  };

  const getProgressForWeeks = (weeks) => {
    const progress = {};
    weeks.forEach(({ week }) => {
      progress[week] = {};
      const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      dayNames.forEach(day => {
        const dayLog = [];
        Object.keys(exerciseLog).forEach(key => {
          if (key.includes(`-${week}-${day}-`) && exerciseLog[key]?.completed) {
            dayLog.push(exerciseLog[key]);
          }
        });
        if (dayLog.length > 0) {
          progress[week][day] = dayLog;
        }
      });
    });
    return progress;
  };

  const openAiGenerator = (weekNum) => {
    setGenerationWeek(weekNum);
    setAiNotes('');
    setAiError('');
    setGeneratedPreview(null);
    setShowAiGenerator(true);

    if (!openaiKey) {
      setShowApiKeyInput(true);
    }
  };

  const generateAiWorkout = async () => {
    if (!openaiKey) {
      setAiError('Please enter your OpenAI API key');
      setShowApiKeyInput(true);
      return;
    }

    setAiLoading(true);
    setAiError('');
    setGeneratedPreview(null);

    try {
      const recentWeeks = getRecentWeeksContext(generationWeek);
      const progressData = getProgressForWeeks(recentWeeks);

      const systemPrompt = `You are an elite strength and conditioning coach with 20+ years of experience training athletes. You design periodized programs that build systematically on previous weeks while preventing overtraining and promoting recovery.

Your philosophy:
- Progressive overload is key but must be balanced with recovery
- Exercise variety prevents plateaus and keeps athletes engaged  
- Compound movements form the foundation, accessory work fills gaps
- Conditioning should complement strength work, not detract from it
- Every workout should have purpose and build toward long-term goals

You will generate a complete week of workouts in JSON format that can be directly parsed. Be precise and follow the exact structure provided.`;

      const userPrompt = `Generate Week ${generationWeek} workout program for the following athlete(s):

## ATHLETE PROFILES:
${Object.entries(profiles).map(([id, p]) => `
**${p.name}** (${p.avatar})
Current 1RM Maxes:
${Object.entries(p.maxes).map(([lift, weight]) => `- ${lift}: ${weight} lbs`).join('\n')}
`).join('\n')}

## AVAILABLE GYM EQUIPMENT:
${equipment.join(', ')}

## PREVIOUS WEEKS PROGRAMMING:
${recentWeeks.length > 0 ? recentWeeks.map(({ week, program }) => `
### Week ${week}:
${Object.entries(program).filter(([day]) => day !== 'Sunday').map(([day, workout]) => `
**${day} - ${workout.focus}:**
${workout.exercises?.map(ex => `- ${ex.name}: ${ex.sets}x${ex.reps}${ex.percentages ? ` @ ${ex.percentages.join('/')}% 1RM` : ''}`).join('\n') || 'Rest Day'}
`).join('')}
`).join('\n') : 'No previous weeks available - create a foundational program.'}

## LOGGED PROGRESS FROM RECENT WEEKS:
${Object.keys(progressData).length > 0 ? JSON.stringify(progressData, null, 2) : 'No logged progress yet - this may be their first week tracking.'}

## ATHLETE'S NOTES & REQUESTS:
${aiNotes || 'No specific requests - continue progressive programming based on previous weeks.'}

## INSTRUCTIONS:
1. Create a 6-day program (Monday-Saturday, Sunday is always rest)
2. Follow the same weekly structure: alternate Upper Body and Lower Body days
3. Use percentages of 1RM for main lifts (typically 65%, 70%, 75% across 3 sets)
4. Progress appropriately from previous weeks (slightly increased volume or intensity)
5. Include a conditioning finisher for each day
6. Only use exercises possible with the available equipment
7. Match the style and format of previous weeks

## REQUIRED JSON FORMAT:
Respond with ONLY valid JSON in this exact structure (no markdown, no explanation, just JSON):
{
  "Monday": {
    "focus": "Upper Body",
    "exercises": [
      {
        "name": "Exercise Name",
        "sets": 3,
        "reps": "8-12",
        "percentages": [65, 70, 75],
        "muscleGroups": "Primary, Secondary",
        "note": "Optional coaching note"
      }
    ]
  },
  "Tuesday": { ... },
  "Wednesday": { ... },
  "Thursday": { ... },
  "Friday": { ... },
  "Saturday": { ... },
  "Sunday": { "focus": "Rest Day", "exercises": [] }
}

For exercises without percentage-based loading (bodyweight, conditioning, etc.), set "percentages": null.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 4000
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.choices[0]?.message?.content || '';

      // Parse the JSON response
      const cleanedResponse = responseText.replace(/```json|```/g, '').trim();
      const generatedProgram = JSON.parse(cleanedResponse);

      // Validate structure
      const requiredDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      for (const day of requiredDays) {
        if (!generatedProgram[day]) {
          throw new Error(`Missing day: ${day}`);
        }
      }

      setGeneratedPreview(generatedProgram);

    } catch (error) {
      console.error('AI Generation Error:', error);
      setAiError(error.message || 'Failed to generate workout. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const confirmGeneratedWorkout = async () => {
    if (!generatedPreview || !generationWeek) return;

    setWorkoutProgram(prev => ({
      ...prev,
      [generationWeek]: generatedPreview
    }));

    // Persist to Supabase
    if (gymId) {
      await db.saveWorkoutProgram(
        gymId,
        generationWeek,
        generatedPreview,
        currentUser,
        true, // aiGenerated
        aiNotes
      );
    }

    setShowAiGenerator(false);
    setGeneratedPreview(null);
    setCurrentWeek(generationWeek);
  };

  // Calculate completion


  const getTotalCompletedSets = (targetUserId = currentUser) => {
    return Object.keys(exerciseLog).filter(k => k.startsWith(targetUserId) && exerciseLog[k]?.completed).length;
  };

  // Show loading screen
  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-orange-500 mx-auto mb-4" />
          <p className="text-zinc-400">Loading your gains...</p>
        </div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!authUser && !demoMode) {
    return <LoginPage onLogin={handleLogin} isLoading={authLoading} />;
  }

  // Main App
  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-b from-zinc-900 to-zinc-900/95 backdrop-blur-xl border-b border-zinc-800/50">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-xl shadow-lg shadow-orange-500/20">
                {user?.avatar}
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">SwolTracker</h1>
                <p className="text-xs text-zinc-400 font-medium">
                  {demoMode ? 'Demo Mode' : user?.name + "'s Training"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center hover:bg-zinc-700 transition-colors"
              >
                <Settings className="w-5 h-5 text-zinc-300" />
              </button>
              <button
                onClick={() => setShowProfileSwitcher(true)}
                className="w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center hover:bg-zinc-700 transition-colors"
              >
                <User className="w-5 h-5 text-zinc-300" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* View Mode Banner */}
      {viewingBuddy && (
        <div className="bg-blue-600 px-4 py-2 flex items-center justify-between shadow-md relative z-30">
          <div className="flex items-center gap-2 text-white">
            <Users className="w-4 h-4" />
            <span className="text-sm font-medium">Viewing {profiles[viewingBuddy]?.name}'s Profile</span>
          </div>
          <button
            onClick={() => setViewingBuddy(null)}
            className="text-xs bg-white/20 hover:bg-white/30 text-white px-3 py-1 rounded-full font-medium transition-colors"
          >
            Exit View
          </button>
        </div>
      )}

      {/* Profile Switcher Modal */}
      {showProfileSwitcher && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Switch Profile</h2>
              <button onClick={() => setShowProfileSwitcher(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Profile List */}
            <div className="space-y-3">
              {Object.entries(profiles)
                .filter(([id, _]) => id === currentUser || user.buddies?.includes(id))
                .map(([id, profile]) => (
                  <div
                    key={id}
                    className={`p-4 rounded-2xl flex items-center gap-4 transition-all ${currentUser === id
                      ? 'bg-gradient-to-r from-orange-500/20 to-red-500/20 border-2 border-orange-500/50'
                      : 'bg-zinc-800/50 border-2 border-transparent hover:border-zinc-700'
                      }`}
                  >
                    <button
                      onClick={() => { setCurrentUser(id); setShowProfileSwitcher(false); }}
                      className="flex items-center gap-4 flex-1"
                    >
                      <span className="text-3xl">{profile.avatar}</span>
                      <div className="text-left">
                        <p className="font-semibold text-lg">{profile.name}</p>
                        <p className="text-sm text-zinc-400">
                          Bench: {profile.maxes['Bench Press'] || 0} lbs • Squat: {profile.maxes['Back Squat'] || 0} lbs
                        </p>
                      </div>
                    </button>
                    {currentUser === id && <Check className="w-6 h-6 text-orange-500" />}
                    {Object.keys(profiles).length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteUser(id); }}
                        className="p-2 hover:bg-red-500/20 rounded-lg text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}

              {/* Debug / Demo Option to see all users */}
              <div className="pt-4 border-t border-zinc-800 mt-4">
                <p className="text-xs text-zinc-500 mb-2">Debug Actions</p>
                <button
                  onClick={() => {
                    // Demo hack: Show a prompt or simple list to switch to any user
                    const allUsers = Object.keys(profiles).join(', ');
                    const target = prompt(`Demo Switch: Enter username to switch to:\nAvailable: ${allUsers}`);
                    if (target && profiles[target]) {
                      setCurrentUser(target);
                      setShowProfileSwitcher(false);
                    }
                  }}
                  className="w-full p-3 rounded-xl bg-zinc-800/50 text-xs text-zinc-400 hover:text-white transition-colors border border-zinc-700/50 border-dashed"
                >
                  Force Switch Profile (Demo)
                </button>
              </div>
            </div>

            <button
              onClick={() => { setShowProfileSwitcher(false); setShowAddUser(true); }}
              className="w-full mt-4 p-4 rounded-2xl bg-zinc-800/50 border-2 border-dashed border-zinc-700 font-semibold hover:border-orange-500/50 transition-colors flex items-center justify-center gap-2"
            >
              <UserPlus className="w-5 h-5" />
              Add New User
            </button>

            {/* Logout Button */}
            < button
              onClick={handleLogout}
              className="w-full mt-4 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 font-semibold hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2 text-red-400"
            >
              <LogOut className="w-5 h-5" />
              {demoMode ? 'Exit Demo' : 'Sign Out'}
            </button>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6">
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Add New User</h2>
              <button onClick={() => setShowAddUser(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Name</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Enter name"
                  className="w-full px-4 py-3 bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Avatar</label>
                <div className="flex gap-2 flex-wrap">
                  {avatarOptions.map(emoji => (
                    <button
                      key={emoji}
                      onClick={() => setNewUserAvatar(emoji)}
                      className={`w-12 h-12 rounded-xl text-2xl flex items-center justify-center transition-all ${newUserAvatar === emoji
                        ? 'bg-orange-500/30 ring-2 ring-orange-500'
                        : 'bg-zinc-800 hover:bg-zinc-700'
                        }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={addNewUser}
                disabled={!newUserName.trim()}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Create Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Settings</h2>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* AI Coach Section */}
            <div className="mb-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-2xl border border-green-500/20 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold">AI Coach</h3>
                  <p className="text-xs text-zinc-400">Powered by ChatGPT</p>
                </div>
              </div>

              <button
                onClick={() => {
                  let nextWeek = 1;
                  while (workoutProgram[nextWeek]) nextWeek++;
                  openAiGenerator(nextWeek);
                  setShowSettings(false);
                }}
                disabled={currentUser !== user.id}
                className={`w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm ${currentUser !== user.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Zap className="w-4 h-4" />
                Generate Next Week's Program
              </button>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(weekNum => {
                  const hasProgram = workoutProgram[weekNum];
                  return (
                    <div key={weekNum} className={`p-2 rounded-lg border text-center ${hasProgram ? 'bg-green-500/20 border-green-500/30' : 'bg-zinc-800/50 border-zinc-700'}`}>
                      <p className="text-xs font-bold text-zinc-300">W{weekNum}</p>
                      {hasProgram && <Check className="w-3 h-3 text-green-500 mx-auto mt-1" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* OpenAI API Key */}
            <div className="mb-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-500" />
                ChatGPT API Key
              </h3>
              {openaiKey ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-sm text-green-400 flex-1">API Key saved</span>
                    <span className="text-xs text-zinc-500 font-mono">
                      {openaiKey.slice(0, 7)}...{openaiKey.slice(-4)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setOpenaiKey('');
                        localStorage.removeItem('swoltracker-openai-key');
                      }}
                      className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Key
                    </button>
                    <button
                      onClick={() => {
                        const newKey = prompt('Enter new OpenAI API Key:');
                        if (newKey && newKey.trim()) {
                          setOpenaiKey(newKey.trim());
                          localStorage.setItem('swoltracker-openai-key', newKey.trim());
                        }
                      }}
                      className="flex-1 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-xl text-sm font-medium hover:bg-purple-500/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <Edit3 className="w-4 h-4" />
                      Replace Key
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    type="password"
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-4 py-3 bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                  <p className="text-xs text-zinc-500 mt-2">
                    Required for AI workout generation. Get your key at platform.openai.com
                  </p>
                </>
              )}
            </div>

            {/* Equipment Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Package className="w-5 h-5 text-orange-500" />
                  Gym Equipment
                </h3>
                <button
                  onClick={() => { setShowSettings(false); setShowAddEquipment(true); }}
                  className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {equipment.map(item => (
                  <div key={item} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 rounded-lg text-sm">
                    <span>{item}</span>
                    <button onClick={() => removeEquipment(item)} className="text-zinc-500 hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Program Info */}
            <div className="p-4 bg-zinc-800/50 rounded-xl">
              <h3 className="font-semibold mb-2">Program Started</h3>
              <p className="text-zinc-400 text-sm">
                {new Date(programStartDate).toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                })}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Week 4 is the current week</p>
            </div>
          </div>
        </div>
      )}

      {/* Add Equipment Modal */}
      {showAddEquipment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6">
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Add Equipment</h2>
              <button onClick={() => setShowAddEquipment(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                value={newEquipmentName}
                onChange={(e) => setNewEquipmentName(e.target.value)}
                placeholder="Equipment name"
                className="w-full px-4 py-3 bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                onClick={addEquipment}
                disabled={!newEquipmentName.trim()}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Add Equipment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Settings</h2>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* AI Coach Section */}
            <div className="mb-6 bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-2xl border border-green-500/20 p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <Brain className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold">AI Coach</h3>
                  <p className="text-xs text-zinc-400">Powered by ChatGPT</p>
                </div>
              </div>

              <button
                onClick={() => {
                  let nextWeek = 1;
                  while (workoutProgram[nextWeek]) nextWeek++;
                  openAiGenerator(nextWeek);
                  setShowSettings(false);
                }}
                disabled={currentUser !== user.id}
                className={`w-full py-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-sm ${currentUser !== user.id ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Zap className="w-4 h-4" />
                Generate Next Week's Program
              </button>

              <div className="mt-4 grid grid-cols-4 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(weekNum => {
                  const hasProgram = workoutProgram[weekNum];
                  return (
                    <div key={weekNum} className={`p-2 rounded-lg border text-center ${hasProgram ? 'bg-green-500/20 border-green-500/30' : 'bg-zinc-800/50 border-zinc-700'}`}>
                      <p className="text-xs font-bold text-zinc-300">W{weekNum}</p>
                      {hasProgram && <Check className="w-3 h-3 text-green-500 mx-auto mt-1" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* OpenAI API Key */}
            <div className="mb-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-500" />
                ChatGPT API Key
              </h3>
              {openaiKey ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="text-sm text-green-400 flex-1">API Key saved</span>
                    <span className="text-xs text-zinc-500 font-mono">
                      {openaiKey.slice(0, 7)}...{openaiKey.slice(-4)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setOpenaiKey('');
                        localStorage.removeItem('swoltracker-openai-key');
                      }}
                      className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 rounded-xl text-sm font-medium hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Key
                    </button>
                    <button
                      onClick={() => {
                        const newKey = prompt('Enter new OpenAI API Key:');
                        if (newKey && newKey.trim()) {
                          setOpenaiKey(newKey.trim());
                          localStorage.setItem('swoltracker-openai-key', newKey.trim());
                        }
                      }}
                      className="flex-1 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-xl text-sm font-medium hover:bg-purple-500/30 transition-colors flex items-center justify-center gap-2"
                    >
                      <Edit3 className="w-4 h-4" />
                      Replace Key
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    type="password"
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-4 py-3 bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  />
                  <p className="text-xs text-zinc-500 mt-2">
                    Required for AI workout generation. Get your key at platform.openai.com
                  </p>
                </>
              )}
            </div>

            {/* Equipment Section */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <Package className="w-5 h-5 text-orange-500" />
                  Gym Equipment
                </h3>
                <button
                  onClick={() => { setShowSettings(false); setShowAddEquipment(true); }}
                  className="p-2 bg-zinc-800 rounded-lg hover:bg-zinc-700"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {equipment.map(item => (
                  <div key={item} className="flex items-center gap-1 px-3 py-1.5 bg-zinc-800 rounded-lg text-sm">
                    <span>{item}</span>
                    <button onClick={() => removeEquipment(item)} className="text-zinc-500 hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Program Info */}
            <div className="p-4 bg-zinc-800/50 rounded-xl">
              <h3 className="font-semibold mb-2">Program Started</h3>
              <p className="text-zinc-400 text-sm">
                {new Date(programStartDate).toLocaleDateString('en-US', {
                  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
                })}
              </p>
              <p className="text-xs text-zinc-500 mt-1">Week 4 is the current week</p>
            </div>
          </div>
        </div>
      )}

      {/* Add Lift Modal */}
      {showAddLift && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-lg bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6">
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Add 1RM Lift</h2>
              <button onClick={() => setShowAddLift(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">Lift Name</label>
                <input
                  type="text"
                  value={newLiftName}
                  onChange={(e) => setNewLiftName(e.target.value)}
                  placeholder="e.g. Sumo Deadlift"
                  className="w-full px-4 py-3 bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-2 block">1RM Weight (lbs)</label>
                <input
                  type="number"
                  value={newLiftWeight}
                  onChange={(e) => setNewLiftWeight(e.target.value)}
                  placeholder="e.g. 315"
                  className="w-full px-4 py-3 bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <button
                onClick={addNewLift}
                disabled={!newLiftName.trim() || !newLiftWeight}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Add Lift
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Workout Generator Modal */}
      {showAiGenerator && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center overflow-y-auto">
          <div className="w-full max-w-2xl bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6 my-4 max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                  <Brain className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">AI Workout Generator</h2>
                  <p className="text-sm text-zinc-400">Powered by ChatGPT • Week {generationWeek}</p>
                </div>
              </div>
              <button
                onClick={() => setShowAiGenerator(false)}
                className="p-2 hover:bg-zinc-800 rounded-lg"
                disabled={aiLoading}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!generatedPreview ? (
              <>
                {/* API Key Status/Input */}
                {openaiKey ? (
                  <div className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <div>
                        <p className="text-sm text-green-400 font-medium">API Key Ready</p>
                        <p className="text-xs text-zinc-500 font-mono">{openaiKey.slice(0, 7)}...{openaiKey.slice(-4)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowSettings(true)}
                      className="text-xs text-zinc-400 hover:text-white"
                    >
                      Manage in Settings
                    </button>
                  </div>
                ) : showApiKeyInput ? (
                  <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                    <h3 className="font-semibold text-yellow-400 mb-2">OpenAI API Key Required</h3>
                    <input
                      type="password"
                      value={openaiKey}
                      onChange={(e) => {
                        const newKey = e.target.value;
                        setOpenaiKey(newKey);
                        if (newKey.startsWith('sk-') && newKey.length > 20) {
                          localStorage.setItem('swoltracker-openai-key', newKey);
                        }
                      }}
                      placeholder="sk-..."
                      className="w-full px-4 py-3 bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-yellow-500 text-sm mb-2"
                    />
                    <p className="text-xs text-zinc-400">
                      Get your API key at <span className="text-yellow-400">platform.openai.com</span>. Key will be saved automatically.
                    </p>
                  </div>
                ) : null}

                {/* Context Summary */}
                <div className="space-y-4 mb-6">
                  {/* Athletes */}
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <h3 className="font-semibold text-sm text-zinc-300 mb-3 flex items-center gap-2">
                      <User className="w-4 h-4 text-orange-500" />
                      Athletes
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(profiles).map(([id, p]) => (
                        <div key={id} className="flex items-center gap-2 bg-zinc-700/50 px-3 py-1.5 rounded-lg">
                          <span>{p.avatar}</span>
                          <span className="text-sm font-medium">{p.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Equipment */}
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <h3 className="font-semibold text-sm text-zinc-300 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4 text-green-500" />
                      Available Equipment ({equipment.length} items)
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {equipment.slice(0, 10).map(item => (
                        <span key={item} className="text-xs bg-zinc-700/50 px-2 py-1 rounded">
                          {item}
                        </span>
                      ))}
                      {equipment.length > 10 && (
                        <span className="text-xs text-zinc-400 px-2 py-1">
                          +{equipment.length - 10} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Previous Weeks */}
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <h3 className="font-semibold text-sm text-zinc-300 mb-3 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-500" />
                      Building From Previous Weeks
                    </h3>
                    <div className="flex gap-2">
                      {[generationWeek - 3, generationWeek - 2, generationWeek - 1].map(w => (
                        w > 0 && (
                          <div
                            key={w}
                            className={`flex-1 p-3 rounded-lg text-center ${workoutProgram[w]
                              ? 'bg-green-500/20 border border-green-500/30'
                              : 'bg-zinc-700/30 border border-zinc-600/30'
                              }`}
                          >
                            <p className="text-xs text-zinc-400">Week {w}</p>
                            <p className="text-sm font-medium">
                              {workoutProgram[w] ? '✓ Available' : 'No data'}
                            </p>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                </div>

                {/* Notes Input */}
                <div className="mb-6">
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">
                    Special Requests or Notes for AI Coach
                  </label>
                  <textarea
                    value={aiNotes}
                    onChange={(e) => setAiNotes(e.target.value)}
                    placeholder="Examples:
• Focus more on upper body this week
• Include more Olympic lifting
• I have a shoulder injury - avoid overhead pressing
• Increase conditioning intensity
• Add more core work"
                    className="w-full h-32 px-4 py-3 bg-zinc-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 text-sm resize-none"
                  />
                </div>

                {/* Error Message */}
                {aiError && (
                  <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-red-400 text-sm">Generation Failed</p>
                      <p className="text-sm text-red-300/80 mt-1">{aiError}</p>
                    </div>
                  </div>
                )}

                {/* Generate Button */}
                <button
                  onClick={generateAiWorkout}
                  disabled={aiLoading || !openaiKey}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-green-500/25"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Generating Week {generationWeek}...
                    </>
                  ) : (
                    <>
                      <Zap className="w-5 h-5" />
                      Generate Workout Program
                    </>
                  )}
                </button>

                <p className="text-xs text-zinc-500 text-center mt-4">
                  Uses GPT-4o to analyze your history and create a progressive program
                </p>
              </>
            ) : (
              <>
                {/* Preview Generated Workout */}
                <div className="mb-6">
                  <div className="flex items-center gap-2 mb-4">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <span className="font-semibold text-green-400">Workout Generated Successfully!</span>
                  </div>

                  <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                    {Object.entries(generatedPreview).map(([day, workout]) => (
                      <div key={day} className="bg-zinc-800/50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">{day}</h4>
                          <span className={`text-xs px-2 py-1 rounded ${workout.focus === 'Upper Body'
                            ? 'bg-orange-500/20 text-orange-400'
                            : workout.focus === 'Lower Body'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-blue-500/20 text-blue-400'
                            }`}>
                            {workout.focus}
                          </span>
                        </div>
                        {workout.exercises?.length > 0 ? (
                          <ul className="space-y-1">
                            {workout.exercises.map((ex, i) => (
                              <li key={i} className="text-sm text-zinc-400">
                                • {ex.name}: {ex.sets}×{ex.reps}
                                {ex.percentages && <span className="text-zinc-500"> @ {ex.percentages.join('/')}%</span>}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-sm text-zinc-500">Rest and recovery</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setGeneratedPreview(null)}
                    className="flex-1 py-4 rounded-xl bg-zinc-800 font-semibold hover:bg-zinc-700 transition-colors"
                  >
                    Regenerate
                  </button>
                  <button
                    onClick={confirmGeneratedWorkout}
                    className="flex-1 py-4 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    Add to Program
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )
      }

      {/* Main Content */}
      <main className="px-5 py-6">
        {activeTab === 'workout' && (
          <>
            {/* Week Selector with Real Dates */}
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setCurrentWeek(w => Math.max(1, w - 1))}
                className="w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center hover:bg-zinc-700 transition-colors disabled:opacity-30"
                disabled={currentWeek === 1}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center">
                <span className="text-xs font-semibold text-orange-500 uppercase tracking-wider">
                  {formatDate(weekDates.start)} - {formatDate(weekDates.end)}
                </span>
                <h2 className="text-2xl font-bold">Week {currentWeek}</h2>
                {currentWeek === 4 && (
                  <span className="text-xs text-green-400 font-medium">Current Week</span>
                )}
              </div>
              <button
                onClick={() => setCurrentWeek(w => w + 1)}
                className="w-10 h-10 rounded-xl bg-zinc-800/80 flex items-center justify-center hover:bg-zinc-700 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Day Selector */}
            <div className="flex gap-2 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-hide">
              {days.map((day, idx) => {
                const dayDate = new Date(weekDates.start);
                dayDate.setDate(dayDate.getDate() + idx);
                const isToday = currentWeek === 4 && day === ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

                return (
                  <button
                    key={day}
                    onClick={() => setCurrentDay(day)}
                    className={`flex-shrink-0 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${currentDay === day
                      ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg shadow-orange-500/25'
                      : isToday
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-700/60'
                      }`}
                  >
                    <div>{day.slice(0, 3)}</div>
                    <div className="text-xs opacity-70">{dayDate.getDate()}</div>
                  </button>
                );
              })}
            </div>

            {/* No Workout Programmed State */}
            {!hasWorkoutProgrammed && (
              <div className="mt-8 text-center py-12">
                <div className="relative w-32 h-32 mx-auto mb-6">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-28 h-28 rounded-full bg-gradient-to-br from-orange-500/20 to-purple-500/20 animate-pulse" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-6xl animate-bounce">🏋️</div>
                  </div>
                  <div className="absolute -top-2 -right-2 text-2xl animate-bounce" style={{ animationDelay: '0.1s' }}>❓</div>
                  <div className="absolute -bottom-1 -left-1 text-xl animate-bounce" style={{ animationDelay: '0.3s' }}>✨</div>
                  <div className="absolute top-0 left-0 text-lg animate-bounce" style={{ animationDelay: '0.2s' }}>💭</div>
                </div>

                <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-orange-400 to-purple-400 bg-clip-text text-transparent">
                  No Workout Planned Yet!
                </h3>
                <p className="text-zinc-400 max-w-sm mx-auto mb-6 leading-relaxed">
                  Week {currentWeek} is uncharted territory! Time to flex those planning muscles.
                  Use the AI Coach to generate a killer program for this week.
                </p>

                <div className="flex flex-col gap-3 max-w-xs mx-auto">
                  <button
                    onClick={() => openAiGenerator(currentWeek)}
                    disabled={viewingBuddy}
                    className={`py-4 px-6 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-500/25 ${viewingBuddy ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Brain className="w-5 h-5" />
                    Generate Week {currentWeek} with AI
                  </button>
                  <button
                    onClick={() => setCurrentWeek(4)}
                    className="py-3 px-6 rounded-xl bg-zinc-800 font-medium hover:bg-zinc-700 transition-colors text-zinc-300"
                  >
                    ← Back to Current Week
                  </button>
                </div>

                <div className="mt-8 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50 max-w-sm mx-auto">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Pro Tip</p>
                  <p className="text-sm text-zinc-400">
                    🎯 Your Week 4 lifts are looking strong! Keep the momentum going by planning ahead.
                  </p>
                </div>
              </div>
            )}

            {/* Today's Focus */}
            {hasWorkoutProgrammed && todayWorkout && (
              <div className="mt-6 mb-6">
                <div className={`rounded-2xl p-5 ${todayWorkout.focus === 'Rest Day'
                  ? 'bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20'
                  : todayWorkout.focus === 'Upper Body'
                    ? 'bg-gradient-to-br from-orange-500/10 to-yellow-500/10 border border-orange-500/20'
                    : 'bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20'
                  }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{currentDay}</span>
                      <h3 className="text-2xl font-bold mt-1">{todayWorkout.focus}</h3>
                      {todayWorkout.exercises?.length > 0 && (
                        <p className="text-sm text-zinc-400 mt-1">{todayWorkout.exercises.length} exercises</p>
                      )}
                    </div>
                    {todayWorkout.focus !== 'Rest Day' && (
                      <div className="relative w-16 h-16">
                        <svg className="w-16 h-16 transform -rotate-90">
                          <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="none" className="text-zinc-800" />
                          <circle
                            cx="32" cy="32" r="28" stroke="url(#gradient)" strokeWidth="4" fill="none"
                            strokeDasharray={`${getCompletionPercentage(currentWeek, currentDay, user.id) * 1.76} 176`}
                            strokeLinecap="round"
                          />
                          <defs>
                            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                              <stop offset="0%" stopColor="#f97316" />
                              <stop offset="100%" stopColor="#ef4444" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">
                          {getCompletionPercentage(currentWeek, currentDay, user.id)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Exercises */}
            {hasWorkoutProgrammed && (
              todayWorkout?.focus === 'Rest Day' ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                    <Clock className="w-10 h-10 text-blue-400" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">Recovery Day</h3>
                  <p className="text-zinc-400 max-w-xs mx-auto">
                    Rest, stretch, and prepare for tomorrow. Your muscles grow when you recover.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {todayWorkout?.exercises?.map((exercise, exIdx) => (
                    <div key={exIdx} className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 overflow-hidden">
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h4 className="font-bold text-lg leading-tight">{exercise.name}</h4>
                            <p className="text-sm text-zinc-400 mt-1">{exercise.muscleGroups}</p>
                          </div>
                          <div className="flex items-center gap-2 bg-zinc-800/80 px-3 py-1.5 rounded-lg">
                            <span className="text-sm font-semibold">{exercise.sets}×{exercise.reps}</span>
                          </div>
                        </div>

                        {exercise.note && (
                          <div className="mb-4 px-3 py-2 bg-zinc-800/40 rounded-lg">
                            <p className="text-xs text-zinc-400">{exercise.note}</p>
                          </div>
                        )}

                        <div className="space-y-2">
                          {Array.from({ length: exercise.sets }).map((_, setIdx) => {
                            const percentage = exercise.percentages?.[setIdx];
                            const weight = percentage ? calculateWeight(percentage, user?.maxes || {}, exercise.name) : null;
                            const logged = isSetLogged(exIdx, setIdx, user.id);

                            return (
                              <div
                                key={setIdx}
                                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${logged
                                  ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30'
                                  : 'bg-zinc-800/40 hover:bg-zinc-800/60'
                                  }`}
                              >
                                {viewingBuddy ? (
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${logged ? 'bg-green-500 text-white' : 'bg-zinc-700'}`}>
                                    {logged ? <Check className="w-5 h-5" /> : <span className="text-sm font-bold">{setIdx + 1}</span>}
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => logSet(exIdx, setIdx, { weight, reps: exercise.reps })}
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${logged
                                      ? 'bg-green-500 text-white'
                                      : 'bg-zinc-700 hover:bg-zinc-600'
                                      }`}
                                  >
                                    {logged ? <Check className="w-5 h-5" /> : <span className="text-sm font-bold">{setIdx + 1}</span>}
                                  </button>
                                )}

                                <div className="flex-1">
                                  <div className="flex items-baseline gap-2">
                                    {weight ? (
                                      <>
                                        <span className="text-lg font-bold">{weight} lbs</span>
                                        <span className="text-xs text-zinc-400">@ {percentage}% 1RM</span>
                                      </>
                                    ) : (
                                      <span className="text-zinc-400">Bodyweight / As prescribed</span>
                                    )}
                                  </div>
                                </div>
                                <span className="text-sm text-zinc-400 font-medium">{exercise.reps}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}

        {activeTab === 'maxes' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold mb-1">1 Rep Maxes</h2>
                <p className="text-zinc-400">Track your strength progress</p>
              </div>
              {!viewingBuddy && (
                <button
                  onClick={() => setShowAddLift(true)}
                  className="p-3 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 hover:opacity-90"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="space-y-3">
              {Object.entries(user?.maxes || {}).map(([lift, weight]) => (
                <div key={lift} className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 p-4">
                  <div className="flex items-center justify-between">
                    <div
                      className={`flex-1 cursor-pointer transition-colors ${selectedReferenceExercise === lift ? 'text-orange-500' : 'text-white'}`}
                      onClick={() => setSelectedReferenceExercise(lift)}
                    >
                      <h4 className="font-semibold flex items-center gap-2">
                        {lift}
                        {selectedReferenceExercise === lift && <CheckCircle className="w-4 h-4" />}
                      </h4>
                    </div>
                    {editingMax === lift ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={tempMaxValue}
                          onChange={(e) => setTempMaxValue(e.target.value)}
                          className="w-24 px-3 py-2 bg-zinc-800 rounded-lg text-right font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                          autoFocus
                        />
                        <button
                          onClick={() => updateMax(lift, tempMaxValue)}
                          className="w-10 h-10 rounded-lg bg-green-500 flex items-center justify-center hover:bg-green-400"
                        >
                          <Check className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setEditingMax(null)}
                          className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center hover:bg-zinc-600"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <span className="text-2xl font-bold">{weight}</span>
                          <span className="text-zinc-400 ml-1">lbs</span>
                        </div>
                        {!viewingBuddy && (
                          <>
                            <button
                              onClick={() => { setEditingMax(lift); setTempMaxValue(weight.toString()); }}
                              className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center hover:bg-zinc-700"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteLift(lift)}
                              className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center hover:bg-red-500/20 text-zinc-400 hover:text-red-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 p-5 bg-gradient-to-br from-orange-500/10 to-red-500/10 rounded-2xl border border-orange-500/20">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-orange-500" />
                Quick Reference ({selectedReferenceExercise})
              </h3>
              <div className="grid grid-cols-3 gap-3">
                {[65, 70, 75, 80, 85, 90].map(pct => (
                  <div key={pct} className="text-center p-3 bg-zinc-900/50 rounded-xl">
                    <p className="text-xs text-zinc-400 mb-1">{pct}%</p>
                    <p className="font-bold">{Math.round((user?.maxes?.[selectedReferenceExercise] || 0) * pct / 100 / 5) * 5}</p>
                    <p className="text-xs text-zinc-500">lbs</p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}



        {activeTab === 'progress' && (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Progress</h2>
              <p className="text-zinc-400">Track your gains over time</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 rounded-2xl p-5 border border-orange-500/20">
                <Flame className="w-8 h-8 text-orange-500 mb-3" />
                <p className="text-3xl font-bold">{getTotalCompletedSets(user.id)}</p>
                <p className="text-sm text-zinc-400">Sets Completed</p>
              </div>
              <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-2xl p-5 border border-green-500/20">
                <TrendingUp className="w-8 h-8 text-green-500 mb-3" />
                <p className="text-3xl font-bold">{Object.keys(workoutProgram).length}</p>
                <p className="text-sm text-zinc-400">Weeks Programmed</p>
              </div>
            </div>

            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800/50 p-5">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />
                Strength Levels
              </h3>
              <div className="space-y-4">
                {['Bench Press', 'Back Squat', 'Deadlift'].map(lift => (
                  <div key={lift}>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-zinc-400">{lift}</span>
                      <span className="font-semibold">{user?.maxes?.[lift] || 0} lbs</span>
                    </div>
                    <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-orange-500 to-red-500 rounded-full transition-all duration-500"
                        style={{ width: `${((user?.maxes?.[lift] || 0) / 400) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
              <div className="flex items-center gap-2 text-green-400">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">Progress auto-saved</span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">Your data persists between sessions</p>
            </div>
          </>
        )}
        {activeTab === 'buddies' && (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Gym Buddies</h2>
              <p className="text-zinc-400">Train together, grow together</p>
            </div>

            {/* Friend Requests */}
            {user.receivedRequests?.length > 0 && (
              <div className="mb-8">
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-orange-400">
                  <UserPlus className="w-5 h-5" />
                  Buddy Requests ({user.receivedRequests.length})
                </h3>
                <div className="space-y-3">
                  {user.receivedRequests.map((req) => {
                    const requester = profiles[req.from];
                    if (!requester) return null;
                    return (
                      <div key={req.from} className="bg-zinc-800/80 p-4 rounded-xl border border-orange-500/30 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-zinc-700 flex items-center justify-center text-xl">
                            {requester.avatar}
                          </div>
                          <div>
                            <p className="font-semibold">{requester.name}</p>
                            <p className="text-xs text-zinc-400">Wants to be buddies</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => acceptBuddyRequest(req.from)}
                            className="bg-green-500 hover:bg-green-600 text-white p-2 rounded-lg"
                          >
                            <Check className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => declineBuddyRequest(req.from)}
                            className="bg-zinc-700 hover:bg-zinc-600 text-white p-2 rounded-lg"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* My Buddies List */}
            <div className="mb-8">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-500" />
                My Buddies
              </h3>
              {user.buddies?.length > 0 ? (
                <div className="grid gap-3">
                  {user.buddies.map(buddyId => {
                    const buddy = profiles[buddyId];
                    if (!buddy) return null;
                    return (
                      <div key={buddyId} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl">
                            {buddy.avatar}
                          </div>
                          <div>
                            <p className="font-bold">{buddy.name}</p>
                            <p className="text-xs text-zinc-400">
                              Max Bench: {buddy.maxes['Bench Press'] || 0} lbs
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setViewingBuddy(buddyId); setActiveTab('workout'); }}
                            className="px-4 py-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 rounded-lg text-sm font-medium"
                          >
                            View Profile
                          </button>
                          <button
                            onClick={() => { if (confirm('Remove buddy?')) removeBuddy(buddyId); }}
                            className="p-2 text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 bg-zinc-900/30 rounded-xl border border-dashed border-zinc-800">
                  <p className="text-zinc-500 text-sm">You haven't added any gym buddies yet.</p>
                </div>
              )}
            </div>

            {/* Find Buddies */}
            <div className="bg-zinc-900/80 p-5 rounded-2xl border border-zinc-800">
              <h3 className="font-bold mb-4">Find Buddies</h3>
              <div className="relative mb-4">
                <input
                  type="text"
                  value={buddiesSearch}
                  onChange={(e) => setBuddiesSearch(e.target.value)}
                  placeholder="Search by name..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-10 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <Users className="w-5 h-5 text-zinc-500 absolute left-3 top-3.5" />
              </div>

              {buddiesSearch.trim() && (
                <div className="space-y-2">
                  {Object.values(profiles)
                    .filter(p =>
                      p.id !== currentUser &&
                      p.name.toLowerCase().includes(buddiesSearch.toLowerCase())
                    )
                    .map(p => {
                      const myProfile = profiles[currentUser] || {};
                      const isBuddy = myProfile.buddies?.includes(p.id);
                      const isPending = myProfile.sentRequests?.some(r => r.to === p.id);
                      const isIncoming = myProfile.receivedRequests?.some(r => r.from === p.id);

                      return (
                        <div key={p.id} className="flex items-center justify-between p-3 bg-zinc-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{p.avatar}</span>
                            <span className="font-medium">{p.name}</span>
                          </div>

                          {isBuddy ? (
                            <button
                              onClick={() => { setViewingBuddy(p.id); setActiveTab('workout'); }}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                            >
                              View Profile
                            </button>
                          ) : isPending ? (
                            <button disabled className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-700 text-zinc-400 cursor-not-allowed">
                              Request Sent
                            </button>
                          ) : isIncoming ? (
                            <button
                              onClick={() => acceptBuddyRequest(p.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500 text-white hover:bg-green-600"
                            >
                              Accept Request
                            </button>
                          ) : (
                            <button
                              onClick={() => sendBuddyRequest(p.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600"
                            >
                              Add Buddy
                            </button>
                          )}
                        </div>
                      );
                    })}
                  {Object.values(profiles).filter(p =>
                    p.id !== currentUser &&
                    p.name.toLowerCase().includes(buddiesSearch.toLowerCase())
                  ).length === 0 && (
                      <p className="text-center text-sm text-zinc-500 py-2">No users found.</p>
                    )}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Bottom Navigation */}
      < nav className="fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-800/50 px-6 py-3" >
        <div className="flex justify-around max-w-lg mx-auto">
          {[
            { id: 'workout', icon: Dumbbell, label: 'Workout' },
            { id: 'maxes', icon: Target, label: '1RM' },
            { id: 'buddies', icon: Users, label: 'Buddies' },
            { id: 'progress', icon: BarChart3, label: 'Progress' },
          ].map(tab => {
            // Check for notifications
            let notificationCount = 0;
            if (tab.id === 'buddies' && user) {
              const pendingRequests = user.receivedRequests?.length || 0;
              const acceptedNotifs = user.acceptedNotifications?.length || 0;
              notificationCount = pendingRequests + acceptedNotifs;
            }

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all relative ${activeTab === tab.id
                  ? 'text-orange-500'
                  : 'text-zinc-500 hover:text-zinc-300'
                  }`}
              >
                <div className="relative">
                  <tab.icon className="w-6 h-6" />
                  {notificationCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-zinc-900">
                      {notificationCount}
                    </span>
                  )}
                </div>
                <span className="text-xs font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav >
    </div >
  );
}
