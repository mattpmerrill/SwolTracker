import { View, Text, Pressable } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { formatDate, getWeekDates } from '../../../src/utils/date';

interface WeekSelectorProps {
  currentWeek: number;
  actualCurrentWeek: number;
  programStartDate: string | null;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
}

export function WeekSelector({
  currentWeek,
  actualCurrentWeek,
  programStartDate,
  canGoPrevious = true,
  canGoNext = true,
  onPreviousWeek,
  onNextWeek,
}: WeekSelectorProps) {
  const weekDates = programStartDate ? getWeekDates(programStartDate, currentWeek) : null;
  const isCurrentWeek = currentWeek === actualCurrentWeek;

  return (
    <View className="flex-row items-center justify-between px-4 py-3">
      <Pressable
        onPress={onPreviousWeek}
        disabled={!canGoPrevious}
        className={`w-10 h-10 rounded-xl items-center justify-center bg-zinc-800 ${!canGoPrevious ? 'opacity-30' : ''}`}
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
        disabled={!canGoNext}
        className={`w-10 h-10 rounded-xl items-center justify-center bg-zinc-800 ${!canGoNext ? 'opacity-30' : ''}`}
      >
        <ChevronRight size={20} color="#a1a1aa" />
      </Pressable>
    </View>
  );
}
