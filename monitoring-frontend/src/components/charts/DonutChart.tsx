import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useTheme } from '../../context/ThemeContext';

export interface DonutDataPoint {
  name: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutDataPoint[];
  centerLabel?: string;
  centerValue?: string;
  height?: number;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  centerLabel = 'Total',
  centerValue,
  height = 180,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const total = data.reduce((acc, curr) => acc + curr.value, 0);
  const displayCenterValue = centerValue || total.toString();

  return (
    <div className="relative flex items-center justify-center" style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={70}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
            ))}
          </Pie>
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
              `${val} (${((val / total) * 100).toFixed(1)}%)`,
              name,
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center Text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-base font-bold font-mono text-slate-900 dark:text-white leading-tight">
          {displayCenterValue}
        </span>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {centerLabel}
        </span>
      </div>
    </div>
  );
};
