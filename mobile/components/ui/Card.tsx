import { View, type ViewStyle } from 'react-native';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

export function Card({ children, className = '', style }: CardProps) {
  return (
    <View
      className={`bg-zinc-900 rounded-2xl p-4 ${className}`}
      style={style}
    >
      {children}
    </View>
  );
}
