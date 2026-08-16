'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowLeft, CheckCircle2, Clock3, History, Loader2,
  Copy, GitCompareArrows, RotateCcw, Save, Send, ShieldCheck, Sparkles, WandSparkles, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface ContentItem {
  id: string; title: string; body: string | null; type: string; platform: string | null;
  status: string; workflow_state: string; version: number; word_count: number;
  quality_score: number; metadata: Record<string, any>; updated_at: string;
}

interface ContentVersion { id: string; version: number; body?: string | null; change_summary: string | null; created_at: string; }
interface QualityCheck { id: string; check_type: string; score: number; passed: boolean; issues: Array<{ message: string; severity: string }>; }

export default function ContentEditorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [content, setContent] = useState<ContentItem | null>(null);
  const [versions, setVersions] = useState<ContentVersion[]>([]);
  const [checks, setChecks] = useState<QualityCheck[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisionInstruction, setRevisionInstruction] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [compareVersion, setCompareVersion] = useState<ContentVersion | null>(null);
  const initialised = useRef(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const revisionAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const load = useCallback(async () => {
    if (!params.id || !orgId) return;
    try {
      const [itemResponse, versionResponse, qualityResponse] = await Promise.all([
        api.get<ApiResponse<ContentItem>>(`/content-studio/${params.id}`, { params: { organization_id: orgId } }),
        api.get<ApiResponse<ContentVersion[]>>(`/content-studio/${params.id}/versions`, { params: { organization_id: orgId } }),
        api.get<ApiResponse<QualityCheck[]>>(`/content-studio/${params.id}/quality-checks`, { params: { organization_id: orgId } }),
      ]);
      setContent(itemResponse.data); setVersions(versionResponse.data); setChecks(qualityResponse.data);
      if (!initialised.current) { setTitle(itemResponse.data.title); setBody(itemResponse.data.body || ''); initialised.current = true; }
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load this asset'); }
    finally { setLoading(false); }
  }, [params.id, orgId]);

  useEffect(() => { void load(); }, [load]);

  const save = useCallback(async () => {
    if (!content || !dirty || saving) return;
    try {
      setSaving(true); setError(null);
      const response = await api.put<ApiResponse<ContentItem>>(`/content-studio/${content.id}`, {
        body: { organization_id: orgId, title: title.trim() || content.title, body },
      });
      setContent(response.data); setDirty(false);
      const versionResponse = await api.get<ApiResponse<ContentVersion[]>>(`/content-studio/${content.id}/versions`, { params: { organization_id: orgId } });
      setVersions(versionResponse.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Autosave failed'); }
    finally { setSaving(false); }
  }, [body, content, dirty, orgId, saving, title]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => void save(), 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, save]);

  const runAction = async (name: string, fn: () => Promise<unknown>) => {
    try { setAction(name); setError(null); await save(); await fn(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : `${name} failed`); }
    finally { setAction(null); }
  };

  const restore = (version: number) => runAction('restore', async () => {
    const response = await api.post<ApiResponse<ContentItem>>(`/content-studio/${params.id}/versions/${version}/restore`, { body: { organization_id: orgId } });
    setContent(response.data); setTitle(response.data.title); setBody(response.data.body || ''); setDirty(false);
  });

  const revise = async () => {
    const instruction = revisionInstruction.trim();
    if (!instruction) return;
    const editor = editorRef.current;
    const selectedText = editor && editor.selectionStart !== editor.selectionEnd
      ? body.slice(editor.selectionStart, editor.selectionEnd) : '';
    const fingerprint = JSON.stringify({ instruction, selectedText, version: content?.version });
    if (!revisionAttempt.current || revisionAttempt.current.fingerprint !== fingerprint) {
      revisionAttempt.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      setAction('revise'); setError(null); await save();
      const response = await api.post<ApiResponse<ContentItem>>(`/content-studio/${params.id}/revise`, { body: {
        organization_id: orgId, instruction, selected_text: selectedText || undefined,
        idempotency_key: `content-revision:${revisionAttempt.current.key}`,
      } });
      revisionAttempt.current = null; setRevisionInstruction('');
      setContent(response.data); setTitle(response.data.title); setBody(response.data.body || ''); setDirty(false);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Revision failed'); }
    finally { setAction(null); }
  };

  const duplicate = () => runAction('duplicate', async () => {
    const response = await api.post<ApiResponse<ContentItem>>(`/content-studio/${params.id}/duplicate`, { body: { organization_id: orgId } });
    router.push(`/content-studio/${response.data.id}`);
  });

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-brand-300" /></div>;
  if (!content) return <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-200">{error || 'Content not found'}</div>;

  const latestChecks = Object.values(checks.reduce<Record<string, QualityCheck>>((acc, check) => {
    if (!acc[check.check_type]) acc[check.check_type] = check; return acc;
  }, {}));
  const qualityPassed = latestChecks.length > 0 && latestChecks.every(check => check.passed);

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3"><button onClick={()=>router.back()} className="rounded-lg p-2 text-zinc-400 hover:bg-white/[0.04] hover:text-white"><ArrowLeft className="h-5 w-5" /></button>
        <div><div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-white">Studio editor</h1><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-xs text-zinc-300">v{content.version}</span></div>
          <p className="mt-1 text-sm text-zinc-400">{content.type}{content.platform ? ` for ${content.platform}` : ''} · {content.word_count} words · {content.workflow_state.replaceAll('_',' ')}</p></div></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={()=>void save()} disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-200 disabled:opacity-40">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}{saving?'Saving':'Save'}</button>
        <button onClick={()=>runAction('quality',()=>api.post(`/content-studio/${content.id}/quality-check`,{body:{organization_id:orgId}}))} disabled={Boolean(action)} className="inline-flex items-center gap-2 rounded-lg bg-purple-500/10 px-3 py-2 text-sm font-semibold text-purple-200"><Sparkles className="h-4 w-4"/>Check quality</button>
        <button onClick={duplicate} disabled={Boolean(action)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-200 disabled:opacity-40"><Copy className="h-4 w-4"/>Duplicate</button>
        {content.status==='draft' && <button onClick={()=>runAction('submit',()=>api.post(`/content-studio/${content.id}/submit`,{body:{organization_id:orgId}}))} disabled={!qualityPassed||Boolean(action)} title={!qualityPassed?'Resolve quality checks first':'Submit this exact version'} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"><Send className="h-4 w-4"/>Submit</button>}
        {content.status==='review' && <button onClick={()=>runAction('approve',()=>api.post(`/content-studio/${content.id}/approve`,{body:{organization_id:orgId,comments:reviewComment.trim()||'Owner-approved in Studio'}}))} disabled={Boolean(action)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4"/>Approve</button>}
      </div>
    </div>

    {error && <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3"><AlertCircle className="h-4 w-4 text-red-300"/><p className="text-sm text-red-200">{error}</p><button onClick={()=>setError(null)} className="ml-auto"><X className="h-4 w-4"/></button></div>}

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <main className="space-y-4 rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        {content.status==='review' && <section aria-label="Review decision" className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4"><label className="block text-sm font-medium text-zinc-200">Review comment<input value={reviewComment} onChange={event=>setReviewComment(event.target.value)} placeholder="Approval note or required change" className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-amber-400/50"/></label><button onClick={()=>runAction('reject',()=>api.post(`/content-studio/${content.id}/reject`,{body:{organization_id:orgId,comments:reviewComment}}))} disabled={!reviewComment.trim()||Boolean(action)} className="mt-3 rounded-lg border border-red-500/30 px-3 py-2 text-sm font-semibold text-red-200 disabled:opacity-40">Request changes</button></section>}
        <label className="block"><span className="mb-1.5 block text-sm font-medium text-zinc-300">Title</span><input value={title} onChange={event=>{setTitle(event.target.value);setDirty(true);}} className="h-11 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 text-base font-semibold text-white outline-none focus:border-brand-500/50"/></label>
        <label className="block"><span className="mb-1.5 block text-sm font-medium text-zinc-300">Content</span><textarea ref={editorRef} value={body} onChange={event=>{setBody(event.target.value);setDirty(true);}} rows={24} className="w-full resize-y rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-3 font-mono text-sm leading-7 text-zinc-100 outline-none focus:border-brand-500/50"/></label>
        <section aria-label="Targeted revision" className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4"><div className="flex items-start gap-3"><WandSparkles className="mt-0.5 h-4 w-4 text-purple-300"/><div className="flex-1"><h2 className="text-sm font-semibold text-white">Targeted revision</h2><p className="mt-1 text-xs text-zinc-400">Select text above to revise only that section, or leave nothing selected to revise this asset. Other campaign assets stay untouched.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={revisionInstruction} onChange={event=>setRevisionInstruction(event.target.value)} placeholder="Make the opening more specific and concise" className="h-10 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-white outline-none focus:border-purple-400/50"/><button onClick={revise} disabled={!revisionInstruction.trim()||Boolean(action)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{action==='revise'?<Loader2 className="h-4 w-4 animate-spin"/>:<WandSparkles className="h-4 w-4"/>}Revise</button></div></div></div></section>
        {compareVersion && <section aria-label={`Compare version ${compareVersion.version}`} className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-white">Version {compareVersion.version} compared with current</h2><button aria-label="Close comparison" onClick={()=>setCompareVersion(null)} className="text-zinc-400 hover:text-white"><X className="h-4 w-4"/></button></div><div className="mt-3 grid gap-3 lg:grid-cols-2"><div><p className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">Version {compareVersion.version}</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-3 text-xs leading-5 text-zinc-300">{compareVersion.body||'No content'}</pre></div><div><p className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">Current</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-black/20 p-3 text-xs leading-5 text-zinc-300">{body}</pre></div></div></section>}
        <div className="flex items-center gap-2 text-xs text-zinc-500">{saving?<Loader2 className="h-3.5 w-3.5 animate-spin"/>:<Clock3 className="h-3.5 w-3.5"/>}{dirty?'Unsaved changes':'All changes saved as a restorable version'}</div>
      </main>

      <aside className="space-y-4">
        <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><CheckCircle2 className={`h-4 w-4 ${qualityPassed?'text-emerald-300':'text-amber-300'}`}/>Quality gates</h2>
          {latestChecks.length===0?<p className="mt-3 text-xs text-zinc-500">Run the checks before submitting.</p>:<div className="mt-3 space-y-2">{latestChecks.map(check=><div key={check.check_type} className="rounded-lg bg-white/[0.025] p-3"><div className="flex justify-between gap-3 text-xs"><span className="font-medium text-zinc-200">{check.check_type.replaceAll('_',' ')}</span><span className={check.passed?'text-emerald-300':'text-amber-300'}>{Math.round(check.score)}%</span></div>{check.issues.slice(0,2).map(issue=><p key={issue.message} className="mt-1 text-[11px] leading-4 text-zinc-500">{issue.message}</p>)}</div>)}</div>}
        </section>
        <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"><h2 className="flex items-center gap-2 text-sm font-semibold text-white"><History className="h-4 w-4 text-blue-300"/>Version history</h2>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{versions.map(version=><div key={version.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] p-3"><div><p className="text-xs font-medium text-zinc-200">Version {version.version}</p><p className="mt-0.5 text-[11px] text-zinc-500">{new Date(version.created_at).toLocaleString()}</p></div><div className="flex items-center"><button onClick={()=>setCompareVersion(version)} aria-label={`Compare version ${version.version}`} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white"><GitCompareArrows className="h-3.5 w-3.5"/></button>{version.version!==content.version&&<button onClick={()=>restore(version.version)} disabled={Boolean(action)} aria-label={`Restore version ${version.version}`} className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.05] hover:text-white"><RotateCcw className="h-3.5 w-3.5"/></button>}</div></div>)}</div>
        </section>
      </aside>
    </div>
  </div>;
}
