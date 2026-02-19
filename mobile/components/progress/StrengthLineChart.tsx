import { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, {
  Path, Circle, Line, Text as SvgText, G,
  Defs, LinearGradient, Stop,
} from 'react-native-svg';

interface DataPoint {
  date: string;   // ISO date string
  weight: number;
}

interface StrengthLineChartProps {
  data: DataPoint[];
  color?: string;
}

const CHART_HEIGHT = 160;
const PAD = { top: 15, bottom: 28, left: 44, right: 12 };

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function abbreviate(n: number): string {
  return `${Math.round(n)}`;
}

export function StrengthLineChart({ data, color = '#3b82f6' }: StrengthLineChartProps) {
  const [width, setWidth] = useState(0);

  if (data.length === 0) {
    return (
      <View className="items-center py-8">
        <Text className="text-zinc-500 text-sm">No history recorded yet</Text>
      </View>
    );
  }

  if (data.length === 1) {
    return (
      <View className="items-center py-6">
        <Text className="text-zinc-50 text-2xl font-bold">{data[0].weight} lbs</Text>
        <Text className="text-zinc-500 text-xs mt-1">
          Recorded {formatDate(data[0].date)}
        </Text>
        <Text className="text-zinc-600 text-xs mt-2">Log more updates to see progression</Text>
      </View>
    );
  }

  const plotW = width - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;

  const minVal = Math.min(...data.map((d) => d.weight));
  const maxVal = Math.max(...data.map((d) => d.weight));
  const range = maxVal - minVal || 1;

  // Pad the y range by 15% on each side for visual breathing room
  const yMin = Math.max(0, minVal - range * 0.15);
  const yMax = maxVal + range * 0.15;
  const yRange = yMax - yMin || 1;

  const yTicks = [
    yMin,
    yMin + yRange * 0.33,
    yMin + yRange * 0.66,
    yMax,
  ];

  const toX = (i: number) => (i / (data.length - 1)) * plotW;
  const toY = (val: number) => plotH - ((val - yMin) / yRange) * plotH;

  // Build SVG path
  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(d.weight).toFixed(1)}`)
    .join(' ');

  // Closed area path for gradient fill
  const areaPath =
    `${linePath} L ${toX(data.length - 1).toFixed(1)} ${plotH} L 0 ${plotH} Z`;

  // Which x labels to show (max 5 evenly spaced)
  const labelIndices = data.length <= 5
    ? data.map((_, i) => i)
    : [0, Math.floor(data.length * 0.25), Math.floor(data.length * 0.5),
       Math.floor(data.length * 0.75), data.length - 1];

  const gradId = `grad-${color.replace('#', '')}`;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: CHART_HEIGHT }}
    >
      {width > 0 && (
        <Svg width={width} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.25} />
              <Stop offset="1" stopColor={color} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>

          <G x={PAD.left} y={PAD.top}>
            {/* Y grid lines + labels */}
            {yTicks.map((tick, idx) => {
              const y = toY(tick);
              return (
                <G key={idx}>
                  <Line
                    x1={0} y1={y} x2={plotW} y2={y}
                    stroke="#27272a" strokeWidth={1}
                  />
                  <SvgText
                    x={-6} y={y + 4}
                    textAnchor="end"
                    fontSize={9}
                    fill="#71717a"
                  >
                    {abbreviate(tick)}
                  </SvgText>
                </G>
              );
            })}

            {/* Baseline */}
            <Line
              x1={0} y1={plotH} x2={plotW} y2={plotH}
              stroke="#3f3f46" strokeWidth={1}
            />

            {/* Area fill */}
            <Path d={areaPath} fill={`url(#${gradId})`} />

            {/* Line */}
            <Path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data points */}
            {data.map((d, i) => (
              <Circle
                key={i}
                cx={toX(i)} cy={toY(d.weight)}
                r={3}
                fill={color}
                stroke="#09090b"
                strokeWidth={1.5}
              />
            ))}

            {/* X labels */}
            {labelIndices.map((i) => (
              <SvgText
                key={i}
                x={toX(i)}
                y={plotH + 16}
                textAnchor="middle"
                fontSize={9}
                fill="#71717a"
              >
                {formatDate(data[i].date)}
              </SvgText>
            ))}
          </G>
        </Svg>
      )}
    </View>
  );
}
