import { View, Text, Pressable } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { formatDate, getWeekDates } from '../../../src/utils/date';

interface WeekSelectorProps {
  currentWeek: number;
  actualCurrentWeek: number;
  programStartDate: string | null;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
}

export function WeekSelector({
  currentWeek,
  actualCurrentWeek,
  programStartDate,
  onPreviousWeek,
  onNextWeek,
}: WeekSelectorProps) {
  const weekDates = programStartDate ? getWeekDates(programStartDate, currentWeek) : null;
  const isCurrentWeek = currentWeek === actualCurrentWeek;

  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <Pressable
        onPress={onPreviousWeek}
        disabled={currentWeek <= 1}
        className={`w-10 h-10 rounded-xl items-center justify-center bg-zinc-800 ${currentWeek <= 1 ? 'opacity-30' : ''}`}
      >
        <ChevronLeft size={20} color="#a1a1aa" />
      </Pressable>

      <View className="items-center">
        <Text className="text-zinc-50 text-lg font-bold">Week {currentWeek}</Text>
        {weekDates && (
          <Text className="text-zinc-500 text-sm">
            {formatDate(weekDates.start)} - {formatDate(weekDates.end)}
          </Text>
        )}
        {isCurrentWeek && (
          <View className="bg-green-500/20 px-2 py-0.5 rounded-full mt-1">
            <Text className="text-green-400 text-xs font-semibold">Current Week</Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={onNextWeek}
        className="w-10 h-10 rounded-xl items-center justify-center bg-zinc-800"
      >
        <ChevronRight size={20} color="#a1a1aa" />
      </Pressable>
    </View>
  );
}
