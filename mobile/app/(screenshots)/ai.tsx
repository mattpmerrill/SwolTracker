import { View, Text, ScrollView } from 'react-native';
import { Sparkles, Check } from 'lucide-react-native';

const WEEK_PREVIEW = [
  { day: 'Monday',    focus: 'Lower Body — Strength',    exercises: 6 },
  { day: 'Tuesday',   focus: 'Upper Body — Hypertrophy', exercises: 7 },
  { day: 'Wednesday', focus: 'Rest Day',                  exercises: 0 },
  { day: 'Thursday',  focus: 'Full Body — Power',         exercises: 5 },
  { day: 'Friday',    focus: 'Upper Body — Strength',     exercises: 6 },
  { day: 'Saturday',  focus: 'Lower Body — Volume',       exercises: 7 },
  { day: 'Sunday',    focus: 'Rest Day',                  exercises: 0 },
];

const GOALS = ['Strength', 'Muscle', 'Fat Burn'];

export default function AiScreenshot() {
  return (
    <View className="flex-1 bg-zinc-950">
      <View className="pt-14 px-4 pb-4">
        <View className="flex-row items-center mb-1">
          <Sparkles size={22} color="#f97316" />
          <Text className="text-zinc-50 text-xl font-bold ml-2">AI Workout Generator</Text>
        </View>
        <Text className="text-zinc-500 text-sm">Your personalized 4-week program</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      >
        {/* Profile summary card */}
        <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50 mb-4">
          <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-3">
            Tailored to your profile
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {['5 days/week', '1 hour', 'Full gym', 'Intermediate'].map((tag) => (
              <View key={tag} className="flex-row items-center bg-zinc-800 px-3 py-1.5 rounded-xl">
                <Check size={12} color="#f97316" />
                <Text className="text-zinc-300 text-xs font-medium ml-1.5">{tag}</Text>
              </View>
            ))}
          </View>
          <View className="flex-row flex-wrap mt-2 gap-2">
            {GOALS.map((g) => (
              <View key={g} className="bg-orange-500/10 border border-orange-500/30 px-3 py-1.5 rounded-xl">
                <Text className="text-orange-400 text-xs font-medium">{g}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Week preview */}
        <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50 mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-zinc-50 text-base font-bold">Week 1 Preview</Text>
            <View className="bg-orange-500/10 border border-orange-500/30 px-2.5 py-1 rounded-lg">
              <Text className="text-orange-400 text-xs font-semibold">4 weeks total</Text>
            </View>
          </View>
          {WEEK_PREVIEW.map((day) => (
            <View
              key={day.day}
              className={`flex-row items-center py-2.5 border-b border-zinc-800/50 ${
                day.exercises === 0 ? 'opacity-40' : ''
              }`}
            >
              <Text className="text-zinc-400 text-sm w-28">{day.day}</Text>
              <View className="flex-1">
                <Text className={`text-sm font-medium ${
                  day.exercises === 0 ? 'text-zinc-600' : 'text-zinc-200'
                }`}>
                  {day.focus}
                </Text>
              </View>
              {day.exercises > 0 && (
                <Text className="text-zinc-500 text-xs">{day.exercises} ex</Text>
              )}
            </View>
          ))}
        </View>

        {/* CTA button mockup */}
        <View className="bg-orange-500 rounded-2xl py-4 items-center">
          <View className="flex-row items-center">
            <Sparkles size={18} color="white" />
            <Text className="text-white text-base font-bold ml-2">Generate My Program</Text>
          </View>
        </View>
      </ScrollView>

      <View className="bg-zinc-900 border-t border-zinc-800 px-6 py-5 items-center">
        <Text className="text-zinc-50 text-lg font-bold">Built by AI. Perfected by you.</Text>
        <Text className="text-zinc-400 text-sm mt-0.5">New program every week, auto-adjusted to your progress.</Text>
      </View>
    </View>
  );
}
