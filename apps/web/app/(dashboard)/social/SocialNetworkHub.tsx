'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw,
  Send, Share2, ShieldCheck, Trash2, X,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface PlatformCapability {
  enabled: boolean;
  formats: readonly string[];
  notes: string;
}

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
  engagement?: Record<string, unknown>;
  error: string | null;
  created_at: string;
}

interface ApprovedSocialContent {
  id: string;
  title: string;
  body: string | null;
  platform: string | null;
  version: number;
  metadata: Record<string, unknown>;
}

type SetupDefinition = {
  primarySecretLabel: string;
  primarySecretPlaceholder: string;
  secondarySecretLabel?: string;
  secondarySecretPlaceholder?: string;
  configLabel?: string;
  configKey?: string;
  configPlaceholder?: string;
  secondaryConfigLabel?: string;
  secondaryConfigKey?: string;
  secondaryConfigPlaceholder?: string;
  warning?: string;
  consent?: boolean;
};

const PLATFORM_ORDER = [
  'instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'x', 'threads',
  'pinterest', 'reddit', 'bluesky', 'mastodon', 'telegram',
];

const SETUP: Record<string, SetupDefinition> = {
  x: {
    primarySecretLabel: 'OAuth access token',
    primarySecretPlaceholder: 'X access token with post permission',
  },
  linkedin: {
    primarySecretLabel: 'OAuth access token',
    primarySecretPlaceholder: 'LinkedIn access token',
    configLabel: 'Author URN', configKey: 'author_urn', configPlaceholder: 'urn:li:person:… or urn:li:organization:…',
  },
  facebook: {
    primarySecretLabel: 'Page access token', primarySecretPlaceholder: 'Facebook Page access token',
    configLabel: 'Page ID', configKey: 'page_id', configPlaceholder: 'Facebook Page ID',
  },
  instagram: {
    primarySecretLabel: 'Meta access token', primarySecretPlaceholder: 'Token with Instagram publish permissions',
    configLabel: 'Instagram business account ID', configKey: 'account_id', configPlaceholder: 'Instagram Business/Creator account ID',
  },
  threads: {
    primarySecretLabel: 'Threads access token', primarySecretPlaceholder: 'Threads access token',
    configLabel: 'Threads user ID', configKey: 'user_id', configPlaceholder: 'Threads user ID',
  },
  pinterest: {
    primarySecretLabel: 'Pinterest access token', primarySecretPlaceholder: 'Pinterest access token',
    configLabel: 'Board ID', configKey: 'board_id', configPlaceholder: 'Destination board ID',
  },
  reddit: {
    primarySecretLabel: 'Reddit OAuth access token', primarySecretPlaceholder: 'Reddit access token',
    configLabel: 'Subreddit', configKey: 'subreddit', configPlaceholder: 'e.g. equestrian',
  },
  youtube: {
    primarySecretLabel: 'Google OAuth access token', primarySecretPlaceholder: 'YouTube OAuth access token',
    configLabel: 'Privacy status', configKey: 'privacy_status', configPlaceholder: 'private, unlisted, or public',
    warning: 'New video uploads default to private unless you explicitly configure another permitted privacy state.',
  },
  tiktok: {
    primarySecretLabel: 'TikTok access token', primarySecretPlaceholder: 'Token with Content Posting API permissions',
    configLabel: 'Privacy level', configKey: 'privacy_level', configPlaceholder: 'Leave blank to use a permitted creator option',
    warning: 'Public Direct Post still depends on TikTok app audit, video.publish authorization and the creator account permissions. Unaudited apps may be restricted to private posting.',
    consent: true,
  },
  bluesky: {
    primarySecretLabel: 'Bluesky app password', primarySecretPlaceholder: 'Use an app password, not your main password',
    secondarySecretLabel: 'Handle / identifier', secondarySecretPlaceholder: 'name.bsky.social',
    configLabel: 'PDS URL (optional)', configKey: 'pds_url', configPlaceholder: 'https://bsky.social',
  },
  mastodon: {
    primarySecretLabel: 'Mastodon access token', primarySecretPlaceholder: 'Instance access token with write:statuses',
    configLabel: 'Instance URL', configKey: 'base_url', configPlaceholder: 'https://mastodon.social',
  },
  telegram: {
    primarySecretLabel: 'Telegram bot token', primarySecretPlaceholder: 'BotFather token',
    configLabel: 'Channel / chat ID', configKey: 'chat_id', configPlaceholder: '@channelname or numeric chat ID',
    secondaryConfigLabel: 'Channel username (optional)', secondaryConfigKey: 'channel_username', secondaryConfigPlaceholder: '@channelname',
    warning: 'The bot must be an administrator of the target channel. Telegram Bot API does not expose reliable post-level organic analytics, so Marketing will report that metric as unavailable rather than invent data.',
  },
};

