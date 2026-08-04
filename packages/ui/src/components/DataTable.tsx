'use client';

import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';

export interface Column<T> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  sorting?: {
    column: string;
    direction: 'asc' | 'desc';
    onSort: (column: string) => void;
  };
  onRowClick?: (row: T) => void;
  rowKey: keyof T | ((row: T) => string);
  className?: string;
}

function getCellValue<T>(row: T, accessor: keyof T | ((row: T) => React.ReactNode)): React.ReactNode {
  if (typeof accessor === 'function') {
    return accessor(row);
  }
  return String(row[accessor] ?? '');
}

function getRowKey<T>(row: T, keyFn: keyof T | ((row: T) => string)): string {
  if (typeof keyFn === 'function') {
    return keyFn(row);
  }
  return String(row[keyFn]);
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  loading = false,
  emptyMessage = 'No data available',
  emptyIcon,
  pagination,
  sorting,
  onRowClick,
  rowKey,
  className,
}: DataTableProps<T>) {
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 0;

  return (
    <div className={twMerge('w-full overflow-hidden rounded-xl border border-white/[0.06]', className)}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06]">
              {columns.map((col) => (
                <th
                  key={col.id}
                  style={{ width: col.width }}
                  className={twMerge(
                    'px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    col.sortable && 'cursor-pointer hover:text-white/60 select-none',
                    col.className
                  )}
                  onClick={() => col.sortable && sorting?.onSort(col.id)}
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {col.sortable && sorting?.column === col.id && (
                      sorting.direction === 'asc' ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-white/[0.04]">
                  {columns.map((col) => (
                    <td key={col.id} className="px-4 py-3">
                      <div className="h-4 bg-white/[0.05] rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12">
                  <div className="flex flex-col items-center justify-center text-center">
                    {emptyIcon || <Inbox size={40} className="text-white/20 mb-3" />}
                    <p className="text-sm text-white/40">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={getRowKey(row, rowKey)}
                  onClick={() => onRowClick?.(row)}
                  className={clsx(
                    'border-b border-white/[0.04] last:border-0 transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-white/[0.03]'
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.id}
                      className={twMerge(
                        'px-4 py-3 text-sm text-white/70',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right',
                        col.className
                      )}
                    >
                      {getCellValue(row, col.accessor)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
          <p className="text-sm text-white/40">
            Showing {(pagination.page - 1) * pagination.pageSize + 1} to{' '}
            {Math.min(pagination.page * pagination.pageSize, pagination.total)} of{' '}
            {pagination.total} results
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (pagination.page <= 3) {
                pageNum = i + 1;
              } else if (pagination.page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = pagination.page - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => pagination.onPageChange(pageNum)}
                  className={clsx(
                    'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                    pagination.page === pageNum
                      ? 'bg-brand-500 text-white'
                      : 'text-white/40 hover:text-white hover:bg-white/[0.05]'
                  )}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page === totalPages}
              className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

DataTable.displayName = 'DataTable';
