import { View, Text, Pressable, ScrollView } from 'react-native';
import { DAYS_OF_WEEK } from '../../../src/constants';
import { getTodayDayName } from '../../../src/utils/date';

interface DaySelectorProps {
  currentDay: string;
  currentWeek: number;
  actualCurrentWeek: number;
  onDayChange: (day: string) => void;
}

const SHORT_DAYS: Record<string, string> = {
  Monday: 'Mon',
  Tuesday: 'Tue',
  Wednesday: 'Wed',
  Thursday: 'Thu',
  Friday: 'Fri',
  Saturday: 'Sat',
  Sunday: 'Sun',
};

export function DaySelector({
  currentDay,
  currentWeek,
  actualCurrentWeek,
  onDayChange,
}: DaySelectorProps) {
  const today = getTodayDayName();
  const isViewingCurrentWeek = currentWeek === actualCurrentWeek;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      className="py-2"
    >
      {DAYS_OF_WEEK.map((day) => {
        const isSelected = currentDay === day;
        const isToday = isViewingCurrentWeek && day === today;

        return (
          <Pressable
            key={day}
            onPress={() => onDayChange(day)}
            className={`px-4 py-2.5 rounded-xl min-w-[56px] items-center ${
              isSelected
                ? 'bg-orange-500'
                : isToday
                  ? 'bg-green-500/20 border border-green-500/30'
                  : 'bg-zinc-800'
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                isSelected
                  ? 'text-white'
                  : isToday
                    ? 'text-green-400'
                    : 'text-zinc-400'
              }`}
            >
              {SHORT_DAYS[day]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
