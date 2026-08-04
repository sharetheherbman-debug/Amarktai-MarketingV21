'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Share2,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Globe,
  Calendar,
  Send,
  Link2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface SocialConnection { id: string; platform: string; account_name: string | null; status: string; }
interface SocialPost { id: string; platform: string; body: string | null; status: string; scheduled_at: string | null; published_at: string | null; created_at: string; }

const platforms = ['facebook', 'instagram', 'linkedin', 'x', 'threads', 'pinterest', 'reddit', 'youtube'];

export default function SocialPage() {
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);
  const [newPlatform, setNewPlatform] = useState('instagram');
  const [newAccount, setNewAccount] = useState('');

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [connRes, postRes] = await Promise.all([
        api.get<ApiResponse<SocialConnection[]>>('/amai/social/connections', { params: { organization_id: orgId } }),
        api.get<ApiResponse<SocialPost[]>>('/amai/social/posts', { params: { organization_id: orgId } }),
      ]);
      setConnections(connRes.data);
      setPosts(postRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleConnect = async () => {
    if (!newAccount || !orgId) return;
    try {
      await api.post('/amai/social/connections', { body: { organization_id: orgId, platform: newPlatform, account_name: newAccount } });
      setShowConnect(false);
      setNewAccount('');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Social Publishing</h1>
          <p className="mt-1 text-sm text-zinc-400">Connect accounts and publish across platforms.</p>
        </div>
        <button onClick={() => setShowConnect(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400">
          <Link2 className="h-4 w-4" />Connect Account
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" /><p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      {showConnect && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Connect Social Account</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Platform</label>
              <select value={newPlatform} onChange={e => setNewPlatform(e.target.value)}
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white outline-none focus:border-brand-500/50">
                {platforms.map(p => <option key={p} value={p}>{p}</option>)}
              </select></div>
            <div><label className="block text-sm font-medium text-zinc-300 mb-1.5">Account Name</label>
              <input type="text" value={newAccount} onChange={e => setNewAccount(e.target.value)} placeholder="@mybrand"
                className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" /></div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button onClick={handleConnect} disabled={!newAccount}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400 disabled:opacity-50">
              <Link2 className="h-4 w-4" />Connect
            </button>
            <button onClick={() => setShowConnect(false)} className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-400 hover:bg-white/[0.04]">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {connections.map(conn => (
          <div key={conn.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                <Globe className="h-5 w-5 text-brand-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white capitalize">{conn.platform}</h3>
                <p className="text-xs text-zinc-500">{conn.account_name}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${conn.status === 'active' ? 'bg-emerald-400' : 'bg-zinc-500'}`} />
              <span className="text-xs text-zinc-400 capitalize">{conn.status}</span>
            </div>
          </div>
        ))}
        {connections.length === 0 && !loading && (
          <div className="col-span-full rounded-xl border border-white/[0.06] bg-surface-100 py-12 text-center">
            <Share2 className="mx-auto h-8 w-8 text-zinc-500" />
            <p className="mt-4 text-sm text-zinc-400">No social accounts connected yet.</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-surface-100">
        <div className="border-b border-white/[0.06] px-6 py-4">
          <h2 className="text-sm font-semibold text-white">Recent Posts ({posts.length})</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand-400" /></div>
        ) : posts.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-500">No posts yet.</div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {posts.slice(0, 10).map(post => (
              <div key={post.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm text-white truncate max-w-md">{post.body}</p>
                  <p className="text-xs text-zinc-500 capitalize">{post.platform}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${post.status === 'published' ? 'bg-emerald-500/10 text-emerald-400' : post.status === 'scheduled' ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-500/10 text-zinc-400'}`}>
                    {post.status}
                  </span>
                  {post.scheduled_at && <span className="text-xs text-zinc-500">{new Date(post.scheduled_at).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
