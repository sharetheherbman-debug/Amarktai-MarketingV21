'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink, FileCheck2, Loader2, MessageSquareText, RotateCcw, Workflow, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

type ReviewItem = {
  id: string;
  title: string;
  type?: string;
  platform?: string | null;
  status?: string;
  version?: number;
  quality_score?: number;
  updated_at?: string;
};

type Decision = 'approve' | 'request-changes' | 'reject';

export default function ApprovalsPage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<ApiResponse<ReviewItem[]>>('/content-studio', {
        params: { organization_id: orgId, status: 'review' },
      });
      setItems(response.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The approval queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (item: ReviewItem, decision: Decision) => {
    const note = comments[item.id]?.trim() || '';
    if (decision !== 'approve' && !note) {
      setError('Add a clear reason before requesting changes or rejecting content.');
      return;
    }
    setBusy(item.id);
    setError(null);
    try {
      await api.post(`/content-studio/${item.id}/${decision}`, {
        body: { organization_id: orgId, comments: note || undefined },
      });
      setComments((current) => ({ ...current, [item.id]: '' }));
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The owner decision could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--ep-blue)]" /></div>;

  return (
    <div className="space-y-6">
      <header className="ep-panel p-6 sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="ep-section-label">Workflows & Approvals</p>
            <h1 className="ep-page-title mt-2">Review the exact content versions waiting for you.</h1>
            <p className="ep-page-copy mt-3 max-w-2xl text-sm leading-6 sm:text-base">Approve, request targeted changes or reject customer-facing work. These owner decisions remain separate from automation mode and cannot be replaced by autonomous execution.</p>
          </div>
          <div className="rounded-2xl bg-[var(--ep-blue-soft)] px-5 py-4"><p className="text-xs font-bold text-[var(--ep-text-muted)]">Awaiting owner</p><p className="mt-1 text-3xl font-extrabold text-[var(--ep-navy)]">{items.length}</p></div>
        </div>
      </header>

      {error && <div className="ep-status-danger rounded-xl border px-4 py-3 text-sm font-semibold">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2">
        <Link href="/content-studio" className="ep-card group p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-[var(--ep-blue-soft)] p-2.5 text-[var(--ep-blue)]"><FileCheck2 className="h-5 w-5" /></div><div><h2 className="font-extrabold text-[var(--ep-navy)]">Content workflow</h2><p className="mt-1 text-sm leading-5 text-[var(--ep-text-muted)]">Open the full Content Studio for drafts, versions, quality checks and approved work.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--ep-blue)]">Open Content Studio <ExternalLink className="h-3.5 w-3.5" /></span></div></div></Link>
        <Link href="/workflows" className="ep-card group p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-[var(--ep-blue-soft)] p-2.5 text-[var(--ep-blue)]"><Workflow className="h-5 w-5" /></div><div><h2 className="font-extrabold text-[var(--ep-navy)]">Workflow runs</h2><p className="mt-1 text-sm leading-5 text-[var(--ep-text-muted)]">Inspect existing automated workflow definitions and execution state without changing launch safety.</p><span className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-[var(--ep-blue)]">Open workflows <ExternalLink className="h-3.5 w-3.5" /></span></div></div></Link>
      </section>

      {items.length === 0 ? (
        <section className="ep-card py-16 text-center"><Check className="mx-auto h-9 w-9 text-[var(--ep-success)]" /><h2 className="mt-4 text-lg font-extrabold text-[var(--ep-navy)]">Nothing is waiting for approval.</h2><p className="mt-2 text-sm text-[var(--ep-text-muted)]">New items appear here after the latest version passes required quality checks and is submitted for owner review.</p></section>
      ) : (
        <section className="space-y-4">
          {items.map((item) => (
            <article key={item.id} className="ep-card p-5 sm:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="ep-status-warning rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide">Owner review</span>{item.version ? <span className="text-xs font-bold text-[var(--ep-text-soft)]">Version {item.version}</span> : null}</div>
                  <h2 className="mt-3 text-xl font-extrabold text-[var(--ep-navy)]">{item.title}</h2>
                  <p className="mt-1 text-sm text-[var(--ep-text-muted)]">{item.type || 'Content'}{item.platform ? ` · ${item.platform}` : ''}{Number.isFinite(Number(item.quality_score)) ? ` · Quality ${Number(item.quality_score).toFixed(0)}` : ''}</p>
                </div>
                <Link href={`/content-studio/${item.id}`} className="ep-button-secondary shrink-0 px-3 py-2 text-xs"><ExternalLink className="h-3.5 w-3.5" /> Inspect exact version</Link>
              </div>

              <label className="mt-5 block text-xs font-extrabold uppercase tracking-wide text-[var(--ep-text-muted)]">Owner note / requested change</label>
              <textarea value={comments[item.id] || ''} onChange={(event) => setComments((current) => ({ ...current, [item.id]: event.target.value }))} rows={3} placeholder="Optional for approval; required for changes or rejection." className="ep-input mt-2 resize-y px-3 py-3 text-sm leading-6" />

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy === item.id} onClick={() => void decide(item, 'approve')} className="ep-button-primary px-4 py-2.5 text-sm">{busy === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve</button>
                <button type="button" disabled={busy === item.id} onClick={() => void decide(item, 'request-changes')} className="ep-button-secondary px-4 py-2.5 text-sm"><RotateCcw className="h-4 w-4" /> Request changes</button>
                <button type="button" disabled={busy === item.id} onClick={() => void decide(item, 'reject')} className="inline-flex items-center gap-2 rounded-[var(--ep-radius-sm)] border border-[#e5b9b4] bg-white px-4 py-2.5 text-sm font-bold text-[var(--ep-danger)] hover:bg-[var(--ep-danger-soft)]"><X className="h-4 w-4" /> Reject</button>
              </div>
              <div className="mt-4 flex items-start gap-2 border-t border-[var(--ep-border)] pt-3 text-xs leading-5 text-[var(--ep-text-soft)]"><MessageSquareText className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Request Changes preserves the owner decision trail and returns the content to revision rather than silently approving a replacement.</div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
