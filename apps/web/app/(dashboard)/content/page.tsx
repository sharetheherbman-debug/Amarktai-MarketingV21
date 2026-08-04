'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Search, FileText } from 'lucide-react';

const tabs = ['All', 'Blog Posts', 'Social Media', 'Email', 'Ad Copy'] as const;

export default function ContentPage() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>('All');
  const [search, setSearch] = useState('');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Content</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Create and manage your AI-generated marketing content.
          </p>
        </div>
        <Link
          href="/content/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Create Content
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-surface-100 p-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-white/[0.08] text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search content..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-surface-100">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
            <FileText className="h-8 w-8 text-zinc-500" />
          </div>
          <h3 className="mt-6 text-lg font-semibold text-white">No content yet</h3>
          <p className="mt-2 max-w-sm text-sm text-zinc-500">
            Create your first piece of AI-powered content — blog posts, social media updates, email campaigns, and more.
          </p>
          <Link
            href="/content/new"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Create your first piece
          </Link>
        </div>
      </div>
    </div>
  );
}
