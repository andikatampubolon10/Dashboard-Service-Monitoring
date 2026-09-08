import React from 'react';
import {
  ResponsiveContainer,
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';

export interface BarSeriesConfig {
  key: string;
  name: string;
  color: string;
  stackId?: string;
}

interface BarChartProps {
  data: Record<string, unknown>[];
  series: BarSeriesConfig[];
  xAxisKey?: string;
  height?: number;
  unit?: string;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  series,
  xAxisKey = 'name',
  height = 240,
  unit = '',
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RechartsBarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
            unit={unit ? ` ${unit}` : ''}
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
            itemStyle={{ color: isDark ? '#f8fafc' : '#0f172a' }}
            formatter={(val: number, name: string) => [
              unit ? `${val} ${unit}` : val.toLocaleString(),
              name,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
            iconType="circle"
            iconSize={8}
          />
          {series.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color}
              stackId={s.stackId}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
};
