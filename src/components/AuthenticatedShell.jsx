import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { db } from '../lib/supabase';
import { useToast } from './Toast';
import { useAdmin } from '../hooks/useAdmin';
import { useAiGenerator } from '../hooks/useAiGenerator';
import { useExerciseSwap } from '../hooks/useExerciseSwap';
import { useAgentChat } from '../hooks/useAgentChat';
import { useBuddyActions } from '../hooks/useBuddyActions';
import { useMaxesActions } from '../hooks/useMaxesActions';
import { useProfileActions } from '../hooks/useProfileActions';
import { useAppNavigation } from '../hooks/useAppNavigation';
import { useProgram, useWorkoutLog } from '../contexts';

import { Header, BottomNav } from './Layout';
import AgentChatFAB from './AgentChat/AgentChatFAB';
import ScreenRouter from './ScreenRouter';
import AppModals from './AppModals';

/**
 * Authenticated app chrome. Tab + settings/admin overlays are URL-driven
 * (see useAppNavigation). Domain state lives in ProgramContext /
 * WorkoutLogContext; this owns social, profile, and remaining modal UI state.
 */
export default function AuthenticatedShell({ authUser, signOut, bundle }) {
  const toast = useToast();
  const { isAdmin, adminChecked, checkAdmin } = useAdmin(authUser);
  const {
    activeTab,
    setActiveTab,
    showSettings,
    showAdmin,
    openSettings,
    closeSettings,
    openAdmin,
    closeAdmin,
  } = useAppNavigation();

  const {
    gymId,
    equipment,
    workoutProgram,
    setWorkoutProgram,
    programStartDate,
    setProgramStartDate,
    currentWeek,
    setCurrentWeek,
    currentDay,
    setCurrentDay,
    actualCurrentWeek,
    addEquipment,
    removeEquipment,
    goToPreviousWeek,
    goToNextWeek,
    goToCurrentWeek,
  } = useProgram();

  const {
    exerciseLog,
    logSet,
    isSetLogged,
    getCompletionPercentage,
    getTotalCompletedWorkouts,
    isWorkoutComplete,
    toggleWorkoutComplete,
    isWorkoutMissed,
    getMissedReason,
    markWorkoutMissed,
    clearWorkoutMissed,
  } = useWorkoutLog();

  const currentUser = authUser.id;

  const [profiles, setProfiles] = useState({});
  const [showProfile, setShowProfile] = useState(false);
  const [showAddEquipment, setShowAddEquipment] = useState(false);
  const [showAddLift, setShowAddLift] = useState(false);
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
  const [, setLeaderGymId] = useState(null);
  const [groupName, setGroupName] = useState('');
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [hasAgentKey, setHasAgentKey] = useState(false);

  const agentChat = useAgentChat({ currentUser, toast });

  const aiGen = useAiGenerator({
    currentUser,
    profiles,
    equipment,
    workoutProgram,
    gymId,
    toast,
    setWorkoutProgram,
    setCurrentWeek,
  });
  const { swapState, requestSwap, clearSwap } = useExerciseSwap({ equipment, currentUser, toast });
  const buddyActions = useBuddyActions({
    currentUser,
    profiles,
    setProfiles,
    groupLeader,
    setGroupLeader,
    setGroupRole,
    setLeaderGymId,
    setWorkoutProgram,
    groupMembers,
    setGroupMembers,
    setBuddiesSearch,
    setSearchResults,
    setSearchLoading,
    toast,
  });
  const maxesActions = useMaxesActions({
    currentUser,
    profiles,
    setProfiles,
    workoutProgram,
    setWorkoutProgram,
    currentWeek,
    currentDay,
    gymId,
    clearSwap,
    toast,
    setEditingMax,
    setNewLiftName,
    setNewLiftWeight,
    setShowAddLift,
    setActiveTab,
  });
  const { handleUpdateProfile, handleUploadAvatar } = useProfileActions({
    authUser,
    currentUser,
    setProfiles,
    setProgramStartDate,
    toast,
  });

  // Hydrate shell-owned social/profile state from bootstrap bundle.
  useEffect(() => {
    if (!bundle || bundle.kind === 'onboarding') return;
    setProfiles({ [bundle.userId]: bundle.profile });
    setGroupRole(bundle.groupRole);
    setGroupName(bundle.groupName);
    setGroupLeader(bundle.groupLeader);
    setGroupMembers(bundle.groupMembers);
    setLeaderGymId(bundle.leaderGymId);
    agentChat.setHasUnread(bundle.hasUnreadAgentMessages);
    agentChat.setLatestCoachNote(bundle.latestCoachNote);
    setHasAgentKey(bundle.hasAgentKey);
    checkAdmin(bundle.userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the bootstrap bundle changes
  }, [bundle, checkAdmin]);

  // Non-admins who deep-link to /admin get bounced once we know capability.
  useEffect(() => {
    if (!adminChecked) return;
    if (showAdmin && !isAdmin) closeAdmin();
  }, [showAdmin, isAdmin, adminChecked, closeAdmin]);

  const user = profiles[currentUser];

  useEffect(() => {
    if (activeTab === 'buddies' && user?.acceptedNotifications?.length > 0) {
      confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
      setProfiles((prev) => ({
        ...prev,
        [currentUser]: { ...prev[currentUser], acceptedNotifications: [] },
      }));
    }
  }, [activeTab, currentUser, user?.acceptedNotifications]);

  const handleAddEquipment = async () => {
    const result = await addEquipment(newEquipmentName);
    if (result?.ok) {
      setNewEquipmentName('');
      setShowAddEquipment(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-24">
      <Header
        user={user}
        onSettingsClick={openSettings}
        onProfileClick={() => setShowProfile(true)}
        showCoach={hasAgentKey}
        coachUnread={agentChat.hasUnread}
        onCoachClick={agentChat.open}
      />

      <main className="px-5 py-6">
        <ScreenRouter
          activeTab={activeTab}
          workoutProps={{
            workoutProgram,
            currentWeek,
            currentDay,
            actualCurrentWeek,
            programStartDate,
            user,
            groupRole,
            groupLeader,
            gymId,
            exerciseLogSize: Object.keys(exerciseLog).length,
            onPreviousWeek: goToPreviousWeek,
            onNextWeek: goToNextWeek,
            onDayChange: setCurrentDay,
            onGoToCurrentWeek: goToCurrentWeek,
            onGenerateWorkout: aiGen.openAiGenerator,
            isSetLogged,
            onLogSet: logSet,
            onAddMax: maxesActions.openQuickAddMax,
            getCompletionPercentage,
            isWorkoutComplete,
            onToggleWorkoutComplete: toggleWorkoutComplete,
            isWorkoutMissed,
            getMissedReason,
            onMarkMissed: (reason) => markWorkoutMissed(currentWeek, currentDay, reason),
            onClearMissed: () => clearWorkoutMissed(currentWeek, currentDay),
            swapState,
            onRequestSwap: requestSwap,
            onAcceptSwap: maxesActions.acceptSwap,
            onCancelSwap: clearSwap,
            latestCoachNote: agentChat.latestCoachNote,
            onOpenAgentChat: agentChat.open,
            hasAgentKey,
            coachHasUnread: agentChat.hasUnread,
            coachSending: agentChat.sending,
            onSendCoachNote: (content) => agentChat.send(content),
          }}
          maxesProps={{
            user,
            editingMax,
            tempMaxValue,
            selectedReferenceExercise,
            onSelectReference: setSelectedReferenceExercise,
            onStartEdit: (lift, weight) => {
              setEditingMax(lift);
              setTempMaxValue(weight.toString());
            },
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
            currentUser,
            user,
            profiles,
            groupRole,
            groupLeader,
            groupMembers,
            groupName,
            editingGroupName,
            buddiesSearch,
            searchResults,
            searchLoading,
            onLeaveGroup: buddyActions.leaveWorkoutGroup,
            onRemoveMember: (id) => buddyActions.removeGroupMember(
              id,
              groupMembers.find((m) => m.member_id === id)?.member_name,
            ),
            onStartEditGroupName: () => setEditingGroupName(true),
            onSaveGroupName: () => {
              db.updateProfile(currentUser, { group_name: groupName });
              setEditingGroupName(false);
            },
            onCancelEditGroupName: () => setEditingGroupName(false),
            onGroupNameChange: setGroupName,
            onAcceptInvite: buddyActions.acceptBuddyRequest,
            onDeclineInvite: buddyActions.declineBuddyRequest,
            onSearchChange: (val) => {
              setBuddiesSearch(val);
              if (val.trim()) buddyActions.searchUsersInDb(val);
              else setSearchResults([]);
            },
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
          groupRole,
          groupLeader,
          currentUser,
          userId: user?.id,
          workoutProgram,
          equipment,
          programStartDate,
          actualCurrentWeek,
          isAdmin,
          onClose: closeSettings,
          onOpenAiGenerator: aiGen.openAiGenerator,
          onOpenAdmin: openAdmin,
          onOpenEquipment: () => setShowAddEquipment(true),
          onRemoveEquipment: removeEquipment,
        }}
        equipment={{
          isOpen: showAddEquipment,
          name: newEquipmentName,
          onNameChange: setNewEquipmentName,
          onAdd: handleAddEquipment,
          onClose: () => setShowAddEquipment(false),
        }}
        aiGenerator={{
          isOpen: aiGen.showAiGenerator,
          generationWeek: aiGen.generationWeek,
          profiles,
          equipment,
          workoutProgram,
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
          user,
          authUser,
          onClose: () => setShowProfile(false),
          onUpdateProfile: handleUpdateProfile,
          onLogout: () => { setShowProfile(false); signOut(); },
          onUploadAvatar: handleUploadAvatar,
          equipment,
          programStartDate,
          actualCurrentWeek,
        } : null}
      />
    </div>
  );
}
