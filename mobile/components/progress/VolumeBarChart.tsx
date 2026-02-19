import { useState } from 'react';
import { View, Text } from 'react-native';
import Svg, {
  Rect, Line, Text as SvgText, G,
} from 'react-native-svg';

interface BarData {
  label: string;
  value: number;
}

interface VolumeBarChartProps {
  data: BarData[];
}

const CHART_HEIGHT = 160;
const PAD = { top: 10, bottom: 28, left: 44, right: 8 };

function abbreviate(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return `${n}`;
}

export function VolumeBarChart({ data }: VolumeBarChartProps) {
  const [width, setWidth] = useState(0);

  if (data.length === 0) {
    return (
      <View className="items-center py-8">
        <Text className="text-zinc-500 text-sm">Log workouts to see volume data</Text>
      </View>
    );
  }

  const plotW = width - PAD.left - PAD.right;
  const plotH = CHART_HEIGHT - PAD.top - PAD.bottom;

  const maxVal = Math.max(...data.map((d) => d.value), 1);
  // Round up to a nice number for the y-axis
  const yMax = Math.ceil(maxVal / 500) * 500 || 500;
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax];

  const barSlot = plotW / data.length;
  const barW = Math.max(barSlot * 0.55, 4);
  const barGap = barSlot * 0.45;

  const toY = (val: number) => plotH - (val / yMax) * plotH;

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: CHART_HEIGHT }}
    >
      {width > 0 && (
        <Svg width={width} height={CHART_HEIGHT}>
          <G x={PAD.left} y={PAD.top}>
            {/* Y grid lines + labels */}
            {yTicks.slice(1).map((tick) => {
              const y = toY(tick);
              return (
                <G key={tick}>
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

            {/* Bars */}
            {data.map((d, i) => {
              const barH = Math.max((d.value / yMax) * plotH, d.value > 0 ? 2 : 0);
              const x = i * barSlot + barGap / 2;
              const y = toY(d.value);
              return (
                <G key={d.label}>
                  <Rect
                    x={x} y={y}
                    width={barW} height={barH}
                    rx={3} ry={3}
                    fill={d.value > 0 ? '#f97316' : '#3f3f46'}
                    opacity={d.value > 0 ? 1 : 0.3}
                  />
                  {/* X label */}
                  <SvgText
                    x={x + barW / 2}
                    y={plotH + 16}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#71717a"
                  >
                    {d.label}
                  </SvgText>
                </G>
              );
            })}
          </G>
        </Svg>
      )}
    </View>
  );
}
