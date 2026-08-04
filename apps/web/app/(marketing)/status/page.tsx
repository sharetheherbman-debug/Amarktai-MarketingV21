'use client';

import { useState, useEffect } from 'react';

const services = [
  { name: 'API', status: 'operational', uptime: 99.99 },
  { name: 'Dashboard', status: 'operational', uptime: 99.98 },
  { name: 'AI Services', status: 'operational', uptime: 99.95 },
  { name: 'Database', status: 'operational', uptime: 99.99 },
  { name: 'Email Delivery', status: 'operational', uptime: 99.97 },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    operational: 'bg-emerald-500/10 text-emerald-400',
    degraded: 'bg-yellow-500/10 text-yellow-400',
    outage: 'bg-red-500/10 text-red-400',
  };
  const labels: Record<string, string> = {
    operational: 'Operational',
    degraded: 'Degraded',
    outage: 'Outage',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        colors[status] || colors.operational
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          status === 'operational'
            ? 'bg-emerald-400'
            : status === 'degraded'
            ? 'bg-yellow-400'
            : 'bg-red-400'
        }`}
      />
      {labels[status] || status}
    </span>
  );
}

export default function StatusPage() {
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const allOperational = services.every((s) => s.status === 'operational');

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(16,185,129,0.15),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-36">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              System Status
            </h1>
            <div className="mt-6 inline-flex items-center gap-2">
              <span
                className={`h-3 w-3 rounded-full ${
                  allOperational ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'
                }`}
              />
              <span className="text-lg font-medium text-white">
                {allOperational
                  ? 'All Systems Operational'
                  : 'Some Systems Experiencing Issues'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/[0.06] py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-white/[0.06] bg-surface-100 p-6 sm:p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Service Status
              </h2>
              <span className="text-xs text-zinc-500">
                Auto-refreshes every 60s
              </span>
            </div>
            <div className="mt-6 divide-y divide-white/[0.06]">
              {services.map((service) => (
                <div
                  key={service.name}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                >
                  <div>
                    <div className="text-sm font-medium text-white">
                      {service.name}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {service.uptime}% uptime
                    </div>
                  </div>
                  <StatusBadge status={service.status} />
                </div>
              ))}
            </div>
          </div>

          {/* Uptime Bars */}
          <div className="mt-8 rounded-2xl border border-white/[0.06] bg-surface-100 p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-white">
              90-Day Uptime
            </h2>
            <div className="mt-6 space-y-4">
              {services.map((service) => (
                <div key={service.name}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-zinc-400">
                      {service.name}
                    </span>
                    <span className="text-sm font-medium text-white">
                      {service.uptime}%
                    </span>
                  </div>
                  <div className="mt-2 flex gap-0.5">
                    {Array.from({ length: 90 }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-6 flex-1 rounded-sm ${
                          i < 88
                            ? 'bg-emerald-500/30'
                            : i < 89
                            ? 'bg-emerald-500/50'
                            : 'bg-emerald-500'
                        }`}
                        title={`Day ${i + 1}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between text-xs text-zinc-500">
              <span>90 days ago</span>
              <span>Today</span>
            </div>
          </div>

          {/* Incidents */}
          <div className="mt-8 rounded-2xl border border-white/[0.06] bg-surface-100 p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-white">
              Incident History
            </h2>
            <div className="mt-6 flex flex-col items-center justify-center py-8">
              <svg
                className="h-12 w-12 text-zinc-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="mt-4 text-sm text-zinc-500">
                No recent incidents
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                All systems have been running smoothly
              </p>
            </div>
          </div>

          {/* Subscribe */}
          <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div>
              <h3 className="text-sm font-medium text-white">
                Subscribe to updates
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Get notified when service status changes.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-white/10 px-6 text-sm font-medium text-white transition-all hover:bg-white/[0.04]"
            >
              Subscribe
            </button>
          </div>

          <p className="mt-8 text-center text-xs text-zinc-600">
            Last refreshed: {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
      </section>
    </>
  );
}
