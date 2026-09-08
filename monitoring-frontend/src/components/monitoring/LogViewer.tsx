import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LogEntry } from '../../types';
import { getLogLevelClasses } from '../../utils/statusColors';
import { Play, Pause, Trash2, Download, Search, ChevronRight, ChevronDown } from 'lucide-react';

interface LogViewerProps {
  logs: LogEntry[];
  serviceName?: string;
  onClear?: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, serviceName, onClear }) => {
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [expandedLogIds, setExpandedLogIds] = useState<Set<string>>(new Set());

  const terminalRef = useRef<HTMLDivElement>(null);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (selectedLevel !== 'ALL' && log.level !== selectedLevel) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          log.message.toLowerCase().includes(q) ||
          log.serviceName.toLowerCase().includes(q) ||
          (log.traceId && log.traceId.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [logs, selectedLevel, searchQuery]);

  // Auto-scroll to bottom on new log entries
  useEffect(() => {
    if (isAutoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [filteredLogs, isAutoScroll]);

  const toggleExpand = (id: string) => {
    setExpandedLogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `logs-${serviceName || 'all'}-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col h-[520px]">
      {/* Header Toolbar */}
      <div className="p-3 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Level Filters */}
        <div className="flex items-center gap-1">
          <span className="text-slate-400 mr-1 text-[11px] font-medium">Level:</span>
          {['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG'].map((lvl) => (
            <button
              key={lvl}
              onClick={() => setSelectedLevel(lvl)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                selectedLevel === lvl
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
          <div className="relative w-48 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs (regex or text)..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          {/* Auto scroll toggle */}
          <button
            onClick={() => setIsAutoScroll(!isAutoScroll)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition ${
              isAutoScroll
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
            }`}
            title="Toggle Auto Scroll"
          >
            {isAutoScroll ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>Auto-Scroll</span>
          </button>

          {/* Export JSON */}
          <button
            onClick={handleExportJson}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] font-medium transition"
            title="Download Logs as JSON"
          >
            <Download className="w-3 h-3" />
            <span>Export</span>
          </button>

          {onClear && (
            <button
              onClick={onClear}
              className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
              title="Clear Log Stream"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal Output Window */}
      <div
        ref={terminalRef}
        className="flex-1 p-4 bg-slate-950 font-mono text-[11px] overflow-y-auto space-y-1.5 select-text"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500 italic">
            No log entries matching the criteria. Waiting for incoming telemetry...
          </div>
        ) : (
          filteredLogs.map((log) => {
            const { badge, rowText } = getLogLevelClasses(log.level);
            const isExpanded = expandedLogIds.has(log.id);

            return (
              <div
                key={log.id}
                className="group hover:bg-slate-900/60 rounded px-1.5 py-0.5 transition-colors border-l-2 border-transparent hover:border-cyan-500/40"
              >
                <div className="flex items-start gap-2">
                  {/* Expand Icon */}
                  {log.metadata ? (
                    <button
                      onClick={() => toggleExpand(log.id)}
                      className="text-slate-500 hover:text-cyan-400 mt-0.5 focus:outline-none"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3" />
                      ) : (
                        <ChevronRight className="w-3 h-3" />
                      )}
                    </button>
                  ) : (
                    <span className="w-3" />
                  )}

                  {/* Timestamp */}
                  <span className="text-slate-400 shrink-0 select-none">
                    [{log.timestamp.replace('T', ' ').slice(0, 19)}]
                  </span>

                  {/* Level Badge */}
                  <span className={`px-1.5 py-0.2 rounded text-[9px] shrink-0 ${badge}`}>
                    {log.level}
                  </span>

                  {/* Service Tag */}
                  <span className="text-cyan-400 shrink-0 font-bold">[{log.serviceName}]</span>

                  {/* Message */}
                  <span className={`flex-1 break-all ${rowText}`}>{log.message}</span>
                </div>

                {/* Expanded JSON Payload */}
                {isExpanded && log.metadata && (
                  <div className="mt-1.5 ml-8 p-3 rounded-lg bg-slate-900 border border-slate-800 text-[10px] text-slate-300">
                    <div className="text-slate-400 text-[9px] uppercase font-bold mb-1">
                      Structured Metadata Payload:
                    </div>
                    <pre className="overflow-x-auto text-emerald-400">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Telemetry */}
      <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
        <span>Log Stream: <strong className="text-emerald-400">CONNECTED (Loki Provider Ready)</strong></span>
        <span>Showing {filteredLogs.length} of {logs.length} events</span>
      </div>
    </div>
  );
};
