import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, Modal, Animated, Easing,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { X, SkipForward, Plus, Minus } from 'lucide-react-native';
import {
  scheduleRestTimerNotification,
  cancelRestTimerNotification,
} from '../../lib/notifications';

const PRESETS = [
  { label: '60s', seconds: 60 },
  { label: '90s', seconds: 90 },
  { label: '2min', seconds: 120 },
  { label: '3min', seconds: 180 },
];

const DEFAULT_DURATION = 90;

interface RestTimerModalProps {
  visible: boolean;
  onClose: () => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0
    ? `${m}:${s.toString().padStart(2, '0')}`
    : `${s}s`;
}

export function RestTimerModal({ visible, onClose }: RestTimerModalProps) {
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [remaining, setRemaining] = useState(DEFAULT_DURATION);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const progressAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Slide in/out + background notification
  useEffect(() => {
    if (visible) {
      setDone(false);
      setRunning(true);
      // Schedule a background notification in case user leaves the app
      scheduleRestTimerNotification(duration).catch(() => {});
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      // Cancel the background notification — timer was handled in-app
      cancelRestTimerNotification().catch(() => {});
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 250,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // Restart timer when duration changes or modal opens
  useEffect(() => {
    if (!visible) return;
    setRemaining(duration);
    setDone(false);
    setRunning(true);
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 0,
      useNativeDriver: false,
    }).start();
  }, [duration, visible]);

  // Countdown tick
  useEffect(() => {
    if (!running || !visible) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          setDone(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Auto-close after 2s
          setTimeout(onClose, 2000);
          return 0;
        }
        if (prev === 11) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running, visible]);

  // Animate progress bar
  useEffect(() => {
    if (!running || !visible) return;
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: remaining * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  }, [running, visible, duration]);

  const handleSetDuration = useCallback((secs: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setDuration(secs);
  }, []);

  const handleAdjust = useCallback((delta: number) => {
    setRemaining((prev) => {
      const next = Math.max(5, Math.min(600, prev + delta));
      // Snap the progress animation to current position
      progressAnim.stopAnimation();
      const newProgress = next / duration;
      Animated.timing(progressAnim, {
        toValue: Math.min(1, newProgress),
        duration: 0,
        useNativeDriver: false,
      }).start();
      // Restart countdown animation from new remaining time
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: next * 1000,
        easing: Easing.linear,
        useNativeDriver: false,
      }).start();
      return next;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [duration, progressAnim]);

  const handleSkip = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
  }, [onClose]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleSkip}
    >
      <View className="flex-1 justify-end">
        {/* Tap-outside to skip */}
        <Pressable className="flex-1" onPress={handleSkip} />

        <Animated.View
          style={{ transform: [{ translateY: slideAnim }] }}
          className="bg-zinc-900 rounded-t-3xl border-t border-zinc-800 px-6 pt-5 pb-12"
        >
          {/* Header */}
          <View className="flex-row items-center justify-between mb-5">
            <Text className="text-zinc-400 text-sm font-semibold uppercase tracking-wider">
              Rest
            </Text>
            <Pressable onPress={handleSkip} className="p-1">
              <X size={20} color="#71717a" />
            </Pressable>
          </View>

          {/* Countdown */}
          <View className="items-center mb-6">
            <Text
              className={`text-7xl font-bold tabular-nums ${
                done ? 'text-green-400' : remaining <= 10 ? 'text-orange-400' : 'text-zinc-50'
              }`}
            >
              {done ? 'Go!' : formatTime(remaining)}
            </Text>
          </View>

          {/* Progress bar */}
          <View className="h-2 bg-zinc-800 rounded-full mb-6 overflow-hidden">
            <Animated.View
              className="h-full rounded-full"
              style={{
                width: progressWidth,
                backgroundColor: done ? '#4ade80' : remaining <= 10 ? '#f97316' : '#3b82f6',
              }}
            />
          </View>

          {/* Presets */}
          <View className="flex-row justify-between mb-5">
            {PRESETS.map((p) => (
              <Pressable
                key={p.seconds}
                onPress={() => handleSetDuration(p.seconds)}
                className={`flex-1 mx-1 py-2 rounded-xl items-center border ${
                  duration === p.seconds
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-zinc-700 bg-zinc-800'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    duration === p.seconds ? 'text-blue-400' : 'text-zinc-400'
                  }`}
                >
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Controls */}
          <View className="flex-row items-center justify-between">
            {/* -15s */}
            <Pressable
              onPress={() => handleAdjust(-15)}
              className="flex-row items-center bg-zinc-800 px-4 py-3 rounded-xl border border-zinc-700"
            >
              <Minus size={16} color="#a1a1aa" />
              <Text className="text-zinc-400 text-sm font-semibold ml-1">15s</Text>
            </Pressable>

            {/* Skip */}
            <Pressable
              onPress={handleSkip}
              className="flex-row items-center bg-zinc-800 px-6 py-3 rounded-xl border border-zinc-700"
            >
              <SkipForward size={18} color="#a1a1aa" />
              <Text className="text-zinc-400 text-sm font-semibold ml-2">Skip</Text>
            </Pressable>

            {/* +15s */}
            <Pressable
              onPress={() => handleAdjust(15)}
              className="flex-row items-center bg-zinc-800 px-4 py-3 rounded-xl border border-zinc-700"
            >
              <Plus size={16} color="#a1a1aa" />
              <Text className="text-zinc-400 text-sm font-semibold ml-1">15s</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
