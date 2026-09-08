import { useState, useMemo, ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { TableSkeleton } from '../common/LoadingSkeleton';
import { EmptyState } from '../common/EmptyState';

export interface ColumnDef<T> {
  key: string;
  header: string;
  accessor?: (row: T) => unknown;
  render?: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  isLoading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  searchKeys?: (keyof T | string)[];
  onRowClick?: (row: T) => void;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  actions?: ReactNode;
  rowKey?: (row: T, index: number) => string | number;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  isLoading = false,
  searchable = true,
  searchPlaceholder = 'Search records...',
  searchKeys,
  onRowClick,
  pageSize = 10,
  emptyTitle,
  emptyDescription,
  actions,
  rowKey,
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Filter Data
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const query = searchQuery.toLowerCase();

    return data.filter((item) => {
      if (searchKeys && searchKeys.length > 0) {
        return searchKeys.some((key) => {
          const val = item[key as string];
          return val !== undefined && val !== null && String(val).toLowerCase().includes(query);
        });
      }
      return Object.values(item).some(
        (val) => val !== undefined && val !== null && String(val).toLowerCase().includes(query)
      );
    });
  }, [data, searchQuery, searchKeys]);

  // Sort Data
  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;

    const column = columns.find((c) => c.key === sortKey);
    if (!column) return filteredData;

    return [...filteredData].sort((a, b) => {
      let valA: unknown = column.accessor ? column.accessor(a) : a[sortKey];
      let valB: unknown = column.accessor ? column.accessor(b) : b[sortKey];

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      const res = (valA as number) > (valB as number) ? 1 : -1;
      return sortDirection === 'asc' ? res : -res;
    });
  }, [filteredData, sortKey, sortDirection, columns]);

  // Pagination
  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  if (isLoading) {
    return <TableSkeleton rows={pageSize} />;
  }

  return (
    <div className="bg-white dark:bg-[#0e1424]/90 border border-slate-200 dark:border-slate-800/90 rounded-2xl overflow-hidden shadow-sm dark:shadow-xl">
      {/* Toolbar */}
      {(searchable || actions) && (
        <div className="p-4 border-b border-slate-200 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          {searchable ? (
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-xs rounded-xl pl-9 pr-3 py-1.5 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 transition"
              />
            </div>
          ) : (
            <div />
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}

      {/* Table Body */}
      {paginatedData.length === 0 ? (
        <div className="p-6">
          <EmptyState
            title={emptyTitle || 'No items found'}
            description={
              searchQuery
                ? `No results matched "${searchQuery}". Try a different search.`
                : emptyDescription || 'There are no items to display.'
            }
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-transparent text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800/80 uppercase tracking-wider font-semibold text-[10px]">
              <tr>
                {columns.map((col) => {
                  const alignClass =
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left';

                  return (
                    <th
                      key={col.key}
                      className={`py-3.5 px-4 ${alignClass} ${col.className || ''}`}
                    >
                      {col.sortable ? (
                        <button
                          onClick={() => handleSort(col.key)}
                          className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white transition group focus:outline-none"
                        >
                          <span>{col.header}</span>
                          {sortKey === col.key ? (
                            sortDirection === 'asc' ? (
                              <ChevronUp className="w-3.5 h-3.5 text-cyan-500" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-cyan-500" />
                            )
                          ) : (
                            <ChevronsUpDown className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                          )}
                        </button>
                      ) : (
                        <span>{col.header}</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-200 font-mono">
              {paginatedData.map((row, idx) => {
                const key = rowKey ? rowKey(row, idx) : (row.id as string) || idx;
                return (
                  <tr
                    key={key}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`transition-colors duration-100 ${
                      onRowClick
                        ? 'hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer'
                        : ''
                    }`}
                  >
                    {columns.map((col) => {
                      const alignClass =
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left';

                      return (
                        <td
                          key={col.key}
                          className={`py-3.5 px-4 ${alignClass} ${col.className || ''}`}
                        >
                          {col.render
                            ? col.render(row, idx)
                            : col.accessor
                            ? String(col.accessor(row) ?? '')
                            : String(row[col.key] ?? '')}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
          <div>
            Showing <strong className="text-slate-800 dark:text-white">{(currentPage - 1) * pageSize + 1}</strong> to{' '}
            <strong className="text-slate-800 dark:text-white">
              {Math.min(currentPage * pageSize, sortedData.length)}
            </strong>{' '}
            of <strong className="text-slate-800 dark:text-white">{sortedData.length}</strong> records
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-medium">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
