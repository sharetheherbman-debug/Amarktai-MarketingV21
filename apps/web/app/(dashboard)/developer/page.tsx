'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Code,
  Key,
  Plus,
  Loader2,
  AlertCircle,
  X,
  Copy,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  Shield,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface OAuthApp {
  id: string;
  name: string;
  description: string | null;
  client_id: string;
  redirect_uris: string[];
  scopes: string[];
  status: string;
  created_at: string;
}

export default function DeveloperPortalPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [oauthApps, setOAuthApps] = useState<OAuthApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'api-keys' | 'oauth' | 'sdk'>('api-keys');
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [showCreateApp, setShowCreateApp] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newAppName, setNewAppName] = useState('');
  const [newAppRedirect, setNewAppRedirect] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [keysRes, appsRes] = await Promise.all([
        api.get<ApiResponse<ApiKey[]>>('/developer/api-keys', { params: { organization_id: orgId } }),
        api.get<ApiResponse<OAuthApp[]>>('/developer/oauth/apps'),
      ]);
      setApiKeys(keysRes.data);
      setOAuthApps(appsRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreateKey = async () => {
    if (!newKeyName || !orgId) return;
    try {
      const res = await api.post<ApiResponse<ApiKey>>('/developer/api-keys', {
        body: { organization_id: orgId, name: newKeyName },
      });
      setCreatedKey((res as any).meta?.plain_key || null);
      setShowCreateKey(false);
      setNewKeyName('');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create key');
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    if (!confirm('Revoke this API key?')) return;
    try {
      await api.delete(`/developer/api-keys/${keyId}`);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke key');
    }
  };

  const handleCreateApp = async () => {
    if (!newAppName || !newAppRedirect) return;
    try {
      const res = await api.post<ApiResponse<OAuthApp>>('/developer/oauth/apps', {
        body: {
          name: newAppName,
          redirect_uris: [newAppRedirect],
          organization_id: orgId,
        },
      });
      setCreatedSecret((res as any).meta?.client_secret || null);
      setShowCreateApp(false);
      setNewAppName('');
      setNewAppRedirect('');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create app');
    }
  };

  const handleDeleteApp = async (clientId: string) => {
    if (!confirm('Delete this OAuth app?')) return;
    try {
      await api.delete(`/developer/oauth/apps/${clientId}`);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete app');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Developer Portal</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manage API keys, OAuth applications, and access the SDK.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {createdKey && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm font-medium text-emerald-400">API Key Created</p>
          <p className="mt-1 text-xs text-zinc-400">Copy this key now. It will not be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-white/[0.04] px-3 py-2 text-xs text-white">{createdKey}</code>
            <button onClick={() => { copyToClipboard(createdKey); setCreatedKey(null); }}
              className="rounded-lg bg-brand-500 px-3 py-2 text-xs text-white hover:bg-brand-400">
              Copy & Close
            </button>
          </div>
        </div>
      )}

      {createdSecret && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-sm font-medium text-emerald-400">OAuth App Created</p>
          <p className="mt-1 text-xs text-zinc-400">Copy this client secret now. It will not be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-white/[0.04] px-3 py-2 text-xs text-white">{createdSecret}</code>
            <button onClick={() => { copyToClipboard(createdSecret); setCreatedSecret(null); }}
              className="rounded-lg bg-brand-500 px-3 py-2 text-xs text-white hover:bg-brand-400">
              Copy & Close
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] p-1">
        {([['api-keys', 'API Keys', Key], ['oauth', 'OAuth Apps', Shield], ['sdk', 'SDK', Code]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key as typeof tab)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${tab === key ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:text-white'}`}>
            <Icon className="h-4 w-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'api-keys' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">API Keys</h2>
            <button onClick={() => setShowCreateKey(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-400">
              <Plus className="h-3.5 w-3.5" />Create Key
            </button>
          </div>

          {showCreateKey && (
            <div className="rounded-lg border border-white/[0.06] bg-surface-100 p-4">
              <div className="flex gap-3">
                <input type="text" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Key name" className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none" />
                <button onClick={handleCreateKey} className="rounded-lg bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-400">Create</button>
                <button onClick={() => setShowCreateKey(false)} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
              </div>
            </div>
          )}

          {apiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-surface-100 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">{key.name}</p>
                <p className="text-xs text-zinc-500">{key.key_prefix}...{key.scopes.length > 0 && ` • ${key.scopes.join(', ')}`}</p>
              </div>
              <div className="flex items-center gap-2">
                {key.last_used_at && <span className="text-xs text-zinc-500">Used {new Date(key.last_used_at).toLocaleDateString()}</span>}
                <button onClick={() => handleRevokeKey(key.id)} className="rounded p-1.5 text-zinc-400 hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {apiKeys.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">No API keys yet</p>
          )}
        </div>
      )}

      {tab === 'oauth' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">OAuth Applications</h2>
            <button onClick={() => setShowCreateApp(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-400">
              <Plus className="h-3.5 w-3.5" />Create App
            </button>
          </div>

          {showCreateApp && (
            <div className="rounded-lg border border-white/[0.06] bg-surface-100 p-4 space-y-3">
              <input type="text" value={newAppName} onChange={(e) => setNewAppName(e.target.value)}
                placeholder="App name" className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none" />
              <input type="url" value={newAppRedirect} onChange={(e) => setNewAppRedirect(e.target.value)}
                placeholder="Redirect URI (https://...)" className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none" />
              <div className="flex gap-3">
                <button onClick={handleCreateApp} className="rounded-lg bg-brand-500 px-4 py-2 text-sm text-white hover:bg-brand-400">Create</button>
                <button onClick={() => setShowCreateApp(false)} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
              </div>
            </div>
          )}

          {oauthApps.map((app) => (
            <div key={app.id} className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-surface-100 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-white">{app.name}</p>
                <p className="text-xs text-zinc-500">Client ID: {app.client_id}</p>
              </div>
              <button onClick={() => handleDeleteApp(app.client_id)} className="rounded p-1.5 text-zinc-400 hover:text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          {oauthApps.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-500">No OAuth apps yet</p>
          )}
        </div>
      )}

      {tab === 'sdk' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="text-lg font-semibold text-white">TypeScript SDK</h2>
            <p className="mt-2 text-sm text-zinc-400">Official SDK for integrating with the EquiProfile Marketing API.</p>
            <div className="mt-4 rounded-lg bg-white/[0.02] p-4">
              <code className="text-sm text-brand-400">npm install @amarktai/sdk</code>
            </div>
            <div className="mt-4 flex gap-3">
              <a href="https://docs.amarktai.co.za/sdk" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] px-4 py-2 text-sm text-zinc-400 hover:text-white">
                <ExternalLink className="h-4 w-4" />Documentation
              </a>
              <a href="https://github.com/amarktai/sdk" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] px-4 py-2 text-sm text-zinc-400 hover:text-white">
                <ExternalLink className="h-4 w-4" />GitHub
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="text-lg font-semibold text-white">REST API</h2>
            <p className="mt-2 text-sm text-zinc-400">Base URL for all API requests:</p>
            <div className="mt-4 rounded-lg bg-white/[0.02] p-4">
              <code className="text-sm text-brand-400">https://api.amarktai.co.za/v1</code>
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="text-lg font-semibold text-white">Webhook Events</h2>
            <p className="mt-2 text-sm text-zinc-400">Available webhook events:</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {['content.created', 'content.published', 'campaign.completed', 'contact.created', 'deal.won', 'invoice.paid'].map((event) => (
                <span key={event} className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-zinc-400">{event}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
