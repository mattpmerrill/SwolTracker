import '../global.css';

import { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

// Keep the splash screen visible until auth state is known
SplashScreen.preventAutoHideAsync();
import { initPurchases, identifyUser } from '../lib/purchases';
import { useSubscriptionStore } from '../stores/subscriptionStore';

// Show notifications even when app is foregrounded (guard for simulator builds)
try {
  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
} catch {
  // expo-notifications native module unavailable (simulator without push entitlements)
}

function RootLayoutNav() {
  const { user, loading, initialized } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { checkSubscription, loadOffering } = useSubscriptionStore();

  // Hide splash once auth state is known
  useEffect(() => {
    if (initialized) {
      SplashScreen.hideAsync();
    }
  }, [initialized]);

  // Auth routing
  useEffect(() => {
    if (!initialized) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, initialized, segments]);

  // Init RevenueCat and check subscription when user is known
  useEffect(() => {
    if (!initialized) return;
    if (user?.id) {
      initPurchases(user.id);
      identifyUser(user.id).catch(() => {});
    } else {
      initPurchases();
    }
    checkSubscription();
    loadOffering();
  }, [user?.id, initialized]);

  if (!initialized) {
    return (
      <View style={{ flex: 1, backgroundColor: '#09090b', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#f97316', fontSize: 32, fontWeight: '800', marginBottom: 16 }}>
          SwolTracker
        </Text>
        <ActivityIndicator size="large" color="#f97316" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#09090b' },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="(modals)"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="(screenshots)" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#09090b' }}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
