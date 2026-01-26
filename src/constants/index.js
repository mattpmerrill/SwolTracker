// Default workout program data (used when no database or for demo)
export const defaultWorkoutProgram = {
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
export const defaultProfiles = {
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

export const defaultEquipment = [
  'Dumbbells', 'Barbells', 'Squat Rack', 'Bench', 'Incline Bench', 'Wall Balls',
  'Dip Bar', 'Pull-up Bar', 'Treadmill', 'Rower', 'Assault Bike', 'Bumper Plates',
  'Cable Machine', 'Sled', 'Kettlebells'
];

export const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const WEEK_DAYS_FROM_SUNDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
