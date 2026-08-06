'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Send, Share2, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface SocialConnection {
  id: string;
  platform: string;
  account_name: string | null;
  account_id: string | null;
  status: string;
  config: Record<string, unknown>;
  last_sync_at: string | null;
}

interface SocialPost {
  id: string;
  connection_id: string | null;
  platform: string;
  body: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  external_url: string | null;
  error: string | null;
  created_at: string;
}

const PLATFORMS = ['facebook', 'instagram', 'linkedin', 'x', 'threads', 'pinterest', 'reddit', 'youtube'];

function configLabel(platform: string): string | null {
  return ({
    facebook: 'Page ID',
    instagram: 'Instagram business account ID',
    linkedin: 'Author URN',
    threads: 'Threads user ID',
    pinterest: 'Board ID',
    reddit: 'Subreddit',
    youtube: 'Privacy status',
  } as Record<string, string>)[platform] || null;
}

function configKey(platform: string): string | null {
  return ({
    facebook: 'page_id', instagram: 'account_id', linkedin: 'author_urn', threads: 'user_id',
    pinterest: 'board_id', reddit: 'subreddit', youtube: 'privacy_status',
  } as Record<string, string>)[platform] || null;
}

export default function SocialPageClient() {
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [platform, setPlatform] = useState('instagram');
  const [accountName, setAccountName] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [platformValue, setPlatformValue] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [body, setBody] = useState('');
  const [mediaUrls, setMediaUrls] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const organizationId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const load = useCallback(async () => {
    if (!organizationId) {
      setLoading(false);
      setError('Select an organization before managing social accounts.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [connectionResponse, postResponse] = await Promise.all([
        api.get<ApiResponse<SocialConnection[]>>('/amai/social/connections'),
        api.get<ApiResponse<SocialPost[]>>('/amai/social/posts'),
      ]);
      setConnections(connectionResponse.data || []);
      setPosts(postResponse.data || []);
      setConnectionId((current) => current || connectionResponse.data?.[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load social publishing data.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const selectedConnection = useMemo(() => connections.find((connection) => connection.id === connectionId), [connections, connectionId]);

  const connectAccount = async () => {
    if (!organizationId || !accountName.trim() || !accessToken.trim()) return;
    const key = configKey(platform);
    const config: Record<string, unknown> = {};
    if (key && platformValue.trim()) config[key] = platformValue.trim();
    if (platform === 'reddit') config.user_agent = 'AmarktAI/1.0';
    setSaving(true);
    setError(null);
    try {
      const response = await api.post<ApiResponse<SocialConnection>>('/amai/social/connections', {
        body: { platform, account_name: accountName.trim(), credentials: { access_token: accessToken.trim() }, config },
      });
      await api.post(`/amai/social/connections/${response.data.id}/test`, { body: {} });
      setAccountName('');
      setAccessToken('');
      setPlatformValue('');
      setShowConnect(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to connect the social account.');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (id: string) => {
    setBusyId(id);
    try { await api.post(`/amai/social/connections/${id}/test`, { body: {} }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Connection test failed.'); }
    finally { setBusyId(null); }
  };

  const deleteConnection = async (id: string) => {
    if (!confirm('Delete this social connection?')) return;
    setBusyId(id);
    try { await api.delete(`/amai/social/connections/${id}`); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Connection deletion failed.'); }
    finally { setBusyId(null); }
  };

  const createPost = async (publishNow: boolean) => {
    if (!connectionId || !body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post('/amai/social/posts', {
        body: {
          connection_id: connectionId,
          body: body.trim(),
          media_urls: mediaUrls.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
          hashtags: hashtags.split(/[\s,]/).map((value) => value.trim()).filter(Boolean).map((value) => value.startsWith('#') ? value : `#${value}`),
          scheduled_at: publishNow ? undefined : scheduledAt || undefined,
          publish_now: publishNow,
        },
      });
      setBody('');
      setMediaUrls('');
      setHashtags('');
      setScheduledAt('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Post creation failed.');
    } finally {
      setSaving(false);
    }
  };

  const publishPost = async (id: string) => {
    setBusyId(id);
    try { await api.post(`/amai/social/posts/${id}/publish`, { body: {} }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Publishing failed.'); }
    finally { setBusyId(null); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Social Publishing</h1>
          <p className="mt-1 text-sm text-zinc-400">Connect real platform APIs, compose posts, schedule delivery and inspect provider failures.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5"><RefreshCw className="h-4 w-4" /> Refresh</button>
          <button type="button" onClick={() => setShowConnect(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400"><Link2 className="h-4 w-4" /> Connect account</button>
        </div>
      </header>

      {error && <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3"><AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p><button type="button" onClick={() => setError(null)} className="ml-auto text-red-400"><X className="h-4 w-4" /></button></div>}

      {showConnect && (
        <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white">Connect social account</h2>
          <p className="mt-1 text-xs text-zinc-500">Use a platform access token with publish permissions. Tokens are encrypted before storage.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm text-zinc-300"><span>Platform</span><select value={platform} onChange={(event) => { setPlatform(event.target.value); setPlatformValue(''); }} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white">{PLATFORMS.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="space-y-1.5 text-sm text-zinc-300"><span>Account name</span><input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="My brand account" className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>
            <label className="space-y-1.5 text-sm text-zinc-300"><span>Access token</span><input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} placeholder="Platform OAuth access token" className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>
            {configLabel(platform) && <label className="space-y-1.5 text-sm text-zinc-300"><span>{configLabel(platform)}</span><input value={platformValue} onChange={(event) => setPlatformValue(event.target.value)} placeholder={platform === 'youtube' ? 'private, unlisted, or public' : 'Required platform identifier'} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>}
          </div>
          <div className="mt-4 flex gap-2"><button type="button" disabled={saving || !accountName.trim() || !accessToken.trim()} onClick={() => void connectAccount()} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Connecting…' : 'Connect and test'}</button><button type="button" onClick={() => setShowConnect(false)} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5">Cancel</button></div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {connections.map((connection) => (
          <article key={connection.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
            <div className="flex items-center gap-3"><Share2 className="h-5 w-5 text-brand-400" /><div><h2 className="text-sm font-semibold capitalize text-white">{connection.platform}</h2><p className="text-xs text-zinc-500">{connection.account_name || connection.account_id}</p></div></div>
            <div className="mt-4 flex items-center justify-between"><span className={`inline-flex items-center gap-1 text-xs capitalize ${connection.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>{connection.status === 'active' && <CheckCircle2 className="h-3.5 w-3.5" />}{connection.status}</span><div className="flex gap-1"><button type="button" onClick={() => void testConnection(connection.id)} className="rounded p-1.5 text-zinc-400 hover:bg-white/5">{busyId === connection.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button><button type="button" onClick={() => void deleteConnection(connection.id)} className="rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div></div>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <h2 className="text-lg font-semibold text-white">Compose and publish</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-sm text-zinc-300"><span>Connection</span><select value={connectionId} onChange={(event) => setConnectionId(event.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white"><option value="">Select an active account</option>{connections.filter((connection) => connection.status === 'active').map((connection) => <option key={connection.id} value={connection.id}>{connection.platform} — {connection.account_name}</option>)}</select></label>
          <label className="space-y-1.5 text-sm text-zinc-300"><span>Schedule time</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>
          <label className="space-y-1.5 text-sm text-zinc-300 md:col-span-2"><span>Post body</span><textarea rows={5} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write the post that will be sent to the selected platform." className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-white" /></label>
          <label className="space-y-1.5 text-sm text-zinc-300"><span>Public media URLs</span><textarea rows={3} value={mediaUrls} onChange={(event) => setMediaUrls(event.target.value)} placeholder="One image or video URL per line" className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-white" /></label>
          <label className="space-y-1.5 text-sm text-zinc-300"><span>Hashtags</span><textarea rows={3} value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="#marketing #launch" className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-white" /></label>
        </div>
        <p className="mt-3 text-xs text-zinc-500">Selected: {selectedConnection ? `${selectedConnection.platform} / ${selectedConnection.account_name}` : 'none'}. Instagram, Pinterest and YouTube require a media URL.</p>
        <div className="mt-4 flex gap-2"><button type="button" disabled={saving || !connectionId || !body.trim()} onClick={() => void createPost(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" /> Publish now</button><button type="button" disabled={saving || !connectionId || !body.trim() || !scheduledAt} onClick={() => void createPost(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white disabled:opacity-50">Schedule</button></div>
      </section>

      <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-surface-100">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4"><h2 className="text-sm font-semibold text-white">Publishing history</h2><span className="text-xs text-zinc-500">{posts.length} total</span></div>
        {loading ? <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-brand-400" /></div> : posts.length === 0 ? <div className="py-14 text-center"><Send className="mx-auto h-7 w-7 text-zinc-600" /><p className="mt-3 text-sm text-zinc-500">No posts created yet.</p></div> : <div className="divide-y divide-white/[0.06]">{posts.slice(0, 50).map((post) => <article key={post.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"><div className="min-w-0"><p className="truncate text-sm text-white">{post.body}</p><p className="mt-1 text-xs capitalize text-zinc-500">{post.platform}{post.scheduled_at ? ` · ${new Date(post.scheduled_at).toLocaleString()}` : ''}</p>{post.error && <p className="mt-1 text-xs text-red-400">{post.error}</p>}</div><div className="flex items-center gap-2"><span className="rounded-full bg-white/5 px-3 py-1 text-xs capitalize text-zinc-300">{post.status}</span>{['draft', 'failed'].includes(post.status) && <button type="button" onClick={() => void publishPost(post.id)} className="rounded bg-brand-500 px-3 py-1 text-xs text-white">Retry/publish</button>}{post.external_url && <a href={post.external_url} target="_blank" rel="noreferrer" className="text-brand-400"><ExternalLink className="h-4 w-4" /></a>}</div></article>)}</div>}
      </section>
    </div>
  );
}
