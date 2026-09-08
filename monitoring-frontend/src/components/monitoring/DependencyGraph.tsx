import React from 'react';
import { DependencyGraphData, DependencyNode } from '../../types';
import { useTheme } from '../../context/ThemeContext';

interface DependencyGraphProps {
  data: DependencyGraphData;
  onNodeClick?: (node: DependencyNode) => void;
  activeServiceId?: string;
}

export const DependencyGraph: React.FC<DependencyGraphProps> = ({
  data,
  onNodeClick,
  activeServiceId,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // If specific service is active, arrange nodes clearly
  const nodes = data.nodes;
  const edges = data.edges;

  return (
    <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl p-5 shadow-sm dark:shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
            Service Topology &amp; Data Flow
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Interactive dependency mapping with real-time latency &amp; error rates
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Healthy
          </span>
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span> Degraded
          </span>
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span> Critical / Ext
          </span>
        </div>
      </div>

      {/* SVG Topology Map Container */}
      <div className="h-80 w-full bg-slate-50 dark:bg-slate-950/80 rounded-xl p-4 flex items-center justify-center relative overflow-hidden border border-slate-200 dark:border-slate-800/80">
        <svg className="w-full h-full" viewBox="0 0 760 320">
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="10"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill={isDark ? '#64748b' : '#94a3b8'} />
            </marker>
          </defs>

          {/* Draw Edges */}
          {edges.map((edge) => {
            const sourceNode = nodes.find((n) => n.id === edge.source);
            const targetNode = nodes.find((n) => n.id === edge.target);
            if (!sourceNode || !targetNode) return null;

            const x1 = sourceNode.x || 100;
            const y1 = sourceNode.y || 160;
            const x2 = targetNode.x || 400;
            const y2 = targetNode.y || 160;

            const isErrorEdge = edge.errorRatePercent > 1.0;
            const strokeColor = isErrorEdge ? '#f43f5e' : isDark ? '#06b6d4' : '#0284c7';

            return (
              <g key={edge.id}>
                <line
                  x1={x1 + 60}
                  y1={y1 + 25}
                  x2={x2}
                  y2={y2 + 25}
                  stroke={strokeColor}
                  strokeWidth={2}
                  strokeDasharray={isErrorEdge ? '4 4' : undefined}
                  markerEnd="url(#arrowhead)"
                  opacity={0.85}
                />
                {/* Label on edge */}
                <rect
                  x={(x1 + x2) / 2 + 10}
                  y={(y1 + y2) / 2 + 15}
                  width="70"
                  height="18"
                  rx="4"
                  fill={isDark ? '#020617' : '#ffffff'}
                  stroke={isDark ? '#334155' : '#cbd5e1'}
                  strokeWidth="1"
                />
                <text
                  x={(x1 + x2) / 2 + 45}
                  y={(y1 + y2) / 2 + 27}
                  fill={isErrorEdge ? '#f43f5e' : isDark ? '#94a3b8' : '#475569'}
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {edge.latencyMs}ms ({edge.rps} RPS)
                </text>
              </g>
            );
          })}

          {/* Draw Nodes */}
          {nodes.map((node) => {
            const x = node.x || 200;
            const y = node.y || 150;
            const isTarget = activeServiceId ? node.id === activeServiceId : false;

            const borderStroke =
              node.status === 'critical'
                ? '#f43f5e'
                : node.status === 'degraded'
                ? '#f59e0b'
                : '#10b981';

            return (
              <g
                key={node.id}
                transform={`translate(${x}, ${y})`}
                onClick={() => onNodeClick && onNodeClick(node)}
                className="cursor-pointer group"
              >
                {/* Node Box */}
                <rect
                  width="130"
                  height="54"
                  rx="10"
                  fill={isDark ? '#0f172a' : '#ffffff'}
                  stroke={borderStroke}
                  strokeWidth={isTarget ? 3 : 2}
                  className="transition-all duration-150 group-hover:opacity-90 shadow-sm"
                />

                {/* Title */}
                <text
                  x="65"
                  y="22"
                  fill={isDark ? '#ffffff' : '#0f172a'}
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {node.name}
                </text>

                {/* Sub details */}
                <text
                  x="65"
                  y="38"
                  fill={borderStroke}
                  fontSize="9"
                  fontFamily="monospace"
                  textAnchor="middle"
                >
                  {node.rps} RPS &bull; {node.latencyMs}ms
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
