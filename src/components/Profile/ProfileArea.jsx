import { useState, useRef } from 'react';
import {
  ArrowLeft, User, Target, Calendar, LogOut, Camera, X, Check,
  Dumbbell, Heart, Flame, Scale, Wind, Home, Building2, Clock
} from 'lucide-react';
import AvatarDisplay from './AvatarDisplay';

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
  { id: '15 min', label: '15 min' },
  { id: '30 min', label: '30 min' },
  { id: '45 min', label: '45 min' },
  { id: '1 hour', label: '1 hour' },
  { id: '1+ hour', label: '1+ hour' },
];

const avatarOptions = ['💪', '🔥', '⚡', '🏋️', '💥', '🦾', '🎯', '🚀', '⭐', '🏆'];

const ProfileArea = ({
  user,
  authUser,
  onClose,
  onUpdateProfile,
  onLogout,
  onUploadAvatar,
  equipment = [],
  programStartDate,
  actualCurrentWeek,
  demoMode = false
}) => {
  const [activeSection, setActiveSection] = useState('info');
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const fileInputRef = useRef(null);

  const tabs = [
    { id: 'info', label: 'Personal', icon: User },
    { id: 'fitness', label: 'Fitness', icon: Target },
    { id: 'program', label: 'Program', icon: Calendar },
  ];

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !onUploadAvatar) return;

    setUploading(true);
    try {
      await onUploadAvatar(file);
      setShowAvatarPicker(false);
    } catch (error) {
      console.error('Error uploading avatar:', error);
    } finally {
      setUploading(false);
    }
  };

  const handleEmojiSelect = async (emoji) => {
    await onUpdateProfile({ avatar: emoji, avatar_url: null });
    setShowAvatarPicker(false);
  };

  const startEditing = (field, value) => {
    setEditingField(field);
    setEditValue(value?.toString() || '');
  };

  const saveField = async (field) => {
    if (editValue === '') {
      setEditingField(null);
      return;
    }

    let value = editValue;
    if (field === 'age' || field === 'weight_lbs') {
      value = parseFloat(editValue);
      if (isNaN(value)) {
        setEditingField(null);
        return;
      }
    }

    await onUpdateProfile({ [field]: value });
    setEditingField(null);
  };

  const toggleGoal = async (goalId) => {
    const currentGoals = user?.fitness_goals || [];
    const newGoals = currentGoals.includes(goalId)
      ? currentGoals.filter(g => g !== goalId)
      : [...currentGoals, goalId];
    await onUpdateProfile({ fitness_goals: newGoals });
  };

  const toggleDay = async (dayId) => {
    const currentDays = user?.workout_days || [];
    const newDays = currentDays.includes(dayId)
      ? currentDays.filter(d => d !== dayId)
      : [...currentDays, dayId];
    await onUpdateProfile({ workout_days: newDays });
  };

  const renderPersonalInfo = () => (
    <div className="space-y-6">
      {/* Display Name */}
      <div className="bg-zinc-800/50 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Display Name</p>
            {editingField === 'display_name' ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="bg-zinc-700 px-3 py-2 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                  autoFocus
                />
                <button
                  onClick={() => saveField('display_name')}
                  className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setEditingField(null)}
                  className="p-2 bg-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <p className="text-lg font-semibold text-white">{user?.display_name || user?.name || 'Not set'}</p>
            )}
          </div>
          {editingField !== 'display_name' && (
            <button
              onClick={() => startEditing('display_name', user?.display_name || user?.name)}
              className="text-xs text-orange-400 hover:text-orange-300"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Email (read-only) */}
      <div className="bg-zinc-800/50 rounded-2xl p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Email</p>
        <p className="text-lg font-semibold text-white">{authUser?.email || user?.email || 'Not available'}</p>
        <p className="text-xs text-zinc-500 mt-1">Email cannot be changed</p>
      </div>

      {/* Age & Weight Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Age */}
        <div className="bg-zinc-800/50 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Age</p>
              {editingField === 'age' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="bg-zinc-700 px-3 py-2 rounded-lg text-white w-20 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    autoFocus
                  />
                  <button
                    onClick={() => saveField('age')}
                    className="p-2 bg-green-500/20 text-green-400 rounded-lg"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <p className="text-lg font-semibold text-white">{user?.age || 'Not set'}</p>
              )}
            </div>
            {editingField !== 'age' && (
              <button
                onClick={() => startEditing('age', user?.age)}
                className="text-xs text-orange-400"
              >
                Edit
              </button>
            )}
          </div>
        </div>

        {/* Weight */}
        <div className="bg-zinc-800/50 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Weight</p>
              {editingField === 'weight_lbs' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="bg-zinc-700 px-3 py-2 rounded-lg text-white w-20 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    autoFocus
                  />
                  <button
                    onClick={() => saveField('weight_lbs')}
                    className="p-2 bg-green-500/20 text-green-400 rounded-lg"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <p className="text-lg font-semibold text-white">
                  {user?.weight_lbs ? `${user.weight_lbs} lbs` : 'Not set'}
                </p>
              )}
            </div>
            {editingField !== 'weight_lbs' && (
              <button
                onClick={() => startEditing('weight_lbs', user?.weight_lbs)}
                className="text-xs text-orange-400"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Gender */}
      <div className="bg-zinc-800/50 rounded-2xl p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Gender</p>
        <div className="flex gap-3">
          <button
            onClick={() => onUpdateProfile({ gender: 'male' })}
            className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
              user?.gender === 'male'
                ? 'bg-blue-500/20 border-2 border-blue-500/50 text-blue-400'
                : 'bg-zinc-700/50 border-2 border-transparent text-zinc-400 hover:border-zinc-600'
            }`}
          >
            Male
          </button>
          <button
            onClick={() => onUpdateProfile({ gender: 'female' })}
            className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all ${
              user?.gender === 'female'
                ? 'bg-pink-500/20 border-2 border-pink-500/50 text-pink-400'
                : 'bg-zinc-700/50 border-2 border-transparent text-zinc-400 hover:border-zinc-600'
            }`}
          >
            Female
          </button>
        </div>
      </div>
    </div>
  );

  const renderFitnessPreferences = () => (
    <div className="space-y-6">
      {/* Fitness Goals */}
      <div className="bg-zinc-800/50 rounded-2xl p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Fitness Goals</p>
        <div className="flex flex-wrap gap-2">
          {FITNESS_GOALS.map(goal => {
            const Icon = goal.icon;
            const isSelected = user?.fitness_goals?.includes(goal.id);
            const colorClasses = {
              orange: isSelected ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' : '',
              red: isSelected ? 'bg-red-500/20 border-red-500/50 text-red-400' : '',
              yellow: isSelected ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400' : '',
              green: isSelected ? 'bg-green-500/20 border-green-500/50 text-green-400' : '',
              purple: isSelected ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : '',
            };
            return (
              <button
                key={goal.id}
                onClick={() => toggleGoal(goal.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all ${
                  isSelected
                    ? colorClasses[goal.color]
                    : 'bg-zinc-700/50 border-transparent text-zinc-400 hover:border-zinc-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-sm font-medium">{goal.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Workout Days */}
      <div className="bg-zinc-800/50 rounded-2xl p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Workout Days</p>
        <div className="flex flex-wrap gap-2">
          {DAYS_OF_WEEK.map(day => {
            const isSelected = user?.workout_days?.includes(day.id);
            return (
              <button
                key={day.id}
                onClick={() => toggleDay(day.id)}
                className={`w-12 h-12 rounded-xl font-bold text-sm transition-all ${
                  isSelected
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {day.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500 mt-2">
          {user?.workout_days?.length || 0} days selected
        </p>
      </div>

      {/* Workout Duration */}
      <div className="bg-zinc-800/50 rounded-2xl p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Session Duration</p>
        <div className="flex flex-wrap gap-2">
          {DURATIONS.map(dur => {
            const isSelected = user?.workout_duration === dur.id;
            return (
              <button
                key={dur.id}
                onClick={() => onUpdateProfile({ workout_duration: dur.id })}
                className={`px-4 py-2 rounded-xl font-medium text-sm transition-all ${
                  isSelected
                    ? 'bg-purple-500/20 border-2 border-purple-500/50 text-purple-400'
                    : 'bg-zinc-700/50 border-2 border-transparent text-zinc-400 hover:border-zinc-600'
                }`}
              >
                {dur.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Workout Location */}
      <div className="bg-zinc-800/50 rounded-2xl p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Workout Location</p>
        <div className="flex gap-3">
          <button
            onClick={() => onUpdateProfile({ workout_location: 'home' })}
            className={`flex-1 py-4 px-4 rounded-xl font-medium transition-all flex flex-col items-center gap-2 ${
              user?.workout_location === 'home'
                ? 'bg-green-500/20 border-2 border-green-500/50 text-green-400'
                : 'bg-zinc-700/50 border-2 border-transparent text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <Home className="w-6 h-6" />
            <span>Home</span>
          </button>
          <button
            onClick={() => onUpdateProfile({ workout_location: 'gym' })}
            className={`flex-1 py-4 px-4 rounded-xl font-medium transition-all flex flex-col items-center gap-2 ${
              user?.workout_location === 'gym'
                ? 'bg-blue-500/20 border-2 border-blue-500/50 text-blue-400'
                : 'bg-zinc-700/50 border-2 border-transparent text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <Building2 className="w-6 h-6" />
            <span>Gym</span>
          </button>
        </div>
      </div>

      {/* Equipment */}
      {equipment.length > 0 && (
        <div className="bg-zinc-800/50 rounded-2xl p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Available Equipment</p>
          <div className="flex flex-wrap gap-2">
            {equipment.map(item => (
              <span
                key={item}
                className="px-3 py-1.5 bg-zinc-700/50 rounded-lg text-sm text-zinc-300"
              >
                {item}
              </span>
            ))}
          </div>
          <p className="text-xs text-zinc-500 mt-2">
            Manage equipment in Settings
          </p>
        </div>
      )}
    </div>
  );

  const renderProgramInfo = () => {
    const startDate = programStartDate ? new Date(programStartDate) : null;

    return (
      <div className="space-y-6">
        {/* Program Start Date */}
        <div className="bg-zinc-800/50 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Program Start Date</p>
              {editingField === 'program_start_date' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="bg-zinc-700 px-3 py-2 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 [color-scheme:dark]"
                    autoFocus
                  />
                  <button
                    onClick={() => saveField('program_start_date')}
                    className="p-2 bg-green-500/20 text-green-400 rounded-lg"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingField(null)}
                    className="p-2 bg-zinc-700 text-zinc-400 rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <p className="text-lg font-semibold text-white">
                  {startDate
                    ? startDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })
                    : 'Not set'}
                </p>
              )}
            </div>
            {editingField !== 'program_start_date' && (
              <button
                onClick={() => startEditing('program_start_date', programStartDate?.split('T')[0])}
                className="text-xs text-orange-400"
              >
                Edit
              </button>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Changing this will recalculate your current week
          </p>
        </div>

        {/* Current Week */}
        <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
              <span className="text-2xl font-black text-white">{actualCurrentWeek || 1}</span>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Current Week</p>
              <p className="text-lg font-semibold text-white">Week {actualCurrentWeek || 1} of your program</p>
              <p className="text-xs text-zinc-400 mt-1">
                4-week cycle repeats automatically
              </p>
            </div>
          </div>
        </div>

        {/* Account Created */}
        {user?.created_at && (
          <div className="bg-zinc-800/50 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Member Since</p>
            <p className="text-lg font-semibold text-white">
              {new Date(user.created_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col text-white">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 via-transparent to-purple-500/5 pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800/50 rounded-xl transition-colors text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-orange-500/20 to-red-600/20 rounded-lg">
              <User className="w-5 h-5 text-orange-500" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              My Profile
            </h1>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/20 transition-colors text-sm font-medium"
        >
          <LogOut className="w-4 h-4" />
          {demoMode ? 'Exit Demo' : 'Sign Out'}
        </button>
      </div>

      {/* Avatar Section */}
      <div className="relative z-10 flex flex-col items-center py-6 border-b border-zinc-800/50">
        <div className="relative">
          <AvatarDisplay user={user} size="2xl" />
          <button
            onClick={() => setShowAvatarPicker(true)}
            className="absolute -bottom-1 -right-1 w-10 h-10 bg-zinc-800 border-2 border-zinc-700 rounded-xl flex items-center justify-center hover:bg-zinc-700 transition-colors"
          >
            <Camera className="w-5 h-5 text-zinc-300" />
          </button>
        </div>
        <h2 className="mt-4 text-xl font-bold">{user?.display_name || user?.name || 'User'}</h2>
        <p className="text-sm text-zinc-400">{authUser?.email || user?.email}</p>
      </div>

      {/* Tab Navigation */}
      <div className="relative z-10 flex border-b border-zinc-800/50 px-6 gap-6 bg-zinc-900/30 backdrop-blur-md">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSection(tab.id)}
            className={`flex items-center gap-2 py-4 text-sm font-medium transition-all relative
              ${activeSection === tab.id
                ? 'text-white'
                : 'text-zinc-500 hover:text-zinc-300'
              }`}
          >
            <tab.icon className={`w-4 h-4 ${activeSection === tab.id ? 'text-orange-500' : 'text-current'}`} />
            {tab.label}
            {activeSection === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-orange-500 to-red-600 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6 relative z-10">
        {activeSection === 'info' && renderPersonalInfo()}
        {activeSection === 'fitness' && renderFitnessPreferences()}
        {activeSection === 'program' && renderProgramInfo()}
      </div>

      {/* Avatar Picker Modal */}
      {showAvatarPicker && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="w-full max-w-md bg-zinc-900 rounded-t-3xl sm:rounded-3xl p-6">
            <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mb-6 sm:hidden" />
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold">Choose Avatar</h2>
              <button onClick={() => setShowAvatarPicker(false)} className="p-2 hover:bg-zinc-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Upload Photo Option */}
            <div className="mb-6">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                onChange={handleAvatarUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || demoMode}
                className="w-full py-3 px-4 bg-zinc-800 border border-zinc-700 rounded-xl font-medium hover:bg-zinc-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Camera className="w-5 h-5" />
                {uploading ? 'Uploading...' : 'Upload Photo'}
              </button>
              {demoMode && (
                <p className="text-xs text-zinc-500 text-center mt-2">Photo upload available when signed in</p>
              )}
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-zinc-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-zinc-900 text-zinc-500">or choose an emoji</span>
              </div>
            </div>

            {/* Emoji Options */}
            <div className="grid grid-cols-5 gap-3">
              {avatarOptions.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => handleEmojiSelect(emoji)}
                  className={`w-14 h-14 rounded-xl text-3xl flex items-center justify-center transition-all ${
                    user?.avatar === emoji && !user?.avatar_url
                      ? 'bg-orange-500/30 ring-2 ring-orange-500'
                      : 'bg-zinc-800 hover:bg-zinc-700'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Remove Current Photo */}
            {user?.avatar_url && (
              <button
                onClick={() => handleEmojiSelect('💪')}
                className="w-full mt-4 py-3 px-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 font-medium hover:bg-red-500/20 transition-colors"
              >
                Remove Photo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileArea;
