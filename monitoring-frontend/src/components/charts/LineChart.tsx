import React from 'react';
import {
  ResponsiveContainer,
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';

export interface LineSeriesConfig {
  key: string;
  name: string;
  color: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  yAxisId?: string;
}

interface LineChartProps {
  data: Record<string, unknown>[];
  series: LineSeriesConfig[];
  xAxisKey?: string;
  height?: number;
  unit?: string;
  yAxisLabel?: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  series,
  xAxisKey = 'timestamp',
  height = 240,
  unit = 'ms',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RechartsLineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={isDark ? '#334155' : '#e2e8f0'}
            opacity={isDark ? 0.3 : 0.8}
            vertical={false}
          />
          <XAxis
            dataKey={xAxisKey}
            stroke={isDark ? '#94a3b8' : '#64748b'}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: isDark ? '#475569' : '#cbd5e1', opacity: isDark ? 0.3 : 0.8 }}
          />
          <YAxis
            stroke={isDark ? '#94a3b8' : '#64748b'}
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: isDark ? '#475569' : '#cbd5e1', opacity: isDark ? 0.3 : 0.8 }}
            unit={` ${unit}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: isDark ? '#0f172a' : '#ffffff',
              borderColor: isDark ? '#334155' : '#e2e8f0',
              borderRadius: '0.75rem',
              color: isDark ? '#f8fafc' : '#0f172a',
              fontSize: '12px',
              boxShadow: isDark
                ? '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            }}
            itemStyle={{ padding: '2px 0', color: isDark ? '#f8fafc' : '#0f172a' }}
            formatter={(val: number, name: string) => [`${val} ${unit}`, name]}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
            iconType="circle"
            iconSize={8}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={s.strokeWidth || 2}
              strokeDasharray={s.strokeDasharray}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
};
