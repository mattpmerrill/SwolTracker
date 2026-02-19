/**
 * Screenshot index — navigate to each screen in simulator, then Cmd+S to capture.
 *
 * Device: iPhone 16 Pro Max (6.7")  — required by App Store
 *
 * Usage:
 *   1. In _layout.tsx add: <Stack.Screen name="(screenshots)" />
 *   2. Navigate to /(screenshots) in simulator
 *   3. Use the links below to open each screen, then Cmd+S
 */
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';

const SCREENS = [
  { route: 'workout',    label: '1 · Workout Logging',    desc: 'Set-by-set tracking, rest timer' },
  { route: 'ai',         label: '2 · AI Programming',     desc: 'Personalized workout generation' },
  { route: 'progress',   label: '3 · Progress Charts',    desc: 'Volume & strength history' },
  { route: 'maxes',      label: '4 · Strength Tracking',  desc: '1RM library + quick reference' },
  { route: 'crew',       label: '5 · Crew Training',      desc: 'Train together, stay accountable' },
];

export default function ScreenshotIndex() {
  const router = useRouter();
  return (
    <ScrollView
      className="flex-1 bg-zinc-950"
      contentContainerStyle={{ padding: 32, paddingTop: 80 }}
    >
      <Text className="text-zinc-50 text-2xl font-bold mb-1">📸 Screenshots</Text>
      <Text className="text-zinc-500 text-sm mb-8">
        Navigate to each screen and press Cmd+S in the simulator.
      </Text>
      {SCREENS.map((s) => (
        <Pressable
          key={s.route}
          onPress={() => router.push(`/(screenshots)/${s.route}` as any)}
          className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 mb-3"
        >
          <Text className="text-zinc-50 font-semibold text-base">{s.label}</Text>
          <Text className="text-zinc-500 text-sm mt-0.5">{s.desc}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
