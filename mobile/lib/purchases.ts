import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { Platform } from 'react-native';
import { getItem, setItem, STORAGE_KEYS } from './storage';

// Lazy-load react-native-purchases to avoid crashing if native module isn't ready
let Purchases: typeof import('react-native-purchases').default | null = null;
let LOG_LEVEL: typeof import('react-native-purchases').LOG_LEVEL | null = null;
try {
  const mod = require('react-native-purchases');
  Purchases = mod.default;
  LOG_LEVEL = mod.LOG_LEVEL;
} catch {
  // RevenueCat native module unavailable
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Set this in your environment / RevenueCat dashboard.
 * Add EXPO_PUBLIC_REVENUECAT_IOS_KEY to your .env file.
 */
const RC_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';

export const ENTITLEMENT_ID = 'pro';
export const FREE_AI_GENERATIONS = 3; // lifetime limit for free tier

// ── Init ──────────────────────────────────────────────────────────────────────

let initialized = false;

export function initPurchases(userId?: string): void {
  if (Platform.OS !== 'ios' || !RC_IOS_KEY || !Purchases) return;
  if (initialized) return;
  initialized = true;

  if (__DEV__ && LOG_LEVEL) Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: RC_IOS_KEY, appUserID: userId });
}

export async function identifyUser(userId: string): Promise<void> {
  if (Platform.OS !== 'ios' || !RC_IOS_KEY || !Purchases) return;
  try {
    await Purchases.logIn(userId);
  } catch (e) {
    console.warn('[Purchases] identify failed', e);
  }
}

export async function resetUser(): Promise<void> {
  if (Platform.OS !== 'ios' || !RC_IOS_KEY || !Purchases) return;
  try {
    await Purchases.logOut();
  } catch {/* already anonymous */}
}

// ── Subscription status ───────────────────────────────────────────────────────

/** Returns true if the user has an active Pro entitlement. */
export async function getIsProSubscriber(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !RC_IOS_KEY || !Purchases) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

// ── Offerings ─────────────────────────────────────────────────────────────────

export async function getOffering(): Promise<PurchasesOffering | null> {
  if (Platform.OS !== 'ios' || !RC_IOS_KEY || !Purchases) return null;
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current;
  } catch {
    return null;
  }
}

// ── Purchase ──────────────────────────────────────────────────────────────────

export async function purchasePackage(pkg: PurchasesPackage): Promise<boolean> {
  if (Platform.OS !== 'ios' || !RC_IOS_KEY || !Purchases) return false;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch (e: any) {
    if (!e.userCancelled) throw e;
    return false;
  }
}

// ── Restore ───────────────────────────────────────────────────────────────────

export async function restorePurchases(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !RC_IOS_KEY || !Purchases) return false;
  try {
    const info = await Purchases.restorePurchases();
    return info.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch {
    return false;
  }
}

// ── Free tier AI usage tracking ───────────────────────────────────────────────

export function getAiGenerationCount(): number {
  return getItem(STORAGE_KEYS.AI_GENERATION_COUNT) ?? 0;
}

export function incrementAiGenerationCount(): void {
  const count = getAiGenerationCount();
  setItem(STORAGE_KEYS.AI_GENERATION_COUNT, count + 1);
}

export function hasRemainingFreeAiGenerations(): boolean {
  return getAiGenerationCount() < FREE_AI_GENERATIONS;
}
