import { Dumbbell, Heart, Flame, Scale, Wind } from 'lucide-react';

/**
 * Shared option lists for agent-native + simple onboarding.
 * Shared by SimpleOnboarding (manual path).
 */

export const LOADING_PHRASES = [
  { text: 'Calculating optimal gains...', emoji: '📊' },
  { text: 'Consulting the ancient scrolls of swole...', emoji: '📜' },
  { text: "Channeling Arnold's spirit...", emoji: '💪' },
  { text: 'Teaching AI to count reps...', emoji: '🤖' },
  { text: 'Warming up the algorithm...', emoji: '🔥' },
  { text: 'Mixing pre-workout for your phone...', emoji: '🧪' },
  { text: 'Leg day? More like EVERY day...', emoji: '🦵' },
  { text: "Finding exercises that don't skip leg day...", emoji: '🏋️' },
  { text: 'Calibrating pump levels...', emoji: '💉' },
  { text: 'Crunching numbers (not abs... yet)...', emoji: '🔢' },
  { text: 'Rare Pepe says: Gains are coming...', emoji: '🐸' },
  { text: 'Loading your future six-pack...', emoji: '🎁' },
  { text: 'Summoning the gym gods...', emoji: '⚡' },
  { text: "Your muscles don't know what's coming...", emoji: '😈' },
  { text: 'Preparing for beast mode activation...', emoji: '🦁' },
  { text: 'Converting pizza into protein math...', emoji: '🍕' },
  { text: 'Optimizing for maximum swoleness...', emoji: '📈' },
  { text: 'Teaching dumbbells to respect you...', emoji: '🙇' },
  { text: 'Building your gains blueprint...', emoji: '🏗️' },
  { text: 'No curls in the squat rack, promise...', emoji: '🤞' },
  { text: 'Downloading more biceps...', emoji: '⬇️' },
  { text: 'Buffering... like your future muscles...', emoji: '⏳' },
  { text: 'Asking ChatGPT to spot you...', emoji: '🤝' },
  { text: 'Remember: crying is cardio too...', emoji: '😭' },
  { text: "Calculating how sore you'll be...", emoji: '🩹' },
  { text: 'Finding the perfect pump playlist...', emoji: '🎵' },
  { text: 'Almost there... unlike your last PR...', emoji: '😏' },
  { text: 'Manifesting your summer body...', emoji: '🏖️' },
  { text: 'This is going to hurt so good...', emoji: '🥵' },
  { text: 'Feels good man... - Pepe', emoji: '🐸' },
];

export const FITNESS_GOALS = [
  { id: 'strength', label: 'Strength', icon: Dumbbell, color: 'orange' },
  { id: 'cardio', label: 'Cardio', icon: Heart, color: 'red' },
  { id: 'fat_burn', label: 'Fat Burn', icon: Flame, color: 'yellow' },
  { id: 'weight_loss', label: 'Weight Loss', icon: Scale, color: 'green' },
  { id: 'flexibility', label: 'Flexibility', icon: Wind, color: 'purple' },
];

export const DAYS_OF_WEEK = [
  { id: 'Monday', label: 'Mon' },
  { id: 'Tuesday', label: 'Tue' },
  { id: 'Wednesday', label: 'Wed' },
  { id: 'Thursday', label: 'Thu' },
  { id: 'Friday', label: 'Fri' },
  { id: 'Saturday', label: 'Sat' },
  { id: 'Sunday', label: 'Sun' },
];

export const DURATIONS = [
  { id: '15 min', label: '15 min', desc: 'Quick & Intense' },
  { id: '30 min', label: '30 min', desc: 'Short & Effective' },
  { id: '45 min', label: '45 min', desc: 'Balanced Session' },
  { id: '1 hour', label: '1 hour', desc: 'Full Workout' },
  { id: '1+ hour', label: '1+ hour', desc: 'Extended Training' },
];

export const EQUIPMENT = [
  { id: 'Barbell', label: 'Barbell' },
  { id: 'Dumbbells', label: 'Dumbbells' },
  { id: 'Bumper Plates', label: 'Bumper Plates' },
  { id: 'Bench', label: 'Bench' },
  { id: 'Squat Rack', label: 'Squat Rack' },
  { id: 'Wall Balls', label: 'Wall Balls' },
  { id: 'Kettlebells', label: 'Kettlebells' },
  { id: 'Pull-Up Bar', label: 'Pull-Up Bar' },
  { id: 'Treadmill', label: 'Treadmill' },
  { id: 'Rower', label: 'Rower' },
  { id: 'Assault Bike', label: 'Assault Bike' },
  { id: 'Sled', label: 'Sled' },
  { id: 'Weight Machines', label: 'Machines' },
];
