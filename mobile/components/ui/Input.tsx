import { TextInput, View, Text, type TextInputProps } from 'react-native';
import { forwardRef } from 'react';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  containerClassName?: string;
}

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, containerClassName = '', ...props }, ref) => {
    return (
      <View className={containerClassName}>
        {label && (
          <Text className="text-zinc-400 text-sm mb-1.5 font-medium">
            {label}
          </Text>
        )}
        <TextInput
          ref={ref}
          placeholderTextColor="#71717a"
          className={`bg-zinc-800 text-zinc-100 rounded-xl px-4 py-3 text-base ${
            error ? 'border border-red-500' : 'border border-zinc-700'
          }`}
          {...props}
        />
        {error && (
          <Text className="text-red-400 text-sm mt-1">{error}</Text>
        )}
      </View>
    );
  }
);

Input.displayName = 'Input';