function label(value: string): string {
  return value.split(/[-_]/).map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(' ');
}

function metricSummary(engagement?: Record<string, unknown>): string {
  if (!engagement || Object.keys(engagement).length === 0) return '';
  return Object.entries(engagement)
    .filter(([, value]) => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))))
    .slice(0, 4)
    .map(([key, value]) => `${label(key)} ${Number(value).toLocaleString()}`)
    .join(' · ');
}

function payloadHint(platform?: string): string {
  switch (platform) {
    case 'instagram': return 'Requires exactly one approved image.';
    case 'pinterest': return 'Requires exactly one approved image.';
    case 'youtube': return 'Requires exactly one approved video.';
    case 'tiktok': return 'Requires one approved video, or an approved photo set. Provider approval/creator permissions still apply.';
    case 'bluesky': return 'Text or up to four approved images; final delivery is capped to the network post limit.';
    case 'mastodon': return 'Text or up to four approved media items.';
    case 'telegram': return 'Text, one photo/video, or an approved media group up to ten items.';
    case 'linkedin': return 'Text, one image/video, or a multi-image post. Large uploads remain bounded by the secure media-fetch policy.';
    case 'x':
    case 'threads': return 'Text-only in this release.';
    default: return 'Only the exact owner-approved payload can be scheduled or published.';
  }
}

