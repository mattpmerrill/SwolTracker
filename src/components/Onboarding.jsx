import { useState, useEffect } from 'react';
import {
  Dumbbell, User, Heart, Flame, Scale, Wind, Target,
  Calendar, Clock, Home, Building2, ChevronRight, ChevronLeft,
  Sparkles, Check, Loader2, AlertCircle, RotateCcw
} from 'lucide-react';
import confetti from 'canvas-confetti';

// Fun motivational phrases to show while generating workout
const LOADING_PHRASES = [
  { text: "Calculating optimal gains...", emoji: "📊" },
  { text: "Consulting the ancient scrolls of swole...", emoji: "📜" },
  { text: "Channeling Arnold's spirit...", emoji: "💪" },
  { text: "Teaching AI to count reps...", emoji: "🤖" },
  { text: "Warming up the algorithm...", emoji: "🔥" },
  { text: "Mixing pre-workout for your phone...", emoji: "🧪" },
  { text: "Leg day? More like EVERY day...", emoji: "🦵" },
  { text: "Finding exercises that don't skip leg day...", emoji: "🏋️" },
  { text: "Calibrating pump levels...", emoji: "💉" },
  { text: "Crunching numbers (not abs... yet)...", emoji: "🔢" },
  { text: "Rare Pepe says: Gains are coming...", emoji: "🐸" },
  { text: "Loading your future six-pack...", emoji: "🎁" },
  { text: "Summoning the gym gods...", emoji: "⚡" },
  { text: "Your muscles don't know what's coming...", emoji: "😈" },
  { text: "Preparing for beast mode activation...", emoji: "🦁" },
  { text: "Converting pizza into protein math...", emoji: "🍕" },
  { text: "Optimizing for maximum swoleness...", emoji: "📈" },
  { text: "Teaching dumbbells to respect you...", emoji: "🙇" },
  { text: "Building your gains blueprint...", emoji: "🏗️" },
  { text: "No curls in the squat rack, promise...", emoji: "🤞" },
  { text: "Downloading more biceps...", emoji: "⬇️" },
  { text: "Buffering... like your future muscles...", emoji: "⏳" },
  { text: "Asking ChatGPT to spot you...", emoji: "🤝" },
  { text: "Remember: crying is cardio too...", emoji: "😭" },
  { text: "Calculating how sore you'll be...", emoji: "🩹" },
  { text: "Finding the perfect pump playlist...", emoji: "🎵" },
  { text: "Almost there... unlike your last PR...", emoji: "😏" },
  { text: "Manifesting your summer body...", emoji: "🏖️" },
  { text: "This is going to hurt so good...", emoji: "🥵" },
  { text: "Feels good man... - Pepe", emoji: "🐸" },
];

const STEPS = [
  'welcome',
  'name',
  'gender',
  'age',
  'weight',
  'goals',
  'days',
  'duration',
  'equipment',
  'location',
  'startDate',
  'generating'
];

const FITNESS_GOALS = [
  { id: 'strength', label: 'Strength', icon: Dumbbell, color: 'orange' },
  { id: 'cardio', label: 'Cardio', icon: Heart, color: 'red' },
  { id: 'fat_burn', label: 'Fat Burn', icon: Flame, color: 'yellow' },
  { id: 'weight_loss', label: 'Weight Loss', icon: Scale, color: 'green' },
  { id: 'flexibility', label: 'Flexibility', icon: Wind, color: 'purple' },
];

const DAYS_OF_WEEK = [
  { id: 'Monday', label: 'Mon' },
  { id: 'Tuesday', label: 'Tue' },
  { id: 'Wednesday', label: 'Wed' },
  { id: 'Thursday', label: 'Thu' },
  { id: 'Friday', label: 'Fri' },
  { id: 'Saturday', label: 'Sat' },
  { id: 'Sunday', label: 'Sun' },
];

