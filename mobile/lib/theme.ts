export const colors = {
  // Background
  zinc: {
    950: '#09090b',
    900: '#18181b',
    800: '#27272a',
    700: '#3f3f46',
    600: '#52525b',
    500: '#71717a',
    400: '#a1a1aa',
    300: '#d4d4d8',
    200: '#e4e4e7',
    100: '#f4f4f5',
    50: '#fafafa',
  },
  // Accent
  orange: {
    600: '#ea580c',
    500: '#f97316',
    400: '#fb923c',
    300: '#fdba74',
  },
  // Status
  green: {
    500: '#22c55e',
    400: '#4ade80',
  },
  red: {
    500: '#ef4444',
    400: '#f87171',
  },
  blue: {
    500: '#3b82f6',
    400: '#60a5fa',
  },
  yellow: {
    500: '#eab308',
    400: '#facc15',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

export const fontSize = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const;

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;
