'use client';

import { BarChart3, TrendingUp, Users, Zap, CalendarDays } from 'lucide-react';

const placeholderStats = [
  { label: 'Total Reach', value: '--', icon: TrendingUp, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { label: 'Engagement Rate', value: '--', icon: Users, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { label: 'Conversions', value: '--', icon: Zap, color: 'text-brand-400', bg: 'bg-brand-500/10' },
  { label: 'AI Tasks', value: '--', icon: BarChart3, color: 'text-amber-400', bg: 'bg-amber-500/10' },
];

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Track performance across all your marketing channels and campaigns.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-surface-100 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          <CalendarDays className="h-4 w-4" />
          Last 30 days
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {placeholderStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">{stat.label}</p>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </div>
            <p className="mt-3 text-3xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-surface-100">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
            <BarChart3 className="h-8 w-8 text-zinc-500" />
          </div>
          <h3 className="mt-6 text-lg font-semibold text-white">
            Analytics dashboard coming in Phase 2
          </h3>
          <p className="mt-2 max-w-md text-sm text-zinc-500">
            Detailed charts, trend analysis, channel breakdowns, and AI-powered insights will be available once your campaigns start generating data.
          </p>
        </div>
      </div>
    </div>
  );
}
