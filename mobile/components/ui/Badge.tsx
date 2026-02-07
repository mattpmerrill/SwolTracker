import { View, Text } from 'react-native';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'orange';

interface BadgeProps {
  text: string;
  variant?: BadgeVariant;
  className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  default: { bg: 'bg-zinc-800', text: 'text-zinc-300' },
  success: { bg: 'bg-green-500/20', text: 'text-green-400' },
  warning: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  danger: { bg: 'bg-red-500/20', text: 'text-red-400' },
  orange: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
};

export function Badge({ text, variant = 'default', className = '' }: BadgeProps) {
  const v = variantStyles[variant];
  return (
    <View className={`px-2.5 py-1 rounded-full ${v.bg} ${className}`}>
      <Text className={`text-xs font-semibold ${v.text}`}>{text}</Text>
    </View>
  );
}
