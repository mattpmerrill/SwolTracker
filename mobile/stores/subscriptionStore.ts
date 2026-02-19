import { create } from 'zustand';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import {
  getIsProSubscriber,
  getOffering,
  purchasePackage as doPurchase,
  restorePurchases as doRestore,
  FREE_AI_GENERATIONS,
  getAiGenerationCount,
} from '../lib/purchases';

interface SubscriptionState {
  isPro: boolean;
  isLoading: boolean;
  offering: PurchasesOffering | null;
  showPaywall: boolean;

  // Derived free-tier status
  aiGenerationsUsed: number;
  aiGenerationsRemaining: number;
  canUseAi: boolean;

  // Actions
  checkSubscription: () => Promise<void>;
  loadOffering: () => Promise<void>;
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
  restore: () => Promise<boolean>;
  openPaywall: () => void;
  closePaywall: () => void;
  refreshAiCount: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  isPro: false,
  isLoading: true,
  offering: null,
  showPaywall: false,
  aiGenerationsUsed: getAiGenerationCount(),
  aiGenerationsRemaining: Math.max(0, FREE_AI_GENERATIONS - getAiGenerationCount()),
  canUseAi: false, // set correctly after checkSubscription

  checkSubscription: async () => {
    set({ isLoading: true });
    const isPro = await getIsProSubscriber();
    const used = getAiGenerationCount();
    set({
      isPro,
      isLoading: false,
      aiGenerationsUsed: used,
      aiGenerationsRemaining: Math.max(0, FREE_AI_GENERATIONS - used),
      canUseAi: isPro || used < FREE_AI_GENERATIONS,
    });
  },

  loadOffering: async () => {
    const offering = await getOffering();
    set({ offering });
  },

  purchase: async (pkg) => {
    set({ isLoading: true });
    try {
      const success = await doPurchase(pkg);
      if (success) {
        set({ isPro: true, canUseAi: true, showPaywall: false });
      }
      return success;
    } finally {
      set({ isLoading: false });
    }
  },

  restore: async () => {
    set({ isLoading: true });
    try {
      const isPro = await doRestore();
      if (isPro) set({ isPro: true, canUseAi: true, showPaywall: false });
      return isPro;
    } finally {
      set({ isLoading: false });
    }
  },

  openPaywall: () => set({ showPaywall: true }),
  closePaywall: () => set({ showPaywall: false }),

  refreshAiCount: () => {
    const { isPro } = get();
    const used = getAiGenerationCount();
    set({
      aiGenerationsUsed: used,
      aiGenerationsRemaining: Math.max(0, FREE_AI_GENERATIONS - used),
      canUseAi: isPro || used < FREE_AI_GENERATIONS,
    });
  },
}));