export default function SocialNetworkHub() {
  const [capabilities, setCapabilities] = useState<Record<string, PlatformCapability>>({});
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [approvedContent, setApprovedContent] = useState<ApprovedSocialContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConnect, setShowConnect] = useState(false);

  const [platform, setPlatform] = useState('instagram');
  const [accountName, setAccountName] = useState('');
  const [primarySecret, setPrimarySecret] = useState('');
  const [secondarySecret, setSecondarySecret] = useState('');
  const [configValue, setConfigValue] = useState('');
  const [secondaryConfigValue, setSecondaryConfigValue] = useState('');
  const [tiktokConsent, setTiktokConsent] = useState(false);

  const [connectionId, setConnectionId] = useState('');
  const [contentId, setContentId] = useState('');
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
      const [capabilityResponse, connectionResponse, postResponse, contentResponse] = await Promise.all([
        api.get<ApiResponse<Record<string, PlatformCapability>>>('/amai/social/capabilities'),
        api.get<ApiResponse<SocialConnection[]>>('/amai/social/connections'),
        api.get<ApiResponse<SocialPost[]>>('/amai/social/posts'),
        api.get<ApiResponse<ApprovedSocialContent[]>>('/content-studio', { params: { status: 'approved', type: 'social' } }),
      ]);
      setCapabilities(capabilityResponse.data || {});
      setConnections(connectionResponse.data || []);
      setPosts(postResponse.data || []);
      setApprovedContent(contentResponse.data || []);
      setConnectionId((current) => current || connectionResponse.data?.find((item) => item.status === 'active')?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to load social publishing data.');
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load]);

  const selectedConnection = useMemo(
    () => connections.find((connection) => connection.id === connectionId),
    [connections, connectionId]
  );
  const eligibleContent = useMemo(
    () => approvedContent.filter((item) => !selectedConnection || !item.platform || item.platform === selectedConnection.platform),
    [approvedContent, selectedConnection]
  );
  const setup = SETUP[platform] || SETUP.x;

  const resetConnect = () => {
    setAccountName(''); setPrimarySecret(''); setSecondarySecret('');
    setConfigValue(''); setSecondaryConfigValue(''); setTiktokConsent(false);
  };

  const selectApprovedContent = (id: string) => {
    setContentId(id);
    const item = approvedContent.find((content) => content.id === id);
    if (!item) { setBody(''); setMediaUrls(''); setHashtags(''); return; }
    const delivery = item.metadata?.delivery && typeof item.metadata.delivery === 'object'
      ? item.metadata.delivery as Record<string, unknown> : {};
    const social = delivery.social && typeof delivery.social === 'object'
      ? delivery.social as Record<string, unknown> : {};
    setBody(String(social.body ?? item.body ?? ''));
    const media = Array.isArray(social.media_urls) ? social.media_urls : Array.isArray(item.metadata.media_urls) ? item.metadata.media_urls : [];
    const tags = Array.isArray(social.hashtags) ? social.hashtags : Array.isArray(item.metadata.hashtags) ? item.metadata.hashtags : [];
    setMediaUrls(media.map(String).join('\n'));
    setHashtags(tags.map(String).join(' '));
  };

  const connectAccount = async () => {
    if (!organizationId || !accountName.trim() || !primarySecret.trim()) return;
    if (platform === 'bluesky' && !secondarySecret.trim()) return;
    if (platform === 'tiktok' && !tiktokConsent) return;

    const config: Record<string, unknown> = {};
    if (setup.configKey && configValue.trim()) config[setup.configKey] = configValue.trim();
    if (setup.secondaryConfigKey && secondaryConfigValue.trim()) config[setup.secondaryConfigKey] = secondaryConfigValue.trim();
    if (platform === 'reddit') config.user_agent = 'EquiProfileMarketing/1.0';
    if (platform === 'tiktok') {
      config.creator_consent_confirmed = true;
      config.brand_organic_toggle = true;
      config.is_aigc = true;
    }

    const credentials: Record<string, string> = platform === 'telegram'
      ? { bot_token: primarySecret.trim() }
      : platform === 'bluesky'
        ? { identifier: secondarySecret.trim(), app_password: primarySecret.trim() }
        : { access_token: primarySecret.trim() };

    setSaving(true);
    setError(null);
    try {
      const response = await api.post<ApiResponse<SocialConnection>>('/amai/social/connections', {
        body: { platform, account_name: accountName.trim(), credentials, config },
      });
      await api.post(`/amai/social/connections/${response.data.id}/test`, { body: {} });
      resetConnect();
      setShowConnect(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to connect the social account.');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async (id: string) => {
    setBusyId(id); setError(null);
    try { await api.post(`/amai/social/connections/${id}/test`, { body: {} }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Connection test failed.'); }
    finally { setBusyId(null); }
  };

  const deleteConnection = async (id: string) => {
    if (!confirm('Delete this social connection?')) return;
    setBusyId(id); setError(null);
    try { await api.delete(`/amai/social/connections/${id}`); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Connection deletion failed.'); }
    finally { setBusyId(null); }
  };

  const createPost = async (publishNow: boolean) => {
    if (!connectionId || !contentId || !body.trim()) return;
    setSaving(true); setError(null);
    try {
      await api.post('/amai/social/posts', {
        body: {
          connection_id: connectionId,
          content_id: contentId,
          body: body.trim(),
          media_urls: mediaUrls.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
          hashtags: hashtags.split(/[\s,]/).map((value) => value.trim()).filter(Boolean).map((value) => value.startsWith('#') ? value : `#${value}`),
          scheduled_at: publishNow ? undefined : scheduledAt || undefined,
          publish_now: publishNow,
        },
      });
      setBody(''); setContentId(''); setMediaUrls(''); setHashtags(''); setScheduledAt('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Post creation failed.');
    } finally { setSaving(false); }
  };

  const publishPost = async (id: string) => {
    setBusyId(id); setError(null);
    try { await api.post(`/amai/social/posts/${id}/publish`, { body: {} }); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Publishing failed.'); }
    finally { setBusyId(null); }
  };

  const capabilityPlatforms = PLATFORM_ORDER.filter((item) => capabilities[item]);
  const canConnect = Boolean(accountName.trim() && primarySecret.trim()
    && (platform !== 'bluesky' || secondarySecret.trim())
    && (platform !== 'tiktok' || tiktokConsent));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Organic Social Network</h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-400">Connect organic distribution channels, publish only exact owner-approved content, and feed provider performance back into the autonomous Growth Director.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2.5 text-sm text-zinc-200 hover:bg-white/5"><RefreshCw className="h-4 w-4" /> Refresh</button>
          <button type="button" onClick={() => setShowConnect(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-400"><Link2 className="h-4 w-4" /> Connect account</button>
        </div>
      </header>

      {error && <div className="flex items-start gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" /><p className="text-sm text-red-300">{error}</p><button type="button" onClick={() => setError(null)} className="ml-auto text-red-400"><X className="h-4 w-4" /></button></div>}

      <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-400" /><h2 className="font-semibold text-white">Approval invariant</h2></div>
        <p className="mt-2 text-sm text-zinc-400">Every outbound post remains bound to the exact owner-approved Content Library version and is revalidated immediately before delivery. Autonomous mode may schedule and distribute approved content; it cannot approve content.</p>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Channel capabilities</h2><span className="text-xs text-zinc-500">{capabilityPlatforms.length || 12} code-side connectors</span></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(capabilityPlatforms.length ? capabilityPlatforms : PLATFORM_ORDER).map((item) => {
            const capability = capabilities[item];
            const connected = connections.some((connection) => connection.platform === item && connection.status === 'active');
            return <article key={item} className="rounded-xl border border-white/[0.06] bg-surface-100 p-4">
              <div className="flex items-center justify-between gap-2"><h3 className="font-semibold capitalize text-white">{item}</h3><span className={`rounded-full px-2 py-1 text-[11px] ${connected ? 'bg-emerald-500/10 text-emerald-300' : capability?.enabled ? 'bg-blue-500/10 text-blue-300' : 'bg-zinc-500/10 text-zinc-400'}`}>{connected ? 'Connected' : capability?.enabled ? 'Ready to connect' : 'Unavailable'}</span></div>
              <p className="mt-2 text-xs text-zinc-400">{capability?.formats?.map(label).join(' · ') || 'Loading capability…'}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">{capability?.notes || ''}</p>
            </article>;
          })}
        </div>
      </section>

      {showConnect && (
        <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="text-lg font-semibold text-white">Connect social account</h2>
          <p className="mt-1 text-xs text-zinc-500">Credentials are encrypted before storage. Connection tests use the provider API and do not mark an account healthy unless the provider accepts the credential.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm text-zinc-300"><span>Platform</span><select value={platform} onChange={(event) => { setPlatform(event.target.value); resetConnect(); }} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white">{PLATFORM_ORDER.map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>
            <label className="space-y-1.5 text-sm text-zinc-300"><span>Account name</span><input value={accountName} onChange={(event) => setAccountName(event.target.value)} placeholder="My brand account" className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>
            <label className="space-y-1.5 text-sm text-zinc-300"><span>{setup.primarySecretLabel}</span><input type="password" autoComplete="new-password" value={primarySecret} onChange={(event) => setPrimarySecret(event.target.value)} placeholder={setup.primarySecretPlaceholder} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>
            {setup.secondarySecretLabel && <label className="space-y-1.5 text-sm text-zinc-300"><span>{setup.secondarySecretLabel}</span><input value={secondarySecret} onChange={(event) => setSecondarySecret(event.target.value)} placeholder={setup.secondarySecretPlaceholder} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>}
            {setup.configLabel && <label className="space-y-1.5 text-sm text-zinc-300"><span>{setup.configLabel}</span><input value={configValue} onChange={(event) => setConfigValue(event.target.value)} placeholder={setup.configPlaceholder} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>}
            {setup.secondaryConfigLabel && <label className="space-y-1.5 text-sm text-zinc-300"><span>{setup.secondaryConfigLabel}</span><input value={secondaryConfigValue} onChange={(event) => setSecondaryConfigValue(event.target.value)} placeholder={setup.secondaryConfigPlaceholder} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>}
          </div>
          {setup.warning && <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200">{setup.warning}</div>}
          {setup.consent && <label className="mt-4 flex items-start gap-3 rounded-lg border border-white/10 p-3 text-sm text-zinc-300"><input type="checkbox" checked={tiktokConsent} onChange={(event) => setTiktokConsent(event.target.checked)} className="mt-1" /><span>I confirm the TikTok creator has explicitly chosen to connect this account for Direct Post. Marketing will still query the creator’s current privacy options and will fail closed if the app/account permissions do not allow the requested publication.</span></label>}
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={saving || !canConnect} onClick={() => void connectAccount()} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Connecting…' : 'Connect and test'}</button><button type="button" onClick={() => { resetConnect(); setShowConnect(false); }} className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-white/5">Cancel</button></div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {connections.map((connection) => (
          <article key={connection.id} className="rounded-xl border border-white/[0.06] bg-surface-100 p-5">
            <div className="flex items-center gap-3"><Share2 className="h-5 w-5 text-brand-400" /><div className="min-w-0"><h2 className="text-sm font-semibold capitalize text-white">{connection.platform}</h2><p className="truncate text-xs text-zinc-500">{connection.account_name || connection.account_id}</p></div></div>
            <p className="mt-2 text-[11px] text-zinc-600">{connection.last_sync_at ? `Last provider check ${new Date(connection.last_sync_at).toLocaleString()}` : 'Not provider-tested yet'}</p>
            <div className="mt-4 flex items-center justify-between"><span className={`inline-flex items-center gap-1 text-xs capitalize ${connection.status === 'active' ? 'text-emerald-400' : 'text-red-400'}`}>{connection.status === 'active' && <CheckCircle2 className="h-3.5 w-3.5" />}{connection.status}</span><div className="flex gap-1"><button type="button" aria-label="Test connection" onClick={() => void testConnection(connection.id)} className="rounded p-1.5 text-zinc-400 hover:bg-white/5">{busyId === connection.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</button><button type="button" aria-label="Delete connection" onClick={() => void deleteConnection(connection.id)} className="rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></div></div>
          </article>
        ))}
        {!loading && connections.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">No social accounts are connected yet. The system remains fail-closed until you add and provider-test an account.</div>}
      </section>

      <section className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <h2 className="text-lg font-semibold text-white">Prepare approved content for publishing</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-sm text-zinc-300"><span>Connection</span><select value={connectionId} onChange={(event) => { setConnectionId(event.target.value); setContentId(''); setBody(''); setMediaUrls(''); setHashtags(''); }} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white"><option value="">Select an active account</option>{connections.filter((connection) => connection.status === 'active').map((connection) => <option key={connection.id} value={connection.id}>{label(connection.platform)} — {connection.account_name}</option>)}</select></label>
          <label className="space-y-1.5 text-sm text-zinc-300"><span>Schedule time</span><input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white" /></label>
          <label className="space-y-1.5 text-sm text-zinc-300 md:col-span-2"><span>Owner-approved Content Library version</span><select value={contentId} onChange={(event) => selectApprovedContent(event.target.value)} className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-white"><option value="">Select approved social content</option>{eligibleContent.map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version}{item.platform ? ` · ${label(item.platform)}` : ''}</option>)}</select></label>
          <label className="space-y-1.5 text-sm text-zinc-300 md:col-span-2"><span>Approved post body</span><textarea rows={5} value={body} readOnly placeholder="Select an approved content version." className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-zinc-300" /></label>
          <label className="space-y-1.5 text-sm text-zinc-300"><span>Approved media URLs</span><textarea rows={3} value={mediaUrls} readOnly className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-zinc-300" /></label>
          <label className="space-y-1.5 text-sm text-zinc-300"><span>Approved hashtags</span><textarea rows={3} value={hashtags} readOnly className="w-full rounded-lg border border-white/10 bg-black/30 p-3 text-zinc-300" /></label>
        </div>
        <p className="mt-3 text-xs text-zinc-500">{payloadHint(selectedConnection?.platform)}</p>
        <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={saving || !connectionId || !contentId || !body.trim()} onClick={() => void createPost(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" /> Publish approved version</button><button type="button" disabled={saving || !connectionId || !contentId || !body.trim() || !scheduledAt} onClick={() => void createPost(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white disabled:opacity-50">Schedule approved version</button></div>
      </section>

      <section className="overflow-hidden rounded-xl border border-white/[0.06] bg-surface-100">
        <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4"><h2 className="text-sm font-semibold text-white">Publishing & performance history</h2><span className="text-xs text-zinc-500">{posts.length} total</span></div>
        {loading ? <div className="flex justify-center py-14"><Loader2 className="h-6 w-6 animate-spin text-brand-400" /></div> : posts.length === 0 ? <div className="py-14 text-center"><Send className="mx-auto h-7 w-7 text-zinc-600" /><p className="mt-3 text-sm text-zinc-500">No posts created yet.</p></div> : <div className="divide-y divide-white/[0.06]">{posts.slice(0, 75).map((post) => {
          const metrics = metricSummary(post.engagement);
          return <article key={post.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"><div className="min-w-0 flex-1"><p className="truncate text-sm text-white">{post.body}</p><p className="mt-1 text-xs capitalize text-zinc-500">{label(post.platform)}{post.scheduled_at ? ` · ${new Date(post.scheduled_at).toLocaleString()}` : ''}</p>{metrics && <p className="mt-1 text-xs text-emerald-300">{metrics}</p>}{post.error && <p className="mt-1 text-xs text-red-400">{post.error}</p>}</div><div className="flex items-center gap-2"><span className="rounded-full bg-white/5 px-3 py-1 text-xs capitalize text-zinc-300">{post.status}</span>{['draft', 'failed'].includes(post.status) && <button type="button" onClick={() => void publishPost(post.id)} className="rounded bg-brand-500 px-3 py-1 text-xs text-white">Retry/publish</button>}{post.external_url && <a href={post.external_url} target="_blank" rel="noreferrer" className="text-brand-400" aria-label="Open published post"><ExternalLink className="h-4 w-4" /></a>}</div></article>;
        })}</div>}
      </section>
    </div>
  );
}
