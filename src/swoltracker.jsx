import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase, db } from './lib/supabase';
import { generateWithLlm } from './lib/llm';
import { useToast } from './components/Toast';
import { logError, ErrorCategory, ErrorSeverity } from './lib/errorService';
import { useAdmin } from './hooks/useAdmin';
import { useAiGenerator } from './hooks/useAiGenerator';
import { useWorkoutLogger } from './hooks/useWorkoutLogger';
import { useExerciseSwap } from './hooks/useExerciseSwap';
import { validate, profileUpdateSchema, maxWeightSchema, chatMessageSchema, equipmentNameSchema, searchQuerySchema } from './lib/validation';

// Components
import LoginPage from './components/LoginPage';
import Onboarding from './components/Onboarding';
const AdminArea = lazy(() => import('./components/admin/AdminArea'));
import ProfileArea from './components/Profile/ProfileArea';
import { Header, BottomNav } from './components/Layout';
import { SettingsModal, EquipmentModal, AiGeneratorModal } from './components/Modals';
import { AddLiftModal } from './components/Maxes';

// Screens
import { WorkoutScreen, MaxesScreen, ProgressScreen, BuddiesScreen } from './screens';

// Constants and Utilities
import { defaultEquipment } from './constants';
import { calculateCurrentWeek, getTodayDayName } from './utils/date';
import { findMaxKey } from './utils/workout';

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
  const { isAdmin, showAdmin, checkAdmin, openAdmin, closeAdmin } = useAdmin(authUser);

  // ==========================================
  // ONBOARDING STATE
  // ==========================================
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingData, setOnboardingData] = useState(null);

  // ==========================================
  // APP STATE
  // ==========================================
  const [isLoading, setIsLoading] = useState(true);
  const [profiles, setProfiles] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [equipment, setEquipment] = useState(defaultEquipment);
  const [workoutProgram, setWorkoutProgram] = useState({});
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
  // BUDDY/GROUP STATE
  // ==========================================
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
  // DOMAIN HOOKS
  // ==========================================
  const {
    exerciseLog, setExerciseLog,
    completedWorkouts, setCompletedWorkouts,
    logSet, isSetLogged, getCompletionPercentage,
    getTotalCompletedSets, getTotalCompletedWorkouts,
    isWorkoutComplete, toggleWorkoutComplete,
  } = useWorkoutLogger({ currentUser, currentWeek, currentDay, workoutProgram, gymId });

  const {
    aiNotes, setAiNotes, aiLoading, aiError,
    generatedPreview, setGeneratedPreview,
    generationWeek, weekCount, setWeekCount,
    previewWeek, setPreviewWeek,
    showAiGenerator, setShowAiGenerator,
    generationContextLoading, trainingHistorySummary, overloadRecommendations,
    openAiGenerator, generateAiWorkout, confirmGeneratedWorkout,
  } = useAiGenerator({ currentUser, profiles, equipment, workoutProgram, gymId, toast, setWorkoutProgram, setCurrentWeek });

  const { swapState, requestSwap, clearSwap } = useExerciseSwap({ equipment, currentUser, toast });

  // ==========================================
  // DERIVED STATE
  // ==========================================
  const user = profiles[currentUser];
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
    if (!authUser) {
      setIsLoading(false);
      return;
    }
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

        const completions = await db.getWorkoutCompletions(activeGymId);
        const completedMap = {};
        completions.forEach(c => {
          completedMap[`${c.user_id}-${c.week_number}-${c.day_name}`] = true;
        });
        setCompletedWorkouts(completedMap);
      }

      checkAdmin(authUser.id);
    } catch (e) {
      console.error("Error loading Supabase data:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // ==========================================
  // CHAT SUBSCRIPTION
  // ==========================================
  useEffect(() => {
    if (!supabase || !currentUser || groupRole === 'independent') return;

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
  }, [currentUser, groupRole, groupLeader?.id, showChat]);

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
  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setAuthUser(null);
  };

  const handleUpdateProfile = async (updates) => {
    if (!authUser) return;
    const { success, data: validUpdates, error } = validate(profileUpdateSchema, updates);
    if (!success) { toast.error(error); return; }
    const updated = await db.updateProfile(authUser.id, validUpdates);
    if (updated) {
      setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], ...updated } }));
      if (validUpdates.program_start_date) setProgramStartDate(validUpdates.program_start_date);
    }
  };

  const handleUploadAvatar = async (file) => {
    if (!authUser) return;
    const result = await db.uploadAvatar(authUser.id, file);
    if (result?.url) {
      setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], avatar_url: result.url, avatar: null } }));
    }
  };

  const handleGenerateOnboardingWorkout = async (onboardingData) => {
    if (!authUser) return false;

    try {
      const profileSaved = await db.completeOnboarding(authUser.id, onboardingData);
      if (!profileSaved) { console.error('Failed to save onboarding profile'); return false; }

      const promptTemplate = await db.getPromptTemplate('onboarding_workout_generator');
      if (!promptTemplate) { console.error('Onboarding prompt template not found'); return false; }

      const provider = await db.getLlmProvider();

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

      const systemPrompt = 'You are an expert fitness coach. Generate a workout program as JSON only, no markdown, no comments, no explanations. Return ONLY valid JSON.';
      const result = await generateWithLlm(provider, systemPrompt, filledPrompt, 'onboarding', db, authUser.id);
      await db.logApiUsage(authUser.id, 'onboarding_workout', result.model, result.usage.prompt_tokens, result.usage.completion_tokens, true, null);

      let cleanedResponse = result.content.replace(/```json/gi, '').replace(/```/g, '').trim();
      const firstBrace = cleanedResponse.indexOf('{');
      const lastBrace = cleanedResponse.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanedResponse = cleanedResponse.slice(firstBrace, lastBrace + 1);
      }

      let generatedProgram;
      try {
        generatedProgram = JSON.parse(cleanedResponse);
      } catch (parseError) {
        await logError(db, {
          category: ErrorCategory.PARSING,
          message: 'Failed to parse AI workout response: ' + parseError.message,
          severity: ErrorSeverity.ERROR,
          userId: authUser?.id,
          component: 'swoltracker.jsx',
          operation: 'handleGenerateOnboardingWorkout.parseJson',
          originalError: parseError,
          context: { responseSnippet: cleanedResponse.substring(0, 500), responseLength: cleanedResponse.length, onboardingData }
        });
        throw new Error('The AI returned an invalid response. Please try again.');
      }

      let userGymId = gymId;
      if (!userGymId) {
        const profile = await db.getProfile(authUser.id);
        userGymId = profile?.gym_id;
      }

      if (userGymId) {
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

  // Maxes
  const updateMax = async (lift, value) => {
    const weight = Math.max(0, Math.min(9999, parseInt(value) || 0));
    setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], maxes: { ...prev[currentUser].maxes, [lift]: weight } } }));
    setEditingMax(null);
    await db.updateMax(currentUser, lift, weight);
  };

  const addNewLift = async () => {
    const { success, data: validated, error } = validate(maxWeightSchema, {
      exerciseName: newLiftName,
      weight: parseInt(newLiftWeight) || 0,
    });
    if (!success) { toast.error(error); return; }
    setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], maxes: { ...prev[currentUser].maxes, [validated.exerciseName]: validated.weight } } }));
    setNewLiftName(''); setNewLiftWeight(''); setShowAddLift(false);
    await db.updateMax(currentUser, validated.exerciseName, validated.weight);
  };

  const openQuickAddMax = (exerciseName) => {
    const maxKey = findMaxKey(exerciseName, user?.maxes || {});
    setNewLiftName(maxKey || exerciseName);
    setNewLiftWeight('');
    setShowAddLift(true);
    setActiveTab('maxes');
  };

  const acceptSwap = async (exerciseIndex, alternative) => {
    const updatedDayWorkout = { ...workoutProgram[currentWeek][currentDay] };
    const updatedExercises = [...updatedDayWorkout.exercises];
    updatedExercises[exerciseIndex] = alternative;
    updatedDayWorkout.exercises = updatedExercises;

    const updatedWeekProgram = { ...workoutProgram[currentWeek], [currentDay]: updatedDayWorkout };

    setWorkoutProgram(prev => ({ ...prev, [currentWeek]: updatedWeekProgram }));

    if (gymId) {
      await db.saveWorkoutProgram(gymId, currentWeek, updatedWeekProgram, currentUser, false);
    }

    clearSwap();
    toast.success(`Swapped to ${alternative.name}`);
  };

  const deleteLift = async (lift) => {
    const newMaxes = { ...profiles[currentUser].maxes };
    delete newMaxes[lift];
    setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], maxes: newMaxes } }));
    await db.deleteMax(currentUser, lift);
  };

  // Equipment
  const addEquipment = () => {
    const { success, data: name } = validate(equipmentNameSchema, newEquipmentName);
    if (!success || equipment.includes(name)) return;
    setEquipment(prev => [...prev, name]);
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
    if (!currentUser) return;
    const { success, data: content } = validate(chatMessageSchema, chatInput);
    if (!success) return;
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
    const result = await db.sendMemberInvite(currentUser, targetId);
    if (!result?.success) { toast.error(result?.error || 'Failed to send invite'); return; }
    setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], sentRequests: [...(prev[currentUser].sentRequests || []), { to: targetId, name: targetName, avatar: targetAvatar, timestamp: new Date().toISOString() }] } }));
    setBuddiesSearch('');
  };

  const acceptBuddyRequest = async (requestId, requesterId, requesterName = '', requesterAvatar = '') => {
    const success = await db.acceptGroupInvite(requestId, currentUser);
    if (!success) return;
    const leaderGym = await db.getLeaderGymId(currentUser);
    if (leaderGym) {
      setLeaderGymId(leaderGym);
      const programs = await db.getAllWorkoutPrograms(leaderGym);
      if (programs.length > 0) setWorkoutProgram(programs.find(p => p.is_active)?.program_data || programs[0] || {});
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
    const success = await db.declineBuddyRequest(requestId);
    if (!success) return;
    setProfiles(prev => ({ ...prev, [currentUser]: { ...prev[currentUser], receivedRequests: (prev[currentUser].receivedRequests || []).filter(r => r.from !== requesterId) } }));
  };

  const removeBuddy = async (buddyId) => {
    const success = await db.removeBuddy(currentUser, buddyId);
    if (!success) return;
    setProfiles(prev => {
      const u = { ...prev[currentUser] };
      u.buddies = (u.buddies || []).filter(id => id !== buddyId);
      if (u.buddyProfiles) delete u.buddyProfiles[buddyId];
      return { ...prev, [currentUser]: u };
    });
  };

  const leaveWorkoutGroup = async () => {
    if (!confirm('Are you sure you want to leave the group?')) return;
    const success = await db.leaveWorkoutGroup(currentUser);
    if (!success) return;
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
    const success = await db.removeGroupMember(currentUser, memberId);
    if (!success) return;
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
    const { success, data: query } = validate(searchQuerySchema, searchTerm);
    if (!success) { setSearchResults([]); return; }
    setSearchLoading(true);
    const results = await db.searchUsers(query, currentUser);
    if (results?.rateLimited) {
      toast.error(results.error);
      setSearchResults([]);
    } else {
      setSearchResults(results);
    }
    setSearchLoading(false);
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

  if (!authUser) {
    return <LoginPage isLoading={authLoading} />;
  }

  if (showOnboarding) {
    return <Onboarding user={onboardingData} onComplete={handleOnboardingComplete} onGenerateWorkout={handleGenerateOnboardingWorkout} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <Header
        user={user}
        onSettingsClick={() => setShowSettings(true)}
        onProfileClick={() => setShowProfile(true)}
      />

      <main className="px-5 py-6">
        {activeTab === 'workout' && (
          <WorkoutScreen
            workoutProgram={workoutProgram}
            currentWeek={currentWeek}
            currentDay={currentDay}
            actualCurrentWeek={actualCurrentWeek}
            programStartDate={programStartDate}
            user={user}
            groupRole={groupRole}
            groupLeader={groupLeader}
            gymId={gymId}
            exerciseLogSize={Object.keys(exerciseLog).length}
            onPreviousWeek={() => setCurrentWeek(w => Math.max(1, w - 1))}
            onNextWeek={() => setCurrentWeek(w => Math.min(actualCurrentWeek + 1, w + 1))}
            onDayChange={setCurrentDay}
            onGoToCurrentWeek={() => {
              setCurrentWeek(actualCurrentWeek);
              setCurrentDay(getTodayDayName());
            }}
            onGenerateWorkout={openAiGenerator}
            isSetLogged={isSetLogged}
            onLogSet={logSet}
            onAddMax={openQuickAddMax}
            getCompletionPercentage={getCompletionPercentage}
            isWorkoutComplete={isWorkoutComplete}
            onToggleWorkoutComplete={toggleWorkoutComplete}
            swapState={swapState}
            onRequestSwap={requestSwap}
            onAcceptSwap={acceptSwap}
            onCancelSwap={clearSwap}
          />
        )}

        {activeTab === 'maxes' && (
          <MaxesScreen
            user={user}
            editingMax={editingMax}
            tempMaxValue={tempMaxValue}
            selectedReferenceExercise={selectedReferenceExercise}
            onSelectReference={setSelectedReferenceExercise}
            onStartEdit={(lift, weight) => { setEditingMax(lift); setTempMaxValue(weight.toString()); }}
            onSaveEdit={(lift, val) => updateMax(lift, val)}
            onCancelEdit={() => setEditingMax(null)}
            onTempValueChange={setTempMaxValue}
            onDeleteLift={deleteLift}
            onOpenAddLift={() => setShowAddLift(true)}
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
        supabase={supabase}
        onClose={() => setShowSettings(false)}
        onOpenAiGenerator={openAiGenerator}
        onOpenAdmin={openAdmin}
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
        weekCount={weekCount}
        generationContextLoading={generationContextLoading}
        trainingHistorySummary={trainingHistorySummary}
        overloadRecommendations={overloadRecommendations}
        onWeekCountChange={setWeekCount}
        previewWeek={previewWeek}
        onPreviewWeekChange={setPreviewWeek}
        onNotesChange={setAiNotes}
        onGenerate={generateAiWorkout}
        onConfirm={confirmGeneratedWorkout}
        onRegenerate={() => setGeneratedPreview(null)}
        onClose={() => setShowAiGenerator(false)}
      />

      <AddLiftModal
        isOpen={showAddLift}
        liftName={newLiftName}
        liftWeight={newLiftWeight}
        onLiftNameChange={setNewLiftName}
        onLiftWeightChange={setNewLiftWeight}
        onAdd={addNewLift}
        onClose={() => setShowAddLift(false)}
      />

      {showAdmin && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-zinc-950 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-orange-500" /></div>}>
          <AdminArea onClose={closeAdmin} db={db} />
        </Suspense>
      )}

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
        />
      )}
    </div>
  );
}
