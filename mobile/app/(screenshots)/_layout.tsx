import { Stack } from 'expo-router';

export default function ScreenshotsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#09090b' } }} />
  );
}
