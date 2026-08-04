'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Filter, Megaphone } from 'lucide-react';

const statuses = ['All', 'Draft', 'Active', 'Paused', 'Completed'];

export default function CampaignsPage() {
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Campaigns</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage and track your marketing campaigns across all channels.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Create Campaign
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search campaigns..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-zinc-500" />
          {statuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === status
                  ? 'bg-brand-500/10 text-brand-400'
                  : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-surface-100">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
            <Megaphone className="h-8 w-8 text-zinc-500" />
          </div>
          <h3 className="mt-6 text-lg font-semibold text-white">No campaigns yet</h3>
          <p className="mt-2 max-w-sm text-sm text-zinc-500">
            Create your first campaign to start reaching your audience with AI-powered marketing.
          </p>
          <Link
            href="/campaigns/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Create your first campaign
          </Link>
        </div>
      </div>
    </div>
  );
}
