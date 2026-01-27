import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase, db } from './lib/supabase';
import { callLlmProvider } from './lib/llm';
import { useToast } from './components/Toast';
import { logError, ErrorCategory, ErrorSeverity } from './lib/errorService';

// Components
import LoginPage from './components/LoginPage';
import Onboarding from './components/Onboarding';
import AdminArea from './components/admin/AdminArea';
import ProfileArea from './components/Profile/ProfileArea';
import { Header, BottomNav, ViewModeBanner } from './components/Layout';
import { SettingsModal, EquipmentModal, AiGeneratorModal } from './components/Modals';

// Screens
import { WorkoutScreen, MaxesScreen, ProgressScreen, BuddiesScreen } from './screens';

// Constants and Utilities
import { defaultWorkoutProgram, defaultProfiles, defaultEquipment } from './constants';
import { calculateCurrentWeek, getTodayDayName } from './utils/date';
import { findMaxKey } from './utils/workout';
import { loadAllData, saveAllData } from './utils/storage';

// ============================================
// MAIN APP COMPONENT
// ============================================
export default function SwolTracker() {
  const toast = useToast();

  // ==========================================
  // AUTH STATE
  // ==========================================
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  // ==========================================
  // ONBOARDING STATE
  // ==========================================
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingData, setOnboardingData] = useState(null);

  // ==========================================
  // APP STATE
  // ==========================================
  const [isLoading, setIsLoading] = useState(true);
  const [profiles, setProfiles] = useState(defaultProfiles);
  const [currentUser, setCurrentUser] = useState('merrill');
  const [equipment, setEquipment] = useState(defaultEquipment);
  const [exerciseLog, setExerciseLog] = useState({});
  const [completedWorkouts, setCompletedWorkouts] = useState({});
  const [workoutProgram, setWorkoutProgram] = useState(defaultWorkoutProgram);
  const [programStartDate, setProgramStartDate] = useState(() => new Date().toISOString());
  const [currentWeek, setCurrentWeek] = useState(1);
  const [currentDay, setCurrentDay] = useState(getTodayDayName);
  const [activeTab, setActiveTab] = useState('workout');
  const [gymId, setGymId] = useState(null);

  // ==========================================
  // MODAL STATES
  // ==========================================
  const [showProfile, setShowProfile] = useState(false);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [showAddLift, setShowAddLift] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAiGenerator, setShowAiGenerator] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // ==========================================
  // FORM STATES
  // ==========================================
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [newLiftName, setNewLiftName] = useState('');
  const [newLiftWeight, setNewLiftWeight] = useState('');
  const [editingMax, setEditingMax] = useState(null);
  const [tempMaxValue, setTempMaxValue] = useState('');
  const [selectedReferenceExercise, setSelectedReferenceExercise] = useState('Bench Press');

  // ==========================================
  // AI STATES
  // ==========================================
  const [aiNotes, setAiNotes] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [generatedPreview, setGeneratedPreview] = useState(null);
  const [generationWeek, setGenerationWeek] = useState(null);

  // ==========================================
  // BUDDY/GROUP STATE
  // ==========================================
  const [viewingBuddy, setViewingBuddy] = useState(null);
  const [buddiesSearch, setBuddiesSearch] = useState('');
  const [groupRole, setGroupRole] = useState('independent');
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupLeader, setGroupLeader] = useState(null);
  const [leaderGymId, setLeaderGymId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // ==========================================
  // CHAT STATE
  // ==========================================
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const chatEndRef = useRef(null);

  // ==========================================
  // ADMIN STATE
  // ==========================================
  const [isAdmin, setIsAdmin] = useState(false);

  // ==========================================
  // DERIVED STATE
  // ==========================================
  const displayUser = viewingBuddy ? profiles[viewingBuddy] : profiles[currentUser];
  const user = displayUser || profiles[currentUser];
  const actualCurrentWeek = calculateCurrentWeek(programStartDate);

  // ==========================================
  // AUTH EFFECTS
  // ==========================================
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setAuthUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ==========================================
  // DATA LOADING
  // ==========================================
  useEffect(() => {
    if (!authUser) return;
    loadSupabaseData();
  }, [authUser]);

  const loadSupabaseData = async () => {
    setIsLoading(true);
    try {
      const userId = authUser.id;
      setCurrentUser(userId);

      let profile = await db.getProfile(userId);

      if (!profile?.onboarding_completed) {
        setShowOnboarding(true);
        setOnboardingData({
          name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || '',
          email: authUser.email
        });
        setIsLoading(false);
        return;
      }

      const [buddies, receivedRequests, sentRequests, groupRoleData] = await Promise.all([
        db.getBuddies(userId),
        db.getReceivedRequests(userId),
        db.getSentRequests(userId),
        db.getGroupRole(userId)
      ]);

      setGroupRole(groupRoleData.role);
      setGroupName(groupRoleData.group_name || '');

      if (groupRoleData.role === 'member' && groupRoleData.leader_id) {
        setGroupLeader({
          id: groupRoleData.leader_id,
          name: groupRoleData.leader_name,
          avatar: groupRoleData.leader_avatar,
          avatar_url: groupRoleData.leader_avatar_url,
          group_name: groupRoleData.group_name
        });
      } else if (groupRoleData.role === 'leader' && groupRoleData.member_count > 0) {
        const members = await db.getGroupMembers(userId);
        setGroupMembers(members);
      }

      const mergedProfile = {
        ...defaultProfiles.merrill,
        id: userId,
        name: authUser.user_metadata.full_name || authUser.email.split('@')[0],
        avatar: authUser.user_metadata.avatar_url || '💪',
        ...profile,
        maxes: (await db.getUserMaxes(userId)) || {},
        buddies: buddies.map(b => b.buddy_id),
        buddyProfiles: buddies.reduce((acc, b) => {
          acc[b.buddy_id] = { id: b.buddy_id, name: b.buddy_name, avatar: b.buddy_avatar, email: b.buddy_email };
          return acc;
        }, {}),
        receivedRequests: receivedRequests.map(r => ({ id: r.request_id, from: r.sender_id, name: r.sender_name, avatar: r.sender_avatar, timestamp: r.created_at })),
        sentRequests: sentRequests.map(r => ({ id: r.request_id, to: r.receiver_id, name: r.receiver_name, avatar: r.receiver_avatar, timestamp: r.created_at })),
        acceptedNotifications: []
      };

      setProfiles({ [userId]: mergedProfile });

      if (profile.program_start_date) {
        const startDate = new Date(profile.program_start_date);
        setProgramStartDate(startDate.toISOString());
        setCurrentWeek(calculateCurrentWeek(startDate.toISOString()));
      }

      const gyms = await db.getMyGyms(userId);
      let activeGymId = gyms.length === 0
        ? (await db.createGym('Personal Gym', userId))?.id
        : gyms[0].id;
      setGymId(activeGymId);

      if (activeGymId) {
        const eq = await db.getGymEquipment(activeGymId);
        if (eq.length > 0) setEquipment(eq);

        let programGymId = activeGymId;
        if (groupRoleData.role === 'member') {
          const leaderGym = await db.getLeaderGymId(userId);
          if (leaderGym) {
            programGymId = leaderGym;
            setLeaderGymId(leaderGym);
          }
        }

        const programs = await db.getAllWorkoutPrograms(programGymId);
        if (Object.keys(programs).length > 0) {
          setWorkoutProgram(programs);
        }

        const logs = await db.getAllWorkoutLogs(activeGymId);
        const newLog = {};
        logs.forEach(l => {
          const key = `${l.user_id}-${l.week_number}-${l.day_name}-${l.exercise_index}-${l.set_index}`;
          newLog[key] = { completed: l.completed, actualWeight: l.actual_weight, actualReps: l.actual_reps };
        });
        setExerciseLog(newLog);
      }

      setIsAdmin(db.isAdmin(authUser.email));
    } catch (e) {
      console.error("Error loading Supabase data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // LOCAL STORAGE (Demo Mode)
  // ==========================================
  useEffect(() => {
    if (authLoading || authUser) return;
    const data = loadAllData();
    if (data.profiles) setProfiles(data.profiles);
    if (data.equipment) setEquipment(data.equipment);
    if (data.exerciseLog) setExerciseLog(data.exerciseLog);
    if (data.completedWorkouts) setCompletedWorkouts(data.completedWorkouts);
    if (data.workoutProgram) setWorkoutProgram(data.workoutProgram);
    if (data.programStartDate) setProgramStartDate(data.programStartDate);
    if (data.currentUser) setCurrentUser(data.currentUser);
    setIsLoading(false);
  }, [authLoading]);

  useEffect(() => {
    if (isLoading || authLoading) return;
    saveAllData({ profiles, equipment, exerciseLog, completedWorkouts, workoutProgram, programStartDate, currentUser });
  }, [profiles, equipment, exerciseLog, completedWorkouts, workoutProgram, programStartDate, currentUser, isLoading, authLoading]);

  // ==========================================
  // CHAT SUBSCRIPTION
  // ==========================================
  useEffect(() => {
    if (!supabase || !currentUser || groupRole === 'independent' || demoMode) return;

    const setupSubscription = async () => {
      const leaderId = groupRole === 'leader' ? currentUser : groupLeader?.id;
      if (!leaderId) return;

      if (showChat && chatMessages.length === 0) {
        loadChatMessages();
      }

      const channel = supabase
        .channel(`group_chat_${leaderId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages', filter: `leader_id=eq.${leaderId}` },
          async () => {
            const messages = await db.getGroupMessages(currentUser, 1);
            if (messages.length > 0) {
              const newMessage = messages[0];
              setChatMessages(prev => {
                if (prev.some(msg => msg.id === newMessage.id)) return prev;
                if (newMessage.sender_id === currentUser) {
                  const idx = prev.findIndex(msg => msg._optimistic && msg.sender_id === currentUser && (msg._realId === newMessage.id || (msg.content === newMessage.content && Math.abs(new Date(msg.message_created_at) - new Date(newMessage.message_created_at)) < 30000)));
                  if (idx !== -1) { const updated = [...prev]; updated[idx] = newMessage; return updated; }
                }
                return [...prev, newMessage];
              });
              if (showChat && newMessage.sender_id !== currentUser) await db.markMessagesRead(currentUser);
              else if (!showChat && newMessage.sender_id !== currentUser) setHasUnreadMessages(true);
              setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }
          }
        )
        .subscribe();

      return () => supabase.removeChannel(channel);
    };

    const cleanup = setupSubscription();
    return () => { cleanup?.then(fn => fn?.()); };
  }, [currentUser, groupRole, groupLeader?.id, showChat, demoMode]);

  // ==========================================
  // CONFETTI FOR ACCEPTED REQUESTS
  // ==========================================
  useEffect(() => {
    if (activeTab === 'buddies' && user?.acceptedNotifications?.length > 0) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], acceptedNotifications: [] } }));
    }
  }, [activeTab, currentUser, user?.acceptedNotifications]);

  // ==========================================
  // HANDLERS
  // ==========================================
  const handleLogin = (options) => { if (options?.demoMode) setDemoMode(true); };

  const handleLogout = async () => {
    if (supabase && !demoMode) await db.signOut?.() || (await supabase.auth.signOut());
    setDemoMode(false);
    setAuthUser(null);
  };

  const handleUpdateProfile = async (updates) => {
    if (demoMode) {
      setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], ...updates } }));
      return;
    }
    if (!authUser) return;
    const updated = await db.updateProfile(authUser.id, updates);
    if (updated) {
      setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], ...updated } }));
      if (updates.program_start_date) setProgramStartDate(updates.program_start_date);
    }
  };

  const handleUploadAvatar = async (file) => {
    if (demoMode || !authUser) return;
    const result = await db.uploadAvatar(authUser.id, file);
    if (result?.url) {
      setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], avatar_url: result.url, avatar: null } }));
    }
  };

  const handleGenerateOnboardingWorkout = async (onboardingData) => {
    if (!authUser) return false;

    try {
      // 1. Save the user profile with onboarding data
      const profileSaved = await db.completeOnboarding(authUser.id, onboardingData);
      if (!profileSaved) {
        console.error('Failed to save onboarding profile');
        return false;
      }

      // 2. Get the prompt template
      const promptTemplate = await db.getPromptTemplate('onboarding_workout_generator');
      if (!promptTemplate) {
        console.error('Onboarding prompt template not found');
        return false;
      }

      // 3. Get LLM provider and API key
      const provider = await db.getLlmProvider();
      const apiKey = await db.getGlobalApiKey();
      if (!apiKey) {
        console.error('No API key configured');
        return false;
      }

      // 4. Fill in the prompt template with user data
      const filledPrompt = promptTemplate
        .replace(/\{\{display_name\}\}/g, onboardingData.displayName)
        .replace(/\{\{gender\}\}/g, onboardingData.gender)
        .replace(/\{\{age\}\}/g, onboardingData.age)
        .replace(/\{\{weight_lbs\}\}/g, onboardingData.weightLbs)
        .replace(/\{\{workout_location\}\}/g, onboardingData.workoutLocation)
        .replace(/\{\{fitness_goals\}\}/g, onboardingData.fitnessGoals.join(', '))
        .replace(/\{\{workout_days\}\}/g, onboardingData.workoutDays.join(', '))
        .replace(/\{\{workout_duration\}\}/g, onboardingData.workoutDuration)
        .replace(/\{\{equipment\}\}/g, onboardingData.equipment.join(', '));

      // 5. Call the LLM
      const systemPrompt = 'You are an expert fitness coach. Generate a workout program as JSON only, no markdown, no comments, no explanations. Return ONLY valid JSON.';
      const result = await callLlmProvider(provider, apiKey, systemPrompt, filledPrompt, 'onboarding', db, authUser.id);

      // Log the API usage
      await db.logApiUsage(authUser.id, 'onboarding_workout', result.model, result.usage.prompt_tokens, result.usage.completion_tokens, true, null);

      // 6. Parse the response - extract JSON robustly
      let cleanedResponse = result.content
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

      // Try to extract JSON object if there's extra text
      const firstBrace = cleanedResponse.indexOf('{');
      const lastBrace = cleanedResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedResponse = cleanedResponse.slice(firstBrace, lastBrace + 1);
      }

      let generatedProgram;
      try {
        generatedProgram = JSON.parse(cleanedResponse);
      } catch (parseError) {
        // Log the parsing error with a snippet of what we tried to parse
        await logError(db, {
          category: ErrorCategory.PARSING,
          message: 'Failed to parse AI workout response: ' + parseError.message,
          severity: ErrorSeverity.ERROR,
          userId: authUser?.id,
          component: 'swoltracker.jsx',
          operation: 'handleGenerateOnboardingWorkout.parseJson',
          originalError: parseError,
          context: {
            responseSnippet: cleanedResponse.substring(0, 500),
            responseLength: cleanedResponse.length,
            onboardingData
          }
        });
        throw new Error('The AI returned an invalid response. Please try again.');
      }

      // 7. Save workout programs for each week
      // First, get or create the user's gym
      let userGymId = gymId;
      if (!userGymId) {
        // Get the profile which should now have a gym_id from completeOnboarding
        const profile = await db.getProfile(authUser.id);
        userGymId = profile?.gym_id;
      }

      if (userGymId) {
        // Save each week's program
        for (let week = 1; week <= 4; week++) {
          const weekKey = `week${week}`;
          if (generatedProgram[weekKey]) {
            await db.saveWorkoutProgram(userGymId, week, generatedProgram[weekKey], authUser.id, true, 'Generated during onboarding');
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error generating onboarding workout:', error);
      await logError(db, {
        category: ErrorCategory.LLM,
        message: error.message || 'Failed to generate onboarding workout',
        severity: ErrorSeverity.ERROR,
        userId: authUser?.id,
        component: 'swoltracker.jsx',
        operation: 'handleGenerateOnboardingWorkout',
        originalError: error,
        context: { onboardingData }
      });
      return false;
    }
  };

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    if (authUser) window.location.reload();
  };

  // Workout logging
  const logSet = async (exerciseIndex, setIndex, data) => {
    const key = `${currentUser}-${currentWeek}-${currentDay}-${exerciseIndex}-${setIndex}`;
    const wasCompleted = exerciseLog[key]?.completed || false;
    setExerciseLog(prev => ({ ...prev, [key]: { ...data, completed: !wasCompleted } }));
    if (!demoMode && gymId) {
      await db.logSet(currentUser, gymId, currentWeek, currentDay, exerciseIndex, setIndex, data.exerciseName || `Exercise ${exerciseIndex + 1}`, { ...data, completed: !wasCompleted });
    }
  };

  const isSetLogged = (exerciseIndex, setIndex, targetUserId = currentUser) => {
    return exerciseLog[`${targetUserId}-${currentWeek}-${currentDay}-${exerciseIndex}-${setIndex}`]?.completed;
  };

  const getCompletionPercentage = (week, day, targetUserId = currentUser) => {
    if (!workoutProgram[week]?.[day]?.exercises) return 0;
    const totalSets = workoutProgram[week][day].exercises.reduce((acc, ex) => acc + ex.sets, 0);
    if (totalSets === 0) return 0;
    let completed = 0;
    workoutProgram[week][day].exercises.forEach((ex, ei) => {
      for (let si = 0; si < ex.sets; si++) {
        if (exerciseLog[`${targetUserId}-${week}-${day}-${ei}-${si}`]?.completed) completed++;
      }
    });
    return Math.round((completed / totalSets) * 100);
  };

  const getTotalCompletedSets = (userId = currentUser) => {
    return Object.keys(exerciseLog).filter(k => k.startsWith(userId) && exerciseLog[k]?.completed).length;
  };

  const getTotalCompletedWorkouts = (userId = currentUser) => {
    return Object.keys(completedWorkouts).filter(k => k.startsWith(userId) && completedWorkouts[k]).length;
  };

  const isWorkoutComplete = (week, day, targetUserId = currentUser) => {
    return completedWorkouts[`${targetUserId}-${week}-${day}`] || false;
  };

  const toggleWorkoutComplete = (week, day) => {
    const key = `${currentUser}-${week}-${day}`;
    const wasComplete = completedWorkouts[key] || false;
    const completionPct = getCompletionPercentage(week, day, currentUser);

    setCompletedWorkouts(prev => ({ ...prev, [key]: !wasComplete }));

    // Fire confetti when completing a workout at 100%
    if (!wasComplete && completionPct === 100) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f97316', '#ef4444', '#22c55e', '#3b82f6', '#a855f7']
      });
    }
  };

  // Maxes
  const updateMax = async (lift, value) => {
    const weight = parseInt(value) || 0;
    setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], maxes: { ...prev[currentUser].maxes, [lift]: weight } } }));
    setEditingMax(null);
    if (!demoMode) await db.updateMax(currentUser, lift, weight);
  };

  const addNewLift = async () => {
    if (!newLiftName.trim() || !newLiftWeight) return;
    const weight = parseInt(newLiftWeight);
    setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], maxes: { ...prev[currentUser].maxes, [newLiftName]: weight } } }));
    setNewLiftName(''); setNewLiftWeight(''); setShowAddLift(false);
    if (!demoMode) await db.updateMax(currentUser, newLiftName.trim(), weight);
  };

  const openQuickAddMax = (exerciseName) => {
    const maxKey = findMaxKey(exerciseName, user?.maxes || {});
    setNewLiftName(maxKey || exerciseName);
    setNewLiftWeight('');
    setShowAddLift(true);
  };

  const deleteLift = async (lift) => {
    const newMaxes = { ...profiles[currentUser].maxes };
    delete newMaxes[lift];
    setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], maxes: newMaxes } }));
    if (!demoMode) await db.deleteMax(currentUser, lift);
  };

  // Equipment
  const addEquipment = () => {
    if (!newEquipmentName.trim() || equipment.includes(newEquipmentName)) return;
    setEquipment(prev => [...prev, newEquipmentName]);
    setNewEquipmentName('');
    setShowAddEquipment(false);
  };

  const removeEquipment = (item) => { setEquipment(prev => prev.filter(e => e !== item)); };

  // Chat
  const loadChatMessages = async () => {
    if (!currentUser || groupRole === 'independent') return;
    setChatLoading(true);
    const messages = await db.getGroupMessages(currentUser, 50);
    setChatMessages(messages.reverse());
    setChatLoading(false);
    await db.markMessagesRead(currentUser);
    setHasUnreadMessages(false);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !currentUser) return;
    const content = chatInput.trim();
    const userProfile = profiles[currentUser] || {};
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const optimisticMessage = { id: tempId, sender_id: currentUser, sender_name: userProfile.name || 'You', sender_avatar: userProfile.avatar, sender_avatar_url: userProfile.avatar_url, content, message_created_at: new Date().toISOString(), _optimistic: true, _realId: null };
    setChatInput('');
    setChatMessages(prev => [...prev, optimisticMessage]);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    const result = await db.sendGroupMessage(currentUser, content);
    if (!result?.success) {
      setChatMessages(prev => prev.filter(msg => msg.id !== tempId));
      toast.error(result?.error || 'Failed to send message');
      setChatInput(content);
    } else if (result?.message_id) {
      setChatMessages(prev => prev.map(msg => msg.id === tempId ? { ...msg, _realId: result.message_id } : msg));
    }
  };

  // Group/Buddy operations
  const sendBuddyRequest = async (targetId, targetName = '', targetAvatar = '') => {
    if (targetId === currentUser || profiles[currentUser]?.buddies?.includes(targetId)) return;
    if (profiles[currentUser]?.sentRequests?.find(r => r.to === targetId)) return;
    if (!demoMode) {
      const result = await db.sendMemberInvite(currentUser, targetId);
      if (!result?.success) { toast.error(result?.error || 'Failed to send invite'); return; }
    }
    setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], sentRequests: [...(prev[currentUser].sentRequests || []), { to: targetId, name: targetName, avatar: targetAvatar, timestamp: new Date().toISOString() }] } }));
    setBuddiesSearch('');
  };

  const acceptBuddyRequest = async (requestId, requesterId, requesterName = '', requesterAvatar = '') => {
    if (!demoMode) {
      const success = await db.acceptGroupInvite(requestId, currentUser);
      if (!success) return;
      const leaderGym = await db.getLeaderGymId(currentUser);
      if (leaderGym) {
        setLeaderGymId(leaderGym);
        const programs = await db.getAllWorkoutPrograms(leaderGym);
        if (programs.length > 0) setWorkoutProgram(programs.find(p => p.is_active)?.program_data || programs[0] || {});
      }
    }
    setGroupRole('member');
    setGroupLeader({ id: requesterId, name: requesterName, avatar: requesterAvatar });
    setProfiles(prev => {
      const u = { ...prev[currentUser] };
      u.receivedRequests = (u.receivedRequests || []).filter(r => r.from !== requesterId);
      u.buddies = [...(u.buddies || []), requesterId];
      u.buddyProfiles = { ...(u.buddyProfiles || {}), [requesterId]: { id: requesterId, name: requesterName, avatar: requesterAvatar } };
      return { ...prev, [currentUser]: u };
    });
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
  };

  const declineBuddyRequest = async (requestId, requesterId) => {
    if (!demoMode) { const success = await db.declineBuddyRequest(requestId); if (!success) return; }
    setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], receivedRequests: (prev[currentUser].receivedRequests || []).filter(r => r.from !== requesterId) } }));
  };

  const removeBuddy = async (buddyId) => {
    if (!demoMode) { const success = await db.removeBuddy(currentUser, buddyId); if (!success) return; }
    setProfiles(prev => {
      const u = { ...prev[currentUser] };
      u.buddies = (u.buddies || []).filter(id => id !== buddyId);
      if (u.buddyProfiles) delete u.buddyProfiles[buddyId];
      return { ...prev, [currentUser]: u };
    });
    if (viewingBuddy === buddyId) setViewingBuddy(null);
  };

  const leaveWorkoutGroup = async () => {
    if (!confirm('Are you sure you want to leave the group?')) return;
    if (!demoMode) { const success = await db.leaveWorkoutGroup(currentUser); if (!success) return; }
    setGroupRole('independent');
    const prevLeader = groupLeader;
    setGroupLeader(null);
    setLeaderGymId(null);
    setWorkoutProgram({});
    setProfiles(prev => {
      const u = { ...prev[currentUser] };
      if (prevLeader) { u.buddies = (u.buddies || []).filter(id => id !== prevLeader.id); if (u.buddyProfiles) delete u.buddyProfiles[prevLeader.id]; }
      return { ...prev, [currentUser]: u };
    });
  };

  const removeGroupMember = async (memberId, memberName) => {
    if (!confirm(`Remove ${memberName} from your group?`)) return;
    if (!demoMode) { const success = await db.removeGroupMember(currentUser, memberId); if (!success) return; }
    setGroupMembers(prev => prev.filter(m => m.id !== memberId));
    setProfiles(prev => {
      const u = { ...prev[currentUser] };
      u.buddies = (u.buddies || []).filter(id => id !== memberId);
      if (u.buddyProfiles) delete u.buddyProfiles[memberId];
      return { ...prev, [currentUser]: u };
    });
    if (groupMembers.length <= 1) setGroupRole('independent');
  };

  const searchUsersInDb = async (searchTerm) => {
    if (!searchTerm.trim() || demoMode) { setSearchResults([]); return; }
    setSearchLoading(true);
    const results = await db.searchUsers(searchTerm, currentUser);
    setSearchResults(results);
    setSearchLoading(false);
  };

  // AI Generator
  const openAiGenerator = (weekNum) => {
    setGenerationWeek(weekNum);
    setAiNotes('');
    setAiError('');
    setGeneratedPreview(null);
    setShowAiGenerator(true);
  };

  const generateAiWorkout = async () => {
    setAiLoading(true);
    setAiError('');
    setGeneratedPreview(null);

    try {
      const provider = await db.getLlmProvider();
      const apiKey = await db.getGlobalApiKey();
      if (!apiKey) { setAiError('No API key configured.'); setAiLoading(false); return; }

      const recentWeeks = [];
      for (let w = Math.max(1, generationWeek - 3); w < generationWeek; w++) {
        if (workoutProgram[w]) recentWeeks.push({ week: w, program: workoutProgram[w] });
      }

      const systemPrompt = `You are an elite strength and conditioning coach. Generate a complete week of workouts in JSON format.`;
      const userPrompt = `Generate Week ${generationWeek} workout program. Athletes: ${Object.entries(profiles).map(([id, p]) => `${p.name} with maxes: ${JSON.stringify(p.maxes)}`).join('; ')}. Equipment: ${equipment.join(', ')}. Previous weeks: ${JSON.stringify(recentWeeks)}. Notes: ${aiNotes || 'None'}. Return JSON only with Monday-Sunday, each having focus and exercises array.`;

      const result = await callLlmProvider(provider, apiKey, systemPrompt, userPrompt, 'weekly', db, currentUser);
      await db.logApiUsage(currentUser, 'weekly_generation', result.model, result.usage.prompt_tokens, result.usage.completion_tokens, true, null);

      const cleanedResponse = result.content.replace(/```json|```/g, '').trim();
      const generatedProgram = JSON.parse(cleanedResponse);
      const requiredDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      for (const day of requiredDays) { if (!generatedProgram[day]) throw new Error(`Missing day: ${day}`); }
      setGeneratedPreview(generatedProgram);
    } catch (error) {
      setAiError(error.message || 'Failed to generate workout.');
      toast.error(error.message);
    } finally {
      setAiLoading(false);
    }
  };

  const confirmGeneratedWorkout = async () => {
    if (!generatedPreview || !generationWeek) return;
    setWorkoutProgram(prev => ({ ...prev, [generationWeek]: generatedPreview }));
    if (gymId) await db.saveWorkoutProgram(gymId, generationWeek, generatedPreview, currentUser, true, aiNotes);
    setShowAiGenerator(false);
    setGeneratedPreview(null);
    setCurrentWeek(generationWeek);
  };

  // ==========================================
  // RENDER
  // ==========================================
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

  if (!authUser && !demoMode) {
    return <LoginPage onLogin={handleLogin} isLoading={authLoading} />;
  }

  if (showOnboarding && !demoMode) {
    return <Onboarding user={onboardingData} onComplete={handleOnboardingComplete} onGenerateWorkout={handleGenerateOnboardingWorkout} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <Header
        user={user}
        demoMode={demoMode}
        onSettingsClick={() => setShowSettings(true)}
        onProfileClick={() => setShowProfile(true)}
      />

      {viewingBuddy && (
        <ViewModeBanner
          buddyName={profiles[viewingBuddy]?.name}
          onExitView={() => setViewingBuddy(null)}
        />
      )}

      <main className="px-5 py-6">
        {activeTab === 'workout' && (
          <WorkoutScreen
            workoutProgram={workoutProgram}
            currentWeek={currentWeek}
            currentDay={currentDay}
            actualCurrentWeek={actualCurrentWeek}
            programStartDate={programStartDate}
            user={user}
            isViewingBuddy={!!viewingBuddy}
            groupRole={groupRole}
            groupLeader={groupLeader}
            onPreviousWeek={() => setCurrentWeek(w => Math.max(1, w - 1))}
            onNextWeek={() => setCurrentWeek(w => w + 1)}
            onDayChange={setCurrentDay}
            onGoToCurrentWeek={() => setCurrentWeek(actualCurrentWeek)}
            onGenerateWorkout={openAiGenerator}
            isSetLogged={isSetLogged}
            onLogSet={logSet}
            onAddMax={openQuickAddMax}
            getCompletionPercentage={getCompletionPercentage}
            isWorkoutComplete={isWorkoutComplete}
            onToggleWorkoutComplete={toggleWorkoutComplete}
          />
        )}

        {activeTab === 'maxes' && (
          <MaxesScreen
            user={user}
            isViewingBuddy={!!viewingBuddy}
            editingMax={editingMax}
            tempMaxValue={tempMaxValue}
            selectedReferenceExercise={selectedReferenceExercise}
            showAddLift={showAddLift}
            newLiftName={newLiftName}
            newLiftWeight={newLiftWeight}
            onSelectReference={setSelectedReferenceExercise}
            onStartEdit={(lift, weight) => { setEditingMax(lift); setTempMaxValue(weight.toString()); }}
            onSaveEdit={(lift, val) => updateMax(lift, val)}
            onCancelEdit={() => setEditingMax(null)}
            onTempValueChange={setTempMaxValue}
            onDeleteLift={deleteLift}
            onOpenAddLift={() => setShowAddLift(true)}
            onCloseAddLift={() => setShowAddLift(false)}
            onNewLiftNameChange={setNewLiftName}
            onNewLiftWeightChange={setNewLiftWeight}
            onAddNewLift={addNewLift}
          />
        )}

        {activeTab === 'progress' && (
          <ProgressScreen
            user={user}
            totalCompletedWorkouts={getTotalCompletedWorkouts(user.id)}
            weeksProgrammed={Object.keys(workoutProgram).length}
          />
        )}

        {activeTab === 'buddies' && (
          <BuddiesScreen
            currentUser={currentUser}
            user={user}
            profiles={profiles}
            demoMode={demoMode}
            groupRole={groupRole}
            groupLeader={groupLeader}
            groupMembers={groupMembers}
            groupName={groupName}
            editingGroupName={editingGroupName}
            buddiesSearch={buddiesSearch}
            searchResults={searchResults}
            searchLoading={searchLoading}
            chatMessages={chatMessages}
            chatInput={chatInput}
            showChat={showChat}
            chatLoading={chatLoading}
            chatEndRef={chatEndRef}
            onLeaveGroup={leaveWorkoutGroup}
            onRemoveMember={(id) => removeGroupMember(id, groupMembers.find(m => m.member_id === id)?.member_name)}
            onStartEditGroupName={() => setEditingGroupName(true)}
            onSaveGroupName={() => { db.updateProfile(currentUser, { group_name: groupName }); setEditingGroupName(false); }}
            onCancelEditGroupName={() => setEditingGroupName(false)}
            onGroupNameChange={setGroupName}
            onAcceptInvite={acceptBuddyRequest}
            onDeclineInvite={declineBuddyRequest}
            onSearchChange={(val) => { setBuddiesSearch(val); if (val.trim()) searchUsersInDb(val); else setSearchResults([]); }}
            onSendInvite={sendBuddyRequest}
            onViewProfile={(id) => { setViewingBuddy(id); setActiveTab('workout'); }}
            onRemoveBuddy={removeBuddy}
            onToggleChat={() => { setShowChat(!showChat); if (!showChat && chatMessages.length === 0) loadChatMessages(); }}
            onChatInputChange={setChatInput}
            onSendMessage={sendChatMessage}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        user={user}
        hasUnreadMessages={hasUnreadMessages}
      />

      <SettingsModal
        isOpen={showSettings}
        groupRole={groupRole}
        groupLeader={groupLeader}
        currentUser={currentUser}
        userId={user?.id}
        workoutProgram={workoutProgram}
        equipment={equipment}
        programStartDate={programStartDate}
        actualCurrentWeek={actualCurrentWeek}
        isAdmin={isAdmin}
        onClose={() => setShowSettings(false)}
        onOpenAiGenerator={openAiGenerator}
        onOpenAdmin={() => setShowAdmin(true)}
        onOpenEquipment={() => setShowAddEquipment(true)}
        onRemoveEquipment={removeEquipment}
      />

      <EquipmentModal
        isOpen={showAddEquipment}
        equipmentName={newEquipmentName}
        onNameChange={setNewEquipmentName}
        onAdd={addEquipment}
        onClose={() => setShowAddEquipment(false)}
      />

      <AiGeneratorModal
        isOpen={showAiGenerator}
        generationWeek={generationWeek}
        profiles={profiles}
        equipment={equipment}
        workoutProgram={workoutProgram}
        aiNotes={aiNotes}
        aiLoading={aiLoading}
        aiError={aiError}
        generatedPreview={generatedPreview}
        onNotesChange={setAiNotes}
        onGenerate={generateAiWorkout}
        onConfirm={confirmGeneratedWorkout}
        onRegenerate={() => setGeneratedPreview(null)}
        onClose={() => setShowAiGenerator(false)}
      />

      {showAdmin && <AdminArea onClose={() => setShowAdmin(false)} db={db} />}

      {showProfile && (
        <ProfileArea
          user={user}
          authUser={authUser}
          onClose={() => setShowProfile(false)}
          onUpdateProfile={handleUpdateProfile}
          onLogout={() => { setShowProfile(false); handleLogout(); }}
          onUploadAvatar={handleUploadAvatar}
          equipment={equipment}
          programStartDate={programStartDate}
          actualCurrentWeek={actualCurrentWeek}
          demoMode={demoMode}
        />
      )}
    </div>
  );
}
