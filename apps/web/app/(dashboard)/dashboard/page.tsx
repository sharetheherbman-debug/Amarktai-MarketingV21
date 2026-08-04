'use client';

import Link from 'next/link';
import {
  Megaphone,
  FileText,
  CheckCircle2,
  Users,
  ArrowRight,
  PenLine,
  BarChart3,
  Bot,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth.store';

const stats = [
  { label: 'Active Campaigns', value: '0', icon: Megaphone, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { label: 'Content Pieces', value: '0', icon: FileText, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  { label: 'AI Tasks Completed', value: '0', icon: CheckCircle2, color: 'text-brand-400', bg: 'bg-brand-500/10' },
  { label: 'Team Members', value: '0', icon: Users, color: 'text-amber-400', bg: 'bg-amber-500/10' },
];

const quickActions = [
  { label: 'Create Campaign', icon: Megaphone, href: '/campaigns', description: 'Launch a new marketing campaign' },
  { label: 'Write Content', icon: PenLine, href: '/content', description: 'Create blog posts, ads, or social content' },
  { label: 'View Analytics', icon: BarChart3, href: '/analytics', description: 'Track performance and engagement' },
  { label: 'Configure Agents', icon: Bot, href: '/agents', description: 'Set up and manage your AI agents' },
];

export default function DashboardPage() {
  const { user } = useAuthStore();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {user?.name?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Here is what is happening with your marketing today.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
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

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-white">Quick Actions</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="group flex items-start gap-4 rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/30 hover:bg-surface-200"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-400 transition-colors group-hover:bg-brand-500/20">
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{action.label}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-400" />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{action.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold text-white">Recent Activity</h2>
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04]">
                <CheckCircle2 className="h-6 w-6 text-zinc-500" />
              </div>
              <p className="mt-4 text-sm font-medium text-zinc-300">No recent activity</p>
              <p className="mt-1 text-xs text-zinc-500">
                Your activity will appear here once you start creating campaigns and content.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
