'use client';

import { useState } from 'react';
import { Plus, Search, MoreHorizontal, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const roles = ['All', 'Admin', 'User'] as const;

interface TeamUser {
  name: string;
  email: string;
  role: 'Admin' | 'User';
  status: 'Active' | 'Invited' | 'Disabled';
  lastActive: string;
}

const mockUsers: TeamUser[] = [];

export default function UsersPage() {
  const [roleFilter, setRoleFilter] = useState<(typeof roles)[number]>('All');
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const filtered = mockUsers.filter((u) => {
    if (roleFilter !== 'All' && u.role !== roleFilter) return false;
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">User Management</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage team members and their access to your organization.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Invite User
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-surface-100 p-1">
          {roles.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFilter(role)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                roleFilter === role
                  ? 'bg-white/[0.08] text-white'
                  : 'text-zinc-400 hover:text-white'
              )}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-surface-100">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Name</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Email</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Role</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Status</th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Last Active</th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04]">
                        <Users className="h-6 w-6 text-zinc-500" />
                      </div>
                      <p className="mt-4 text-sm font-medium text-zinc-300">No team members yet</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Invite your first team member to get started.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((u) => (
                  <tr key={u.email} className="border-b border-white/[0.04] last:border-0">
                    <td className="px-4 py-3 text-sm font-medium text-white">{u.name}</td>
                    <td className="px-4 py-3 text-sm text-zinc-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        u.role === 'Admin' ? 'bg-purple-500/10 text-purple-400' : 'bg-zinc-500/10 text-zinc-400'
                      )}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        u.status === 'Active' && 'bg-brand-500/10 text-brand-400',
                        u.status === 'Invited' && 'bg-amber-500/10 text-amber-400',
                        u.status === 'Disabled' && 'bg-red-500/10 text-red-400'
                      )}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">{u.lastActive}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="animate-fade-in w-full max-w-md rounded-2xl border border-white/[0.06] bg-surface-200 p-6">
            <h3 className="text-lg font-semibold text-white">Invite team member</h3>
            <p className="mt-1 text-sm text-zinc-400">Send an invitation to join your organization.</p>
            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Email address</label>
                <input
                  type="email"
                  placeholder="colleague@company.com"
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Role</label>
                <select className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none transition-colors focus:border-brand-500/50">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setInviteOpen(false);
                }}
                className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
              >
                Send invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
