import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import confetti from 'canvas-confetti';
import { supabase, db } from './lib/supabase';
import { useToast } from './components/Toast';
import { useAdmin } from './hooks/useAdmin';
import { useAiGenerator } from './hooks/useAiGenerator';
import { useWorkoutLogger } from './hooks/useWorkoutLogger';
import { useExerciseSwap } from './hooks/useExerciseSwap';
import { useSession } from './hooks/useSession';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useAgentChat } from './hooks/useAgentChat';
import { useBuddyActions } from './hooks/useBuddyActions';
import { useOnboardingActions } from './hooks/useOnboardingActions';
import { useMaxesActions } from './hooks/useMaxesActions';
import { useProfileActions } from './hooks/useProfileActions';
import { validate, equipmentNameSchema } from './lib/validation';

import LoginPage from './components/LoginPage';
import OnboardingRouter from './components/OnboardingRouter';
import { Header, BottomNav } from './components/Layout';
import AgentChatFAB from './components/AgentChat/AgentChatFAB';
import ScreenRouter from './components/ScreenRouter';
import AppModals from './components/AppModals';

import { defaultEquipment } from './constants';
import { calculateCurrentWeek, getTodayDayName } from './utils/date';

export default function SwolTracker() {
  const toast = useToast();
  const { authUser, authLoading, signOut } = useSession();
  const { isAdmin, showAdmin, checkAdmin, openAdmin, closeAdmin } = useAdmin(authUser);
  const { isLoading, bundle, onboarding } = useAppBootstrap(authUser);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingData, setOnboardingData] = useState(null);

  const [profiles, setProfiles] = useState({});
  const [currentUser, setCurrentUser] = useState(null);
  const [equipment, setEquipment] = useState(defaultEquipment);
  const [workoutProgram, setWorkoutProgram] = useState({});
  const [programStartDate, setProgramStartDate] = useState(() => new Date().toISOString());
  const [currentWeek, setCurrentWeek] = useState(1);
  const [currentDay, setCurrentDay] = useState(getTodayDayName);
  const [activeTab, setActiveTab] = useState('workout');
  const [gymId, setGymId] = useState(null);

  const [showProfile, setShowProfile] = useState(false);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [showAddLift, setShowAddLift] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newEquipmentName, setNewEquipmentName] = useState('');
  const [newLiftName, setNewLiftName] = useState('');
  const [newLiftWeight, setNewLiftWeight] = useState('');
  const [editingMax, setEditingMax] = useState(null);
  const [tempMaxValue, setTempMaxValue] = useState('');
  const [selectedReferenceExercise, setSelectedReferenceExercise] = useState('Bench Press');

  const [buddiesSearch, setBuddiesSearch] = useState('');
  const [groupRole, setGroupRole] = useState('independent');
  const [groupMembers, setGroupMembers] = useState([]);
  const [groupLeader, setGroupLeader] = useState(null);
  const [leaderGymId, setLeaderGymId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasAgentKey, setHasAgentKey] = useState(false);
  const agentChat = useAgentChat({ currentUser, toast });

  const {
    exerciseLog, setExerciseLog,
    completedWorkouts, setCompletedWorkouts,
    logSet, isSetLogged, getCompletionPercentage,
    getTotalCompletedWorkouts,
    isWorkoutComplete, toggleWorkoutComplete,
  } = useWorkoutLogger({ currentUser, currentWeek, currentDay, workoutProgram, gymId });

  const aiGen = useAiGenerator({ currentUser, profiles, equipment, workoutProgram, gymId, toast, setWorkoutProgram, setCurrentWeek });
  const { swapState, requestSwap, clearSwap } = useExerciseSwap({ equipment, currentUser, toast });
  const buddyActions = useBuddyActions({
    currentUser, profiles, setProfiles, groupLeader, setGroupLeader,
    setGroupRole, setLeaderGymId, setWorkoutProgram, groupMembers, setGroupMembers,
    setBuddiesSearch, setSearchResults, setSearchLoading, toast,
  });
  const { handleGenerateOnboardingWorkout, handlePrepareForAgent } = useOnboardingActions({ authUser, gymId, setGymId });
  const maxesActions = useMaxesActions({
    currentUser, profiles, setProfiles, workoutProgram, setWorkoutProgram,
    currentWeek, currentDay, gymId, clearSwap, toast,
    setEditingMax, setNewLiftName, setNewLiftWeight, setShowAddLift, setActiveTab,
  });
  const { handleUpdateProfile, handleUploadAvatar } = useProfileActions({
    authUser, currentUser, setProfiles, setProgramStartDate, toast,
  });

  // Wire bootstrap bundle → local state. Runs once when the bundle resolves.
  useEffect(() => {
    if (onboarding) {
      setOnboardingData(onboarding);
      setShowOnboarding(true);
      return;
    }
    if (!bundle) return;

    setCurrentUser(bundle.userId);
    setProfiles({ [bundle.userId]: bundle.profile });
    setGroupRole(bundle.groupRole);
    setGroupName(bundle.groupName);
    setGroupLeader(bundle.groupLeader);
    setGroupMembers(bundle.groupMembers);
    setLeaderGymId(bundle.leaderGymId);
    setGymId(bundle.gymId);
    if (bundle.equipment) setEquipment(bundle.equipment);
    setProgramStartDate(bundle.programStartDate);
    setCurrentWeek(bundle.currentWeek);
    setWorkoutProgram(bundle.workoutProgram);
    setExerciseLog(bundle.exerciseLog);
    setCompletedWorkouts(bundle.completedWorkouts);
    agentChat.setHasUnread(bundle.hasUnreadAgentMessages);
    agentChat.setLatestCoachNote(bundle.latestCoachNote);
    setHasAgentKey(bundle.hasAgentKey);
    checkAdmin(bundle.userId);
  }, [bundle, onboarding]);

  const user = profiles[currentUser];
  useEffect(() => {
    if (activeTab === 'buddies' && user?.acceptedNotifications?.length > 0) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      setProfiles((prev) => ({ ...prev, [currentUser]: { ...prev[currentUser], acceptedNotifications: [] } }));
    }
  }, [activeTab, currentUser, user?.acceptedNotifications]);

  const actualCurrentWeek = calculateCurrentWeek(programStartDate);

  const addEquipment = () => {
    const { success, data: name } = validate(equipmentNameSchema, newEquipmentName);
    if (!success || equipment.includes(name)) return;
    setEquipment((prev) => [...prev, name]);
    setNewEquipmentName('');
    setShowAddEquipment(false);
  };
  const removeEquipment = (item) => setEquipment((prev) => prev.filter((e) => e !== item));

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    if (authUser) window.location.reload();
  };

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

  if (!authUser) return <LoginPage isLoading={authLoading} />;

  if (showOnboarding) {
    return (
      <OnboardingRouter
        user={onboardingData}
        onComplete={handleOnboardingComplete}
        onGenerateWorkout={handleGenerateOnboardingWorkout}
        onPrepareForAgent={handlePrepareForAgent}
        supabase={supabase}
        db={db}
      />
    );
  }

  const maxWeekInProgram = Math.max(...Object.keys(workoutProgram || {}).map(Number).filter(Number.isFinite), actualCurrentWeek);

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <Header user={user} onSettingsClick={() => setShowSettings(true)} onProfileClick={() => setShowProfile(true)} />

      <main className="px-5 py-6">
        <ScreenRouter
          activeTab={activeTab}
          workoutProps={{
            workoutProgram, currentWeek, currentDay, actualCurrentWeek, programStartDate,
            user, groupRole, groupLeader, gymId,
            exerciseLogSize: Object.keys(exerciseLog).length,
            onPreviousWeek: () => setCurrentWeek((w) => Math.max(1, w - 1)),
            onNextWeek: () => setCurrentWeek((w) => Math.min(maxWeekInProgram, w + 1)),
            onDayChange: setCurrentDay,
            onGoToCurrentWeek: () => { setCurrentWeek(actualCurrentWeek); setCurrentDay(getTodayDayName()); },
            onGenerateWorkout: aiGen.openAiGenerator,
            isSetLogged, onLogSet: logSet, onAddMax: maxesActions.openQuickAddMax,
            getCompletionPercentage, isWorkoutComplete, onToggleWorkoutComplete: toggleWorkoutComplete,
            swapState, onRequestSwap: requestSwap, onAcceptSwap: maxesActions.acceptSwap, onCancelSwap: clearSwap,
            latestCoachNote: agentChat.latestCoachNote, onOpenAgentChat: agentChat.open,
          }}
          maxesProps={{
            user, editingMax, tempMaxValue, selectedReferenceExercise,
            onSelectReference: setSelectedReferenceExercise,
            onStartEdit: (lift, weight) => { setEditingMax(lift); setTempMaxValue(weight.toString()); },
            onSaveEdit: (lift, val) => maxesActions.updateMax(lift, val),
            onCancelEdit: () => setEditingMax(null),
            onTempValueChange: setTempMaxValue,
            onDeleteLift: maxesActions.deleteLift,
            onOpenAddLift: () => setShowAddLift(true),
          }}
          progressProps={{
            user,
            totalCompletedWorkouts: getTotalCompletedWorkouts(user?.id),
            weeksProgrammed: Object.keys(workoutProgram).length,
          }}
          buddiesProps={{
            currentUser, user, profiles, groupRole, groupLeader, groupMembers, groupName,
            editingGroupName, buddiesSearch, searchResults, searchLoading,
            onLeaveGroup: buddyActions.leaveWorkoutGroup,
            onRemoveMember: (id) => buddyActions.removeGroupMember(id, groupMembers.find((m) => m.member_id === id)?.member_name),
            onStartEditGroupName: () => setEditingGroupName(true),
            onSaveGroupName: () => { db.updateProfile(currentUser, { group_name: groupName }); setEditingGroupName(false); },
            onCancelEditGroupName: () => setEditingGroupName(false),
            onGroupNameChange: setGroupName,
            onAcceptInvite: buddyActions.acceptBuddyRequest,
            onDeclineInvite: buddyActions.declineBuddyRequest,
            onSearchChange: (val) => { setBuddiesSearch(val); if (val.trim()) buddyActions.searchUsersInDb(val); else setSearchResults([]); },
            onSendInvite: buddyActions.sendBuddyRequest,
            onRemoveBuddy: buddyActions.removeBuddy,
          }}
        />
      </main>

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} user={user} />

      {hasAgentKey && <AgentChatFAB hasUnread={agentChat.hasUnread} onClick={agentChat.open} />}

      <AppModals
        agentChat={agentChat}
        settings={{
          isOpen: showSettings,
          groupRole, groupLeader, currentUser, userId: user?.id,
          workoutProgram, equipment, programStartDate, actualCurrentWeek, isAdmin,
          onClose: () => setShowSettings(false),
          onOpenAiGenerator: aiGen.openAiGenerator,
          onOpenAdmin: openAdmin,
          onOpenEquipment: () => setShowAddEquipment(true),
          onRemoveEquipment: removeEquipment,
        }}
        equipment={{
          isOpen: showAddEquipment,
          name: newEquipmentName,
          onNameChange: setNewEquipmentName,
          onAdd: addEquipment,
          onClose: () => setShowAddEquipment(false),
        }}
        aiGenerator={{
          isOpen: aiGen.showAiGenerator,
          generationWeek: aiGen.generationWeek,
          profiles, equipment, workoutProgram,
          aiNotes: aiGen.aiNotes,
          aiLoading: aiGen.aiLoading,
          aiError: aiGen.aiError,
          generatedPreview: aiGen.generatedPreview,
          weekCount: aiGen.weekCount,
          generationContextLoading: aiGen.generationContextLoading,
          trainingHistorySummary: aiGen.trainingHistorySummary,
          overloadRecommendations: aiGen.overloadRecommendations,
          onWeekCountChange: aiGen.setWeekCount,
          previewWeek: aiGen.previewWeek,
          onPreviewWeekChange: aiGen.setPreviewWeek,
          onNotesChange: aiGen.setAiNotes,
          onGenerate: aiGen.generateAiWorkout,
          onConfirm: aiGen.confirmGeneratedWorkout,
          onRegenerate: () => aiGen.setGeneratedPreview(null),
          onClose: () => aiGen.setShowAiGenerator(false),
        }}
        addLift={{
          isOpen: showAddLift,
          name: newLiftName,
          weight: newLiftWeight,
          onNameChange: setNewLiftName,
          onWeightChange: setNewLiftWeight,
          onAdd: () => maxesActions.addNewLift(newLiftName, newLiftWeight),
          onClose: () => setShowAddLift(false),
        }}
        admin={{ isOpen: showAdmin, onClose: closeAdmin }}
        profile={showProfile ? {
          user, authUser,
          onClose: () => setShowProfile(false),
          onUpdateProfile: handleUpdateProfile,
          onLogout: () => { setShowProfile(false); signOut(); },
          onUploadAvatar: handleUploadAvatar,
          equipment, programStartDate, actualCurrentWeek,
        } : null}
      />
    </div>
  );
}
