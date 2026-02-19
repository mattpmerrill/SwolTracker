import { View, Text, ScrollView } from 'react-native';
import { BarChart3, TrendingUp, Flame, Calendar } from 'lucide-react-native';
import Svg, { Rect, Path, Circle, Line, Text as SvgText, G, Defs, LinearGradient, Stop } from 'react-native-svg';

const VOLUME_BARS = [
  { label: 'Wk 1', value: 18400 },
  { label: 'Wk 2', value: 22100 },
  { label: 'Wk 3', value: 19800 },
  { label: 'Wk 4', value: 26500 },
  { label: 'Wk 5', value: 24200 },
  { label: 'Wk 6', value: 31000 },
];

const STRENGTH_DATA = [195, 205, 205, 215, 220, 225, 230, 240];

const MAXES = [
  { name: 'Deadlift', weight: 365 },
  { name: 'Back Squat', weight: 315 },
  { name: 'Bench Press', weight: 245 },
  { name: 'Overhead Press', weight: 155 },
];

function MiniBarChart() {
  const W = 320; const H = 100;
  const max = Math.max(...VOLUME_BARS.map((d) => d.value));
  const pad = { l: 36, r: 8, t: 8, b: 22 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const slot = plotW / VOLUME_BARS.length;
  const bw = slot * 0.55;
  return (
    <Svg width={W} height={H}>
      <G x={pad.l} y={pad.t}>
        {VOLUME_BARS.map((d, i) => {
          const bh = (d.value / max) * plotH;
          const x = i * slot + (slot - bw) / 2;
          return (
            <G key={d.label}>
              <Rect x={x} y={plotH - bh} width={bw} height={bh} rx={3} fill="#f97316" />
              <SvgText x={x + bw / 2} y={plotH + 14} textAnchor="middle" fontSize={9} fill="#71717a">
                {d.label}
              </SvgText>
            </G>
          );
        })}
        <Line x1={0} y1={plotH} x2={plotW} y2={plotH} stroke="#3f3f46" strokeWidth={1} />
      </G>
    </Svg>
  );
}

function MiniLineChart() {
  const W = 320; const H = 100;
  const pad = { l: 36, r: 12, t: 12, b: 22 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const min = Math.min(...STRENGTH_DATA) - 10;
  const max = Math.max(...STRENGTH_DATA) + 10;
  const toX = (i: number) => (i / (STRENGTH_DATA.length - 1)) * plotW;
  const toY = (v: number) => plotH - ((v - min) / (max - min)) * plotH;
  const line = STRENGTH_DATA.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(v)}`).join(' ');
  const area = `${line} L ${toX(STRENGTH_DATA.length - 1)} ${plotH} L 0 ${plotH} Z`;
  return (
    <Svg width={W} height={H}>
      <Defs>
        <LinearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3b82f6" stopOpacity={0.25} />
          <Stop offset="1" stopColor="#3b82f6" stopOpacity={0.02} />
        </LinearGradient>
      </Defs>
      <G x={pad.l} y={pad.t}>
        <Path d={area} fill="url(#lg)" />
        <Path d={line} fill="none" stroke="#3b82f6" strokeWidth={2} strokeLinecap="round" />
        {STRENGTH_DATA.map((v, i) => (
          <Circle key={i} cx={toX(i)} cy={toY(v)} r={3} fill="#3b82f6" stroke="#09090b" strokeWidth={1.5} />
        ))}
        <Line x1={0} y1={plotH} x2={plotW} y2={plotH} stroke="#3f3f46" strokeWidth={1} />
      </G>
    </Svg>
  );
}

export default function ProgressScreenshot() {
  return (
    <View className="flex-1 bg-zinc-950">
      <View className="pt-14 px-4 pb-4">
        <Text className="text-zinc-50 text-2xl font-bold">Progress</Text>
        <Text className="text-zinc-500 text-sm">6 weeks of gains</Text>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
      >
        {/* Stats row */}
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1 bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
            <Flame size={20} color="#f97316" />
            <Text className="text-zinc-50 text-2xl font-bold mt-2">312</Text>
            <Text className="text-zinc-500 text-xs mt-0.5">Sets Logged</Text>
          </View>
          <View className="flex-1 bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
            <Calendar size={20} color="#22c55e" />
            <Text className="text-zinc-50 text-2xl font-bold mt-2">28</Text>
            <Text className="text-zinc-500 text-xs mt-0.5">Workouts</Text>
          </View>
        </View>
        <View className="flex-row gap-3 mb-3">
          <View className="flex-1 bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
            <TrendingUp size={20} color="#3b82f6" />
            <Text className="text-zinc-50 text-2xl font-bold mt-2">12</Text>
            <Text className="text-zinc-500 text-xs mt-0.5">Lifts Tracked</Text>
          </View>
          <View className="flex-1 bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
            <BarChart3 size={20} color="#a855f7" />
            <Text className="text-zinc-50 text-2xl font-bold mt-2">141k</Text>
            <Text className="text-zinc-500 text-xs mt-0.5">Total Volume</Text>
          </View>
        </View>

        {/* Volume chart */}
        <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50 mb-3">
          <Text className="text-zinc-50 text-base font-bold mb-3">Weekly Volume (lbs)</Text>
          <MiniBarChart />
        </View>

        {/* Strength line chart */}
        <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50 mb-3">
          <Text className="text-zinc-50 text-base font-bold mb-1">Bench Press History</Text>
          <Text className="text-zinc-500 text-xs mb-3">
            195 → 240 lbs  ·  +45 lbs in 6 weeks
          </Text>
          <MiniLineChart />
        </View>

        {/* Current maxes */}
        <View className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/50">
          <Text className="text-zinc-50 text-base font-bold mb-3">Current 1RM</Text>
          {MAXES.map((m) => (
            <View key={m.name} className="mb-3">
              <View className="flex-row justify-between mb-1">
                <Text className="text-zinc-300 text-sm">{m.name}</Text>
                <Text className="text-zinc-400 text-sm font-semibold">{m.weight} lbs</Text>
              </View>
              <View className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <View
                  className="h-full bg-orange-500 rounded-full"
                  style={{ width: `${(m.weight / 365) * 100}%` }}
                />
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <View className="bg-zinc-900 border-t border-zinc-800 px-6 py-5 items-center">
        <Text className="text-zinc-50 text-lg font-bold">See exactly how strong you're getting.</Text>
        <Text className="text-zinc-400 text-sm mt-0.5">Volume trends, 1RM progression, and more.</Text>
      </View>
    </View>
  );
}
