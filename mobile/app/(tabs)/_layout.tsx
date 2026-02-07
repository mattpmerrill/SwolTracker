import { Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Dumbbell, TrendingUp, BarChart3, Users, Settings } from 'lucide-react-native';

const ACTIVE_COLOR = '#f97316'; // orange-500
const INACTIVE_COLOR = '#71717a'; // zinc-500
const TAB_BAR_BG = '#18181b'; // zinc-900
const HEADER_BG = '#09090b'; // zinc-950

function SettingsButton() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push('/(modals)/settings')} style={{ marginRight: 16 }}>
      <Settings size={22} color="#a1a1aa" />
    </Pressable>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: ACTIVE_COLOR,
        tabBarInactiveTintColor: INACTIVE_COLOR,
        tabBarStyle: {
          backgroundColor: TAB_BAR_BG,
          borderTopColor: '#27272a', // zinc-800
          borderTopWidth: 0.5,
          height: 88,
          paddingBottom: 30,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: HEADER_BG,
        },
        headerTintColor: '#fafafa', // zinc-50
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 18,
        },
        headerShadowVisible: false,
        headerRight: () => <SettingsButton />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Workout',
          tabBarIcon: ({ color, size }) => (
            <Dumbbell size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="maxes"
        options={{
          title: 'Maxes',
          tabBarIcon: ({ color, size }) => (
            <TrendingUp size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color, size }) => (
            <BarChart3 size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="buddies"
        options={{
          title: 'Buddies',
          tabBarIcon: ({ color, size }) => (
            <Users size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
