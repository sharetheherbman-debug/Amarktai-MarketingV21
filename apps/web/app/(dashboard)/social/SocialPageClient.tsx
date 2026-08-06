'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Link2, Loader2, RefreshCw, Send, Share2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface SocialConnection {
  id: string;
  platform: string;
  account_name: string | null;
  status: string;
}

interface SocialPost {
  id: string;
  platform: string;
  body: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
}

const PLATFORMS = ['facebook', 'instagram', 'linkedin', 'x', 'threads', 'pinterest', 'reddit', 'youtube'];

export default function SocialPageClient() {
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [platform, setPlatform] = useState('instagram');
  const [accountName, setAccountName] = useState('');

  const load = useCallback(async () => {
    const organizationId = window.localStorage.getItem('org_id') || '';
    if (!organizationId) {
      setLoading(false);
      setError('Select an organization before managing social accounts.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [connectionsResponse, postsResponse] = await Promise.all([
        api.get<ApiResponse<SocialConnection[]>>('/amai/social/connections', {
          params: { organization_id: organizationId },
        }),
        api.get<ApiResponse<SocialPost[]>>('/amai/social/posts', {
          params: { organization_id: organizationId },
        }),
      ]);
      setConnections(connectionsResponse.data || []);
      setPosts(postsResponse.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load social publishing data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connectAccount = async () => {
    const organizationId = window.localStorage.getItem('org_id') || '';
    if (!organizationId || !accountName.trim()) return;

    setSaving(true);
    setError(null);
    try {
      await api.post('/amai/social/connections', {
        body: {
          organization_id: organizationId,
          platform,
          account_name: accountName.trim(),
        },
      });
      setAccountName('');
      setShowConnect(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to connect the social account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Social Publishing</h1>
          <p className="mt-1 text-sm text-zinc-400">Connect channels, review publishing status and manage recent posts.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowConnect(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400"
          >
            <Link2 className="h-4 w-4" /> Connect account
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showConnect && (
        <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white">Connect social account</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm text-zinc-300">
              <span>Platform</span>
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white"
              >
                {PLATFORMS.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm text-zinc-300">
              <span>Account name</span>
              <input
                value={accountName}
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="@mybrand"
                className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white placeholder:text-zinc-600"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={saving || !accountName.trim()}
              onClick={() => void connectAccount()}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? 'Connecting…' : 'Connect'}
            </button>
            <button type="button" onClick={() => setShowConnect(false)} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5">
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {connections.map((connection) => (
          <article key={connection.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
            <div className="flex items-center gap-3">
              <Share2 className="h-5 w-5 text-brand-400" />
              <div>
                <h2 className="text-sm font-semibold capitalize text-white">{connection.platform}</h2>
                <p className="text-xs text-zinc-500">{connection.account_name || 'Connected account'}</p>
              </div>
            </div>
            <p className="mt-4 text-xs capitalize text-zinc-400">Status: {connection.status}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-surface-100">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Recent posts</h2>
          <span className="text-xs text-zinc-500">{posts.length} total</span>
        </div>
        {loading ? (
          <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-brand-400" /></div>
        ) : posts.length === 0 ? (
          <div className="py-14 text-center">
            <Send className="mx-auto h-7 w-7 text-zinc-600" />
            <p className="mt-3 text-sm text-zinc-500">No social posts have been created yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {posts.slice(0, 20).map((post) => (
              <article key={post.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{post.body || 'Untitled social post'}</p>
                  <p className="mt-1 text-xs capitalize text-zinc-500">{post.platform}</p>
                </div>
                <span className="rounded-full bg-white/5 px-3 py-1 text-xs capitalize text-zinc-300">{post.status}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
