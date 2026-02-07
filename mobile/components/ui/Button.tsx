import { Pressable, Text, ActivityIndicator, type ViewStyle, type TextStyle } from 'react-native';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

const variantStyles: Record<ButtonVariant, { bg: string; pressed: string; text: string }> = {
  primary: { bg: 'bg-orange-500', pressed: 'bg-orange-600', text: 'text-white' },
  secondary: { bg: 'bg-zinc-800', pressed: 'bg-zinc-700', text: 'text-zinc-100' },
  ghost: { bg: 'bg-transparent', pressed: 'bg-zinc-800', text: 'text-zinc-300' },
  danger: { bg: 'bg-red-500', pressed: 'bg-red-600', text: 'text-white' },
};

const sizeStyles: Record<ButtonSize, { container: string; text: string }> = {
  sm: { container: 'px-3 py-2 rounded-lg', text: 'text-sm' },
  md: { container: 'px-4 py-3 rounded-xl', text: 'text-base' },
  lg: { container: 'px-6 py-4 rounded-2xl', text: 'text-lg' },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  style,
}: ButtonProps) {
  const v = variantStyles[variant];
  const s = sizeStyles[size];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`flex-row items-center justify-center ${s.container} ${v.bg} ${isDisabled ? 'opacity-50' : ''}`}
      style={({ pressed }) => [
        pressed && !isDisabled ? { opacity: 0.8 } : {},
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="white" size="small" />
      ) : (
        <>
          {icon}
          <Text className={`font-semibold ${s.text} ${v.text} ${icon ? 'ml-2' : ''}`}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}
