import { View, Text, Pressable, Alert, Platform } from 'react-native';
import { useState } from 'react';
import { Dumbbell } from 'lucide-react-native';
import { signInWithGoogle, signInWithApple } from '../../lib/auth';
import { Button } from '../../components/ui';

export default function LoginScreen() {
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);

  const handleGoogleSignIn = async () => {
    try {
      setLoading('google');
      await signInWithGoogle();
    } catch (error: any) {
      Alert.alert('Sign In Failed', error.message || 'Could not sign in with Google');
    } finally {
      setLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading('apple');
      await signInWithApple();
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Sign In Failed', error.message || 'Could not sign in with Apple');
    } finally {
      setLoading(null);
    }
  };

  return (
    <View className="flex-1 bg-zinc-950 items-center justify-center px-8">
      {/* Logo */}
      <View className="items-center mb-12">
        <View className="w-20 h-20 bg-orange-500 rounded-3xl items-center justify-center mb-4">
          <Dumbbell size={40} color="white" />
        </View>
        <Text className="text-zinc-50 text-4xl font-bold">SwolTracker</Text>
        <Text className="text-zinc-400 text-base mt-2">Track. Lift. Grow.</Text>
      </View>

      {/* Sign In Buttons */}
      <View className="w-full gap-3">
        <Button
          title={loading === 'google' ? 'Signing in...' : 'Continue with Google'}
          onPress={handleGoogleSignIn}
          variant="secondary"
          size="lg"
          loading={loading === 'google'}
          disabled={loading !== null}
        />

        {Platform.OS === 'ios' && (
          <Button
            title={loading === 'apple' ? 'Signing in...' : 'Continue with Apple'}
            onPress={handleAppleSignIn}
            variant="secondary"
            size="lg"
            loading={loading === 'apple'}
            disabled={loading !== null}
          />
        )}
      </View>

      {/* Footer */}
      <Text className="text-zinc-600 text-xs mt-8 text-center">
        By continuing, you agree to our Terms of Service and Privacy Policy
      </Text>
    </View>
  );
}
