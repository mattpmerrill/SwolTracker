import { View } from 'react-native';

interface ProgressDotsProps {
  total: number;
  current: number;
}

export function ProgressDots({ total, current }: ProgressDotsProps) {
  return (
    <View className="flex-row items-center justify-center gap-2 py-4">
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          className={`h-1.5 rounded-full ${
            i <= current ? 'bg-orange-500 w-6' : 'bg-zinc-700 w-3'
          }`}
        />
      ))}
    </View>
  );
}
