import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, ActivityIndicator,
  Alert, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { X, Check, Sparkles, TrendingUp, Heart, Zap } from 'lucide-react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { useSubscriptionStore } from '../../stores/subscriptionStore';
import { FREE_AI_GENERATIONS } from '../../lib/purchases';

// ── Feature list ──────────────────────────────────────────────────────────────

const PRO_FEATURES = [
  {
    icon: Sparkles,
    color: '#f97316',
    title: 'Unlimited AI Programs',
    desc: `Free tier includes ${FREE_AI_GENERATIONS} generations lifetime`,
  },
  {
    icon: TrendingUp,
    color: '#3b82f6',
    title: 'Full Progress Charts',
    desc: 'Volume trends, 1RM history, weekly analytics',
  },
  {
    icon: Heart,
    color: '#ef4444',
    title: 'Apple Health Sync',
    desc: 'Sync workouts & read body weight automatically',
  },
  {
    icon: Zap,
    color: '#a855f7',
    title: 'Priority Everything',
    desc: 'Faster AI generation, early access to new features',
  },
];

// ── Plan card ─────────────────────────────────────────────────────────────────

function PlanCard({
  pkg,
  selected,
  onPress,
}: {
  pkg: PurchasesPackage;
  selected: boolean;
  onPress: () => void;
}) {
  const isAnnual = pkg.packageType === 'ANNUAL';
  const price = pkg.product.priceString;

  // For annual, show monthly equivalent
  const monthlyEquiv = isAnnual
    ? `${(pkg.product.price / 12).toLocaleString('en-US', {
        style: 'currency',
        currency: pkg.product.currencyCode,
        minimumFractionDigits: 2,
      })}/mo`
    : null;

  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-2xl border p-4 ${
        selected
          ? 'border-orange-500 bg-orange-500/10'
          : 'border-zinc-700 bg-zinc-800/60'
      }`}
    >
      {isAnnual && (
        <View className="absolute -top-3 left-1/2 -translate-x-1/2">
          <View className="bg-orange-500 px-3 py-0.5 rounded-full">
            <Text className="text-white text-xs font-bold">BEST VALUE</Text>
          </View>
        </View>
      )}

      <View className={`w-5 h-5 rounded-full border-2 mb-3 items-center justify-center ${
        selected ? 'border-orange-500 bg-orange-500' : 'border-zinc-600'
      }`}>
        {selected && <Check size={12} color="white" strokeWidth={3} />}
      </View>

      <Text className={`text-base font-bold ${selected ? 'text-zinc-50' : 'text-zinc-300'}`}>
        {isAnnual ? 'Annual' : 'Monthly'}
      </Text>

      <Text className={`text-2xl font-bold mt-1 ${selected ? 'text-zinc-50' : 'text-zinc-300'}`}>
        {price}
      </Text>

      {monthlyEquiv ? (
        <Text className="text-zinc-500 text-xs mt-0.5">{monthlyEquiv} · billed annually</Text>
      ) : (
        <Text className="text-zinc-500 text-xs mt-0.5">billed monthly</Text>
      )}
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function PaywallModal() {
  const router = useRouter();
  const { offering, loadOffering, purchase, restore, isLoading } = useSubscriptionStore();

  const [selectedPkg, setSelectedPkg] = useState<PurchasesPackage | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    loadOffering().then(() => {
      // Default to annual package if available
      const annual = offering?.availablePackages?.find(
        (p) => p.packageType === 'ANNUAL'
      );
      if (annual) setSelectedPkg(annual);
    });
  }, []);

  // Update selected when offering loads
  useEffect(() => {
    if (!offering || selectedPkg) return;
    const annual = offering.availablePackages.find((p) => p.packageType === 'ANNUAL');
    setSelectedPkg(annual ?? offering.availablePackages[0] ?? null);
  }, [offering]);

  const handlePurchase = async () => {
    if (!selectedPkg) return;
    setPurchasing(true);
    try {
      await purchase(selectedPkg);
      router.back();
    } catch (e: any) {
      Alert.alert('Purchase Failed', e.message || 'Something went wrong. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restore();
      if (restored) {
        Alert.alert('Purchases Restored', 'Your Pro subscription has been restored!', [
          { text: 'OK', onPress: () => router.back() },
        ]);
      } else {
        Alert.alert('No Purchases Found', 'No active subscription found for this Apple ID.');
      }
    } catch {
      Alert.alert('Error', 'Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const packages = offering?.availablePackages ?? [];
  const annualPkg = packages.find((p) => p.packageType === 'ANNUAL');
  const monthlyPkg = packages.find((p) => p.packageType === 'MONTHLY');
  const displayPackages = [annualPkg, monthlyPkg].filter(Boolean) as PurchasesPackage[];

  // Calculate savings % for annual vs monthly
  let savingsPct: number | null = null;
  if (annualPkg && monthlyPkg) {
    const annualAsMonthly = annualPkg.product.price / 12;
    savingsPct = Math.round((1 - annualAsMonthly / monthlyPkg.product.price) * 100);
  }

  return (
    <View className="flex-1 bg-zinc-950">
      {/* Header */}
      <View className="pt-14 px-4 pb-2 flex-row items-start justify-between">
        <View className="flex-1 mr-4">
          <View className="flex-row items-center mb-2">
            <View className="bg-orange-500 px-2.5 py-0.5 rounded-lg mr-2">
              <Text className="text-white text-xs font-bold uppercase tracking-wide">Pro</Text>
            </View>
          </View>
          <Text className="text-zinc-50 text-3xl font-bold leading-tight">
            Train smarter.{'\n'}Get stronger.
          </Text>
          <Text className="text-zinc-400 text-sm mt-2">
            Unlock the full SwolTracker experience.
          </Text>
        </View>
        <Pressable onPress={() => router.back()} className="p-2 mt-1">
          <X size={22} color="#71717a" />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Features */}
        <View className="bg-zinc-900 rounded-2xl border border-zinc-800/50 overflow-hidden mb-4">
          {PRO_FEATURES.map((f, i) => (
            <View
              key={f.title}
              className={`flex-row items-center px-4 py-3.5 ${
                i < PRO_FEATURES.length - 1 ? 'border-b border-zinc-800/50' : ''
              }`}
            >
              <View
                className="w-9 h-9 rounded-xl items-center justify-center mr-3"
                style={{ backgroundColor: `${f.color}20` }}
              >
                <f.icon size={18} color={f.color} />
              </View>
              <View className="flex-1">
                <Text className="text-zinc-100 text-sm font-semibold">{f.title}</Text>
                <Text className="text-zinc-500 text-xs mt-0.5">{f.desc}</Text>
              </View>
              <Check size={16} color="#f97316" />
            </View>
          ))}
        </View>

        {/* Plan selector */}
        {isLoading && !offering ? (
          <View className="items-center py-8">
            <ActivityIndicator color="#f97316" />
          </View>
        ) : displayPackages.length > 0 ? (
          <>
            <View className="flex-row gap-3 mb-2 mt-2">
              {displayPackages.map((pkg) => (
                <PlanCard
                  key={pkg.identifier}
                  pkg={pkg}
                  selected={selectedPkg?.identifier === pkg.identifier}
                  onPress={() => setSelectedPkg(pkg)}
                />
              ))}
            </View>
            {savingsPct && (
              <Text className="text-green-400 text-xs text-center mt-1 mb-4">
                Save {savingsPct}% with annual billing
              </Text>
            )}
          </>
        ) : (
          // No offerings — RevenueCat not configured yet
          <View className="bg-zinc-900 rounded-2xl border border-zinc-800/50 p-6 items-center mb-4">
            <Sparkles size={32} color="#f97316" />
            <Text className="text-zinc-50 text-base font-bold mt-3 text-center">
              Subscriptions Coming Soon
            </Text>
            <Text className="text-zinc-500 text-sm text-center mt-1">
              Pro features are available. Configure your RevenueCat API key to enable purchasing.
            </Text>
          </View>
        )}

        {/* CTA */}
        <Pressable
          onPress={handlePurchase}
          disabled={purchasing || !selectedPkg || displayPackages.length === 0}
          className={`rounded-2xl py-4 items-center mb-3 ${
            selectedPkg && displayPackages.length > 0
              ? 'bg-orange-500'
              : 'bg-zinc-800'
          }`}
        >
          {purchasing ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white text-base font-bold">
              {selectedPkg ? `Start Pro · ${selectedPkg.product.priceString}` : 'Start Pro'}
            </Text>
          )}
        </Pressable>

        {/* Restore */}
        <Pressable onPress={handleRestore} disabled={restoring} className="items-center py-2 mb-2">
          {restoring ? (
            <ActivityIndicator size="small" color="#71717a" />
          ) : (
            <Text className="text-zinc-500 text-sm underline">Restore Purchases</Text>
          )}
        </Pressable>

        {/* Legal */}
        <Text className="text-zinc-600 text-xs text-center leading-relaxed">
          Payment will be charged to your Apple ID. Subscription renews automatically unless
          cancelled at least 24 hours before the end of the current period.{' '}
          <Text
            className="underline"
            onPress={() => Linking.openURL('https://swoltracker.app/privacy')}
          >
            Privacy Policy
          </Text>
          {' · '}
          <Text
            className="underline"
            onPress={() => Linking.openURL('https://swoltracker.app/terms')}
          >
            Terms of Use
          </Text>
        </Text>
      </ScrollView>
    </View>
  );
}
