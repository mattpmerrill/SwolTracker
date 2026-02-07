import { create } from 'zustand';
import { db } from '../lib/db';

interface SocialState {
  buddies: any[];
  receivedRequests: any[];
  sentRequests: any[];
  groupRole: string | null;
  groupMembers: any[];

  // Actions
  setBuddies: (buddies: any[]) => void;
  loadSocialData: (userId: string) => Promise<void>;
  searchUsers: (query: string, userId: string) => Promise<any[]>;
  sendBuddyRequest: (senderId: string, receiverId: string) => Promise<void>;
  acceptBuddyRequest: (requestId: string, userId: string) => Promise<void>;
  declineBuddyRequest: (requestId: string, userId: string) => Promise<void>;
  removeBuddy: (requestId: string) => Promise<void>;

  // Group actions
  loadGroupData: (userId: string, gymId: string) => Promise<void>;
  sendGroupInvite: (senderId: string, receiverId: string, gymId: string) => Promise<void>;
  acceptGroupInvite: (requestId: string, userId: string, gymId: string) => Promise<void>;
  leaveGroup: (userId: string, gymId: string) => Promise<void>;
  removeGroupMember: (userId: string, gymId: string, memberId: string) => Promise<void>;

  reset: () => void;
}

export const useSocialStore = create<SocialState>((set, get) => ({
  buddies: [],
  receivedRequests: [],
  sentRequests: [],
  groupRole: null,
  groupMembers: [],

  setBuddies: (buddies) => set({ buddies }),

  loadSocialData: async (userId) => {
    try {
      const [buddies, received, sent] = await Promise.all([
        db.getBuddies(userId),
        db.getReceivedRequests(userId),
        db.getSentRequests(userId),
      ]);
      set({
        buddies: buddies || [],
        receivedRequests: received || [],
        sentRequests: sent || [],
      });
    } catch (error) {
      console.error('Failed to load social data:', error);
    }
  },

  searchUsers: async (query, userId) => {
    return await db.searchUsers(query, userId) || [];
  },

  sendBuddyRequest: async (senderId, receiverId) => {
    await db.sendBuddyRequest(senderId, receiverId);
    await get().loadSocialData(senderId);
  },

  acceptBuddyRequest: async (requestId, userId) => {
    await db.acceptBuddyRequest(requestId, userId);
    await get().loadSocialData(userId);
  },

  declineBuddyRequest: async (requestId, userId) => {
    await db.declineBuddyRequest(requestId, userId);
    await get().loadSocialData(userId);
  },

  removeBuddy: async (requestId) => {
    await db.removeBuddy(requestId);
  },

  loadGroupData: async (userId, gymId) => {
    try {
      const [role, members] = await Promise.all([
        db.getGroupRole(userId, gymId),
        db.getGroupMembers(gymId),
      ]);
      set({
        groupRole: role,
        groupMembers: members || [],
      });
    } catch (error) {
      console.error('Failed to load group data:', error);
    }
  },

  sendGroupInvite: async (senderId, receiverId, gymId) => {
    await db.sendMemberInvite(senderId, receiverId, gymId);
  },

  acceptGroupInvite: async (requestId, userId, gymId) => {
    await db.acceptGroupInvite(requestId, userId, gymId);
    await get().loadGroupData(userId, gymId);
  },

  leaveGroup: async (userId, gymId) => {
    await db.leaveWorkoutGroup(userId, gymId);
  },

  removeGroupMember: async (userId, gymId, memberId) => {
    await db.removeGroupMember(userId, gymId, memberId);
    await get().loadGroupData(userId, gymId);
  },

  reset: () => set({
    buddies: [],
    receivedRequests: [],
    sentRequests: [],
    groupRole: null,
    groupMembers: [],
  }),
}));
