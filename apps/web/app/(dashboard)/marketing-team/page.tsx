'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrainCircuit, CheckCircle2, Clock3, Loader2, Sparkles, UsersRound } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

type Agent = {
  id: string;
  name: string;
  type?: string;
  description?: string;
  status?: string;
  lastUsedAt?: string;
  last_used_at?: string;
  capabilities?: string[];
};

type DirectorStatus = Record<string, unknown>;

function title(value: string | undefined) {
  return String(value || 'specialist')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function MarketingTeamPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [director, setDirector] = useState<DirectorStatus>({});
  const [loading, setLoading] = useState(true);
  const [partial, setPartial] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [agentResult, directorResult] = await Promise.allSettled([
      api.get<ApiResponse<Agent[]>>('/agents'),
      api.get<ApiResponse<DirectorStatus>>('/growth-director/status'),
    ]);
    if (agentResult.status === 'fulfilled') setAgents(agentResult.value.data || []);
    if (directorResult.status === 'fulfilled') setDirector(directorResult.value.data || {});
    setPartial(agentResult.status === 'rejected' || directorResult.status === 'rejected');
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeCount = useMemo(
    () => agents.filter((agent) => String(agent.status || '').toLowerCase() === 'active').length,
    [agents]
  );

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--ep-blue)]" /></div>;

  const directorState = String(
    director.status ?? director.state ?? director.phase ?? director.current_phase ?? 'Ready to coordinate'
  );

  return (
    <div className="space-y-6">
      <header className="ep-panel p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="ep-section-label">Marketing Team</p>
            <h1 className="ep-page-title mt-2">Your virtual marketing department, without the developer console.</h1>
            <p className="ep-page-copy mt-3 max-w-2xl text-sm leading-6 sm:text-base">See the Marketing Director and specialist roles already provisioned for this workspace. Provider settings, raw prompts and internal execution controls stay out of the customer experience.</p>
          </div>
          <div className="rounded-2xl bg-[var(--ep-blue-soft)] px-5 py-4"><p className="text-xs font-bold text-[var(--ep-text-muted)]">Team availability</p><p className="mt-1 text-2xl font-extrabold text-[var(--ep-navy)]">{activeCount} active</p><p className="text-xs text-[var(--ep-text-muted)]">{agents.length} roles visible</p></div>
        </div>
      </header>

      {partial && <div className="ep-status-warning rounded-xl border px-4 py-3 text-sm">Some live team status could not be refreshed. No work was started or changed.</div>}

      <section className="ep-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-[var(--ep-blue)] p-3 text-white"><BrainCircuit className="h-5 w-5" /></div><div><p className="ep-section-label">Marketing Director</p><h2 className="mt-1 text-xl font-extrabold text-[var(--ep-navy)]">Coordinates observation, planning, production and learning</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ep-text-muted)]">The director uses the shared Business Brain and campaign state to coordinate specialist work. Owner approval and workspace safety rules remain separate and binding.</p></div></div>
          <span className="ep-status-success shrink-0 rounded-full border px-3 py-1.5 text-xs font-extrabold">{title(directorState)}</span>
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2"><UsersRound className="h-5 w-5 text-[var(--ep-blue)]" /><h2 className="text-lg font-extrabold text-[var(--ep-navy)]">Specialist roles</h2></div>
        {agents.length === 0 ? (
          <div className="ep-card py-14 text-center"><Sparkles className="mx-auto h-8 w-8 text-[var(--ep-text-soft)]" /><p className="mt-3 text-sm font-semibold text-[var(--ep-text-muted)]">No marketing roles are currently visible for this workspace.</p></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {agents.map((agent) => {
              const lastUsed = agent.lastUsedAt || agent.last_used_at;
              const active = String(agent.status || '').toLowerCase() === 'active';
              return (
                <article key={agent.id} className="ep-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3"><div className="rounded-xl bg-[var(--ep-blue-soft)] p-2.5 text-[var(--ep-blue)]"><Sparkles className="h-4 w-4" /></div><div className="min-w-0"><h3 className="truncate font-extrabold text-[var(--ep-navy)]">{agent.name}</h3><p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-[var(--ep-text-soft)]">{title(agent.type)}</p></div></div>
                    <span className={`${active ? 'ep-status-success' : 'ep-status-warning'} rounded-full border px-2 py-0.5 text-[10px] font-extrabold`}>{agent.status || 'available'}</span>
                  </div>
                  <p className="mt-4 line-clamp-3 text-sm leading-6 text-[var(--ep-text-muted)]">{agent.description || 'Marketing specialist available to the coordinated workflow.'}</p>
                  <div className="mt-4 flex flex-wrap gap-2">{(agent.capabilities || []).slice(0, 4).map((capability) => <span key={capability} className="rounded-full bg-[var(--ep-surface-subtle)] px-2.5 py-1 text-[10px] font-semibold text-[var(--ep-text-muted)]">{title(capability)}</span>)}</div>
                  <div className="mt-4 flex items-center gap-2 border-t border-[var(--ep-border)] pt-3 text-xs text-[var(--ep-text-soft)]">{active ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ep-success)]" /> : <Clock3 className="h-3.5 w-3.5" />} {lastUsed ? `Last activity ${new Date(lastUsed).toLocaleString()}` : 'No recent customer-visible activity'}</div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