const DURATIONS = [
  { id: '15 min', label: '15 min', desc: 'Quick & Intense' },
  { id: '30 min', label: '30 min', desc: 'Short & Effective' },
  { id: '45 min', label: '45 min', desc: 'Balanced Session' },
  { id: '1 hour', label: '1 hour', desc: 'Full Workout' },
  { id: '1+ hour', label: '1+ hour', desc: 'Extended Training' },
];

const EQUIPMENT = [
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

export default function Onboarding({ user, onComplete, onGenerateWorkout }) {
  const [step, setStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationFailed, setGenerationFailed] = useState(false);
  const [generationProgress, setGenerationProgress] = useState('');
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);

  // Rotate through fun loading phrases while generating
  useEffect(() => {
    if (!isGenerating) return;

    // Start with a random phrase
    setLoadingPhraseIndex(Math.floor(Math.random() * LOADING_PHRASES.length));

    const interval = setInterval(() => {
      setLoadingPhraseIndex(prev => (prev + 1) % LOADING_PHRASES.length);
    }, 2500); // Change phrase every 2.5 seconds

    return () => clearInterval(interval);
  }, [isGenerating]);

  // Form data
  const [displayName, setDisplayName] = useState(user?.name || user?.email?.split('@')[0] || '');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState(30);
  const [weight, setWeight] = useState(150);
  const [fitnessGoals, setFitnessGoals] = useState([]);
  const [workoutDays, setWorkoutDays] = useState([]);
  const [workoutDuration, setWorkoutDuration] = useState('');
  const [equipment, setEquipment] = useState([]);
  const [workoutLocation, setWorkoutLocation] = useState('');
  const [programStartDate, setProgramStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const currentStep = STEPS[step];

  const canProceed = () => {
    switch (currentStep) {
      case 'welcome': return true;
      case 'name': return displayName.trim().length > 0;
      case 'gender': return gender !== '';
      case 'age': return age > 0;
      case 'weight': return weight > 0;
      case 'goals': return fitnessGoals.length > 0;
      case 'days': return workoutDays.length > 0;
      case 'duration': return workoutDuration !== '';
      case 'equipment': return equipment.length > 0;
      case 'location': return workoutLocation !== '';
      case 'startDate': return programStartDate !== '';
      default: return false;
    }
  };

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      if (STEPS[step + 1] === 'generating') {
        // Start generation process
        setStep(step + 1);
        await handleGenerateWorkout();
      } else {
        setStep(step + 1);
      }
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const toggleGoal = (goalId) => {
    setFitnessGoals(prev =>
      prev.includes(goalId)
        ? prev.filter(g => g !== goalId)
        : [...prev, goalId]
    );
  };

  const toggleDay = (dayId) => {
    setWorkoutDays(prev =>
      prev.includes(dayId)
        ? prev.filter(d => d !== dayId)
        : [...prev, dayId]
    );
  };

  const toggleEquipment = (equipId) => {
    setEquipment(prev =>
      prev.includes(equipId)
        ? prev.filter(e => e !== equipId)
        : [...prev, equipId]
    );
  };

  const handleGenerateWorkout = async () => {
    setIsGenerating(true);
    setGenerationFailed(false);
    setGenerationProgress('Saving your profile...');

    try {
      // Compile onboarding data
      const onboardingData = {
        displayName,
        gender,
        age,
        weightLbs: weight,
        fitnessGoals,
        workoutDays,
        workoutDuration,
        workoutLocation,
        equipment,
        programStartDate
      };

      setGenerationProgress('Creating your personalized workout plan...');

      // Call the parent's generate function
      const success = await onGenerateWorkout(onboardingData);

      if (success) {
        setIsGenerating(false);
        setGenerationProgress('Your workout plan is ready!');

        // Celebration!
        confetti({
          particleCount: 200,
          spread: 100,
          origin: { y: 0.6 }
        });

        setTimeout(() => {
          confetti({
            particleCount: 100,
            angle: 60,
            spread: 55,
            origin: { x: 0 }
          });
          confetti({
            particleCount: 100,
            angle: 120,
            spread: 55,
            origin: { x: 1 }
          });
        }, 250);

        // Complete onboarding after a moment
        setTimeout(() => {
          onComplete();
        }, 2500);
      } else {
        setGenerationProgress('There was an issue generating your workout. Please try again.');
        setIsGenerating(false);
        setGenerationFailed(true);
      }
    } catch (error) {
      console.error('Error during onboarding:', error);
      setGenerationProgress('Something went wrong. Please try again.');
      setIsGenerating(false);
      setGenerationFailed(true);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="w-24 h-24 bg-zinc-800/50 backdrop-blur-sm rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-orange-500/10 ring-1 ring-white/10">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-3xl" />
              <Dumbbell className="w-12 h-12 text-orange-500 relative z-10" />
            </div>
            <h1 className="text-5xl font-black mb-6 tracking-tight text-white drop-shadow-sm">
              Welcome to <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">SwolTracker</span>
            </h1>
            <p className="text-xl text-zinc-300 mb-8 leading-relaxed max-w-lg mx-auto">
              Congratulations on taking the first step to getting <span className="text-orange-400 font-bold">SWOL</span>!
            </p>
            <div className="p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50 max-w-md mx-auto backdrop-blur-sm">
              <p className="text-zinc-400 text-sm">
                Let's set up your profile and create a personalized workout plan that will help you crush your fitness goals.
              </p>
            </div>
          </div>
        );

      case 'name':
        return (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-blue-500/20">
              <User className="w-8 h-8 text-blue-400" />
            </div>
            <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">What should we call you?</h2>
            <p className="text-zinc-400 mb-8 text-lg">This will be your display name in the app</p>
            <div className="relative max-w-sm mx-auto group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl opacity-20 group-focus-within:opacity-100 transition duration-500 blur"></div>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name"
                className="relative w-full bg-zinc-900 border border-zinc-700/50 rounded-2xl py-5 px-6 text-center text-2xl font-bold outline-none text-white placeholder-zinc-700 focus:text-white transition-all shadow-xl"
                autoFocus
              />
            </div>
          </div>
        );

      case 'gender':
        return (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">What's your gender?</h2>
            <p className="text-zinc-400 mb-8 text-lg">This helps us customize your workouts</p>
            <div className="flex gap-4 justify-center max-w-md mx-auto">
              <button
                onClick={() => setGender('male')}
                className={`flex-1 p-8 rounded-3xl border transition-all duration-300 relative group overflow-hidden ${gender === 'male'
                  ? 'bg-blue-500/10 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/20'
                  : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                  }`}
              >
                <div className={`absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${gender === 'male' ? 'opacity-100' : ''}`} />
                <div className="text-6xl mb-4 transform group-hover:scale-110 transition-transform duration-300">👨</div>
                <p className="font-bold text-xl relative z-10">Male</p>
              </button>
              <button
                onClick={() => setGender('female')}
                className={`flex-1 p-8 rounded-3xl border transition-all duration-300 relative group overflow-hidden ${gender === 'female'
                  ? 'bg-pink-500/10 border-pink-500/50 text-pink-400 shadow-lg shadow-pink-500/20'
                  : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                  }`}
              >
                <div className={`absolute inset-0 bg-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${gender === 'female' ? 'opacity-100' : ''}`} />
                <div className="text-6xl mb-4 transform group-hover:scale-110 transition-transform duration-300">👩</div>
                <p className="font-bold text-xl relative z-10">Female</p>
              </button>
            </div>
          </div>
        );

      case 'age':
        return (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">How old are you?</h2>
            <p className="text-zinc-400 mb-8 text-lg">We'll adjust intensity based on your age</p>
            <div className="flex items-center justify-center gap-8">
              <button
                onClick={() => setAge(Math.max(13, age - 1))}
                className="w-16 h-16 bg-zinc-800/50 hover:bg-zinc-700 hover:scale-105 rounded-2xl text-3xl font-bold transition-all border border-zinc-700/50 flex items-center justify-center"
              >
                -
              </button>
              <div className="w-40 text-center">
                <div className="text-7xl font-black text-white tracking-tighter drop-shadow-lg">{age}</div>
                <div className="text-zinc-500 text-base font-medium mt-2">years old</div>
              </div>
              <button
                onClick={() => setAge(Math.min(99, age + 1))}
                className="w-16 h-16 bg-zinc-800/50 hover:bg-zinc-700 hover:scale-105 rounded-2xl text-3xl font-bold transition-all border border-zinc-700/50 flex items-center justify-center"
              >
                +
              </button>
            </div>
            <div className="max-w-sm mx-auto mt-10 px-4">
              <input
                type="range"
                min="13"
                max="99"
                value={age}
                onChange={(e) => setAge(parseInt(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-400 transition-all"
              />
            </div>
          </div>
        );

      case 'weight':
        return (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-green-500/20">
              <Scale className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">What's your current weight?</h2>
            <p className="text-zinc-400 mb-8 text-lg">We'll use this to calculate your workout weights</p>
            <div className="flex items-center justify-center gap-8">
              <button
                onClick={() => setWeight(Math.max(50, weight - 5))}
                className="w-16 h-16 bg-zinc-800/50 hover:bg-zinc-700 hover:scale-105 rounded-2xl text-3xl font-bold transition-all border border-zinc-700/50 flex items-center justify-center"
              >
                -
              </button>
              <div className="w-48 text-center">
                <div className="text-7xl font-black text-white tracking-tighter drop-shadow-lg">{weight}</div>
                <div className="text-zinc-500 text-base font-medium mt-2">pounds</div>
              </div>
              <button
                onClick={() => setWeight(Math.min(500, weight + 5))}
                className="w-16 h-16 bg-zinc-800/50 hover:bg-zinc-700 hover:scale-105 rounded-2xl text-3xl font-bold transition-all border border-zinc-700/50 flex items-center justify-center"
              >
                +
              </button>
            </div>
            <div className="max-w-sm mx-auto mt-10 px-4">
              <input
                type="range"
                min="50"
                max="400"
                step="5"
                value={weight}
                onChange={(e) => setWeight(parseInt(e.target.value))}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500 hover:accent-green-400 transition-all"
              />
            </div>
          </div>
        );

      case 'goals':
        return (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-orange-500/20">
              <Target className="w-8 h-8 text-orange-400" />
            </div>
            <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">What are your fitness goals?</h2>
            <p className="text-zinc-400 mb-8 text-lg">Select all that apply</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
              {FITNESS_GOALS.map(goal => {
                const Icon = goal.icon;
                const isSelected = fitnessGoals.includes(goal.id);
                const colorClasses = {
                  orange: isSelected ? 'bg-orange-500/10 border-orange-500/50 text-orange-400 ring-2 ring-orange-500/20' : '',
                  red: isSelected ? 'bg-red-500/10 border-red-500/50 text-red-400 ring-2 ring-red-500/20' : '',
                  yellow: isSelected ? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400 ring-2 ring-yellow-500/20' : '',
                  green: isSelected ? 'bg-green-500/10 border-green-500/50 text-green-400 ring-2 ring-green-500/20' : '',
                  purple: isSelected ? 'bg-purple-500/10 border-purple-500/50 text-purple-400 ring-2 ring-purple-500/20' : '',
                };
                return (
                  <button
                    key={goal.id}
                    onClick={() => toggleGoal(goal.id)}
                    className={`p-6 rounded-3xl border transition-all duration-300 relative group overflow-hidden ${isSelected
                      ? colorClasses[goal.color]
                      : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                      }`}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${isSelected ? 'opacity-100' : ''}`} />
                    <Icon className={`w-10 h-10 mx-auto mb-3 transition-colors duration-300 ${isSelected ? '' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
                    <p className={`font-bold relative z-10 ${isSelected ? '' : 'text-zinc-400 group-hover:text-zinc-200'}`}>{goal.label}</p>
                    {isSelected && (
                      <div className="absolute top-3 right-3 animate-in fade-in zoom-in duration-300">
                        <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-black" strokeWidth={4} />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 'days':
        return (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-blue-500/20">
              <Calendar className="w-8 h-8 text-blue-400" />
            </div>
            <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">Which days will you workout?</h2>
            <p className="text-zinc-400 mb-8 text-lg">Select your preferred training days</p>
            <div className="flex flex-wrap justify-center gap-4 max-w-md mx-auto">
              {DAYS_OF_WEEK.map(day => {
                const isSelected = workoutDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    onClick={() => toggleDay(day.id)}
                    className={`w-16 h-16 rounded-2xl border transition-all font-bold text-lg ${isSelected
                      ? 'bg-blue-500 shadow-lg shadow-blue-500/30 text-white border-blue-400 scale-105'
                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white hover:bg-zinc-800'
                      }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <div className="mt-8 flex items-center justify-center gap-2 text-zinc-500">
              <span className={`text-2xl font-bold transition-all ${workoutDays.length > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
                {workoutDays.length}
              </span>
              <span>day{workoutDays.length !== 1 ? 's' : ''} selected</span>
            </div>
          </div>
        );

      case 'duration':
        return (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-purple-500/20">
              <Clock className="w-8 h-8 text-purple-400" />
            </div>
            <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">How long do you want to workout?</h2>
            <p className="text-zinc-400 mb-8 text-lg">We'll design workouts that fit your schedule</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg mx-auto">
              {DURATIONS.map(dur => {
                const isSelected = workoutDuration === dur.id;
                return (
                  <button
                    key={dur.id}
                    onClick={() => setWorkoutDuration(dur.id)}
                    className={`p-6 rounded-3xl border text-left transition-all ${isSelected
                      ? 'bg-purple-500/10 border-purple-500/50 ring-2 ring-purple-500/20'
                      : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/50'
                      }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <p className={`font-bold text-xl ${isSelected ? 'text-purple-400' : 'text-white'}`}>{dur.label}</p>
                      {isSelected && <Check className="w-5 h-5 text-purple-400" />}
                    </div>
                    <p className={`text-sm ${isSelected ? 'text-purple-300/70' : 'text-zinc-500'}`}>{dur.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 'equipment':
        return (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-orange-500/20">
              <Dumbbell className="w-8 h-8 text-orange-400" />
            </div>
            <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">What equipment do you have?</h2>
            <p className="text-zinc-400 mb-8 text-lg">Select all equipment you have access to</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-lg mx-auto">
              {EQUIPMENT.map(eq => {
                const isSelected = equipment.includes(eq.id);
                return (
                  <button
                    key={eq.id}
                    onClick={() => toggleEquipment(eq.id)}
                    className={`p-4 rounded-2xl border transition-all text-sm font-medium relative overflow-hidden group ${isSelected
                      ? 'bg-orange-500/10 border-orange-500/50 text-orange-400 shadow-lg shadow-orange-500/10'
                      : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                      }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      {isSelected && <Check className="w-4 h-4" />}
                      <p>{eq.label}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-zinc-500 mt-6 font-medium">
              {equipment.length} item{equipment.length !== 1 ? 's' : ''} selected
            </p>
          </div>
        );

      case 'location':
        return (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">Where will you workout?</h2>
            <p className="text-zinc-400 mb-8 text-lg">This helps us tailor your workouts</p>
            <div className="flex gap-6 justify-center max-w-md mx-auto">
              <button
                onClick={() => setWorkoutLocation('home')}
                className={`flex-1 p-8 rounded-3xl border transition-all duration-300 group ${workoutLocation === 'home'
                  ? 'bg-green-500/10 border-green-500/50 text-green-400 shadow-xl shadow-green-500/10 ring-2 ring-green-500/20'
                  : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800/50'
                  }`}
              >
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-zinc-900 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Home className={`w-10 h-10 ${workoutLocation === 'home' ? 'text-green-400' : 'text-zinc-500'}`} />
                </div>
                <p className="font-bold text-xl mb-1">Home</p>
                <p className="text-xs text-zinc-500 font-medium">Home gym setup</p>
              </button>
              <button
                onClick={() => setWorkoutLocation('gym')}
                className={`flex-1 p-8 rounded-3xl border transition-all duration-300 group ${workoutLocation === 'gym'
                  ? 'bg-blue-500/10 border-blue-500/50 text-blue-400 shadow-xl shadow-blue-500/10 ring-2 ring-blue-500/20'
                  : 'bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800/50'
                  }`}
              >
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-zinc-900 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Building2 className={`w-10 h-10 ${workoutLocation === 'gym' ? 'text-blue-400' : 'text-zinc-500'}`} />
                </div>
                <p className="font-bold text-xl mb-1">Gym</p>
                <p className="text-xs text-zinc-500 font-medium">Commercial gym</p>
              </button>
            </div>
          </div>
        );

      case 'startDate':
        const today = new Date().toISOString().split('T')[0];
        const selectedDate = new Date(programStartDate);
        const formattedDate = selectedDate.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        });
        return (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 ring-1 ring-emerald-500/20">
              <Calendar className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-3xl font-bold mb-3 tracking-tight text-white">When do you want to start?</h2>
            <p className="text-zinc-400 mb-8 text-lg">Choose the first day of your 4-week program</p>

            <div className="max-w-sm mx-auto">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl opacity-20 group-focus-within:opacity-100 transition duration-500 blur"></div>
                <input
                  type="date"
                  value={programStartDate}
                  min={today}
                  onChange={(e) => setProgramStartDate(e.target.value)}
                  className="relative w-full bg-zinc-900 border border-zinc-700/50 rounded-2xl py-5 px-6 text-center text-xl font-bold outline-none text-white focus:border-emerald-500/50 transition-all shadow-xl cursor-pointer [color-scheme:dark]"
                />
              </div>

              <div className="mt-6 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
                <p className="text-emerald-400 font-semibold text-lg">{formattedDate}</p>
                <p className="text-zinc-500 text-sm mt-1">Week 1 begins on this day</p>
              </div>

              <div className="mt-6 flex gap-3 justify-center">
                <button
                  onClick={() => setProgramStartDate(today)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    programStartDate === today
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:border-zinc-600'
                  }`}
                >
                  Today
                </button>
                <button
                  onClick={() => {
                    const nextMonday = new Date();
                    nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
                    setProgramStartDate(nextMonday.toISOString().split('T')[0]);
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    new Date(programStartDate).getDay() === 1 && programStartDate !== today
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-zinc-800/50 text-zinc-400 border border-zinc-700/50 hover:border-zinc-600'
                  }`}
                >
                  Next Monday
                </button>
              </div>
            </div>
          </div>
        );

      case 'generating':
        const currentPhrase = LOADING_PHRASES[loadingPhraseIndex];
        return (
          <div className="text-center animate-in fade-in zoom-in duration-500">
            <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl ${
              generationFailed
                ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-500/30'
                : 'bg-gradient-to-br from-orange-500 to-purple-600 shadow-orange-500/30 animate-pulse-slow'
            }`}>
              {isGenerating ? (
                <Loader2 className="w-12 h-12 text-white animate-spin" />
              ) : generationFailed ? (
                <AlertCircle className="w-12 h-12 text-white" />
              ) : (
                <Sparkles className="w-12 h-12 text-white" />
              )}
            </div>
            <h2 className={`text-4xl font-black mb-6 tracking-tight ${
              generationFailed
                ? 'text-red-400'
                : 'bg-gradient-to-r from-orange-400 via-pink-500 to-purple-500 bg-clip-text text-transparent'
            }`}>
              {isGenerating ? 'Creating Your Plan' : generationFailed ? 'Oops!' : 'All Done!'}
            </h2>
            <p className="text-xl text-zinc-300 mb-8 font-medium">{generationProgress}</p>
            {isGenerating ? (
              <div className="max-w-sm mx-auto">
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 rounded-full animate-progress" style={{ width: '100%' }} />
                </div>

                {/* Fun rotating phrases */}
                <div className="mt-8 p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50 min-h-[80px] flex items-center justify-center">
                  <div
                    key={loadingPhraseIndex}
                    className="animate-in fade-in slide-in-from-bottom-2 duration-500"
                  >
                    <span className="text-3xl mb-2 block">{currentPhrase.emoji}</span>
                    <p className="text-zinc-300 font-medium">{currentPhrase.text}</p>
                  </div>
                </div>

                <p className="text-xs text-zinc-600 mt-4">
                  Your AI Coach is crafting a personalized 4-week program
                </p>
              </div>
            ) : generationFailed ? (
              <div className="max-w-sm mx-auto mt-8">
                <button
                  onClick={handleGenerateWorkout}
                  className="w-full flex items-center justify-center gap-2 px-8 py-4 rounded-2xl font-bold text-lg bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 transition-all"
                >
                  <RotateCcw className="w-5 h-5" />
                  Try Again
                </button>
                <p className="text-zinc-500 text-xs mt-4">
                  If this keeps happening, please contact support
                </p>
              </div>
            ) : (
              <div className="max-w-sm mx-auto mt-8">
                <p className="text-zinc-400 text-sm mb-4">
                  Redirecting you to your workouts...
                </p>
                <button
                  onClick={onComplete}
                  className="w-full px-8 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white shadow-xl shadow-orange-500/20 hover:shadow-orange-500/40 transition-all"
                >
                  Start Your Journey
                </button>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col relative overflow-hidden font-sans">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent opacity-50" />
        <div className="absolute bottom-0 left-0 w-full h-full bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent opacity-50" />
      </div>

      {/* Progress bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-zinc-900 z-50">
        <div
          className="h-full bg-gradient-to-r from-orange-500 via-red-500 to-purple-600 transition-all duration-700 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Header */}
      <div className="relative z-10 pt-10 px-6 flex justify-between items-center max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
            <Dumbbell className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">SwolTracker</span>
        </div>
        {currentStep !== 'welcome' && currentStep !== 'generating' && (
          <div className="text-sm font-medium text-zinc-500 bg-zinc-900/50 px-4 py-2 rounded-full backdrop-blur-sm border border-zinc-800">
            Step {step} of {STEPS.length - 2}
          </div>
        )}
      </div>


      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10 my-8">
        <div className="w-full max-w-3xl">
          <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800/50 shadow-2xl rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden">
            {/* Decorative glow inside card */}
            <div className="absolute -top-32 -left-32 w-64 h-64 bg-orange-500/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />

            <div className="relative z-10 min-h-[400px] flex flex-col items-center justify-between">
              <div className="w-full">
                {renderStep()}
              </div>

              {/* Navigation buttons */}
              {currentStep !== 'generating' && (
                <div className="flex justify-between w-full mt-12">
                  <button
                    onClick={handleBack}
                    className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-semibold transition-all duration-300 ${step === 0
                        ? 'opacity-0 pointer-events-none'
                        : 'bg-zinc-900/50 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700'
                      }`}
                  >
                    <ChevronLeft className="w-5 h-5" />
                    <span className="text-lg">Back</span>
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={!canProceed()}
                    className={`flex items-center gap-3 px-10 py-4 rounded-2xl font-bold text-lg transition-all duration-300 shadow-xl ${canProceed()
                        ? 'bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white shadow-orange-500/20 hover:shadow-orange-500/40 hover:-translate-y-1'
                        : 'bg-zinc-800 text-zinc-600 cursor-not-allowed border border-zinc-800'
                      }`}
                  >
                    {step === STEPS.length - 2 ? 'Generate Plan' : 'Continue'}
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
