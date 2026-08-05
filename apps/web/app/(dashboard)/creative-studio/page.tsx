'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Film, History, Image, Mic, Video, X } from 'lucide-react';
import {
  CinemaStudio,
  ImageStudio,
  LipSyncStudio,
  LongFormStudio,
  StudioClient,
  VideoStudio,
} from '@amarktai/studio';
import { useAuthStore } from '@/stores/auth.store';

const tabs = [
  { id: 'image', label: 'Image Studio', icon: Image },
  { id: 'video', label: 'Video Studio', icon: Video },
  { id: 'lipsync', label: 'Lip Sync Studio', icon: Mic },
  { id: 'cinema', label: 'Cinema Studio', icon: Film },
  { id: 'longform', label: 'Long-Form', icon: Film },
] as const;

type TabId = typeof tabs[number]['id'];

type HistoryItem = {
  id: string;
  url: string | null;
  prompt?: string | null;
  model?: string | null;
  type?: string;
  status?: string;
  timestamp: string;
};

export default function CreativeStudioPage() {
  const [activeTab, setActiveTab] = useState<TabId>('image');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuthStore();
  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const studioClient = useMemo(
    () => new StudioClient({ organizationId: orgId, getToken: () => token }),
    [orgId, token]
  );

  const upsertHistory = useCallback((generation: any) => {
    if (!generation?.id) return;
    const item: HistoryItem = {
      id: generation.id,
      url: generation.url || generation.primary_output_url || generation.output_urls?.[0] || null,
      prompt: generation.prompt,
      model: generation.model,
      type: generation.type,
      status: generation.status,
      timestamp: generation.created_at || generation.timestamp || new Date().toISOString(),
    };
    setHistory((current) => [item, ...current.filter((existing) => existing.id !== item.id)]);
  }, []);

  useEffect(() => {
    if (!orgId || !token) return;
    let cancelled = false;
    studioClient
      .listHistory(100)
      .then((items: any[]) => {
        if (!cancelled) items.reverse().forEach(upsertHistory);
      })
      .then(() => studioClient.resumePendingGenerations(upsertHistory))
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => { cancelled = true; };
  }, [orgId, token, studioClient, upsertHistory]);

  const handleGenerationComplete = useCallback((result: any) => upsertHistory(result), [upsertHistory]);

  const handleDownload = useCallback(async (url: string, filename: string) => {
    const response = await fetch(url, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const blobUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  }, [token]);

  const renderPreview = (item: HistoryItem) => {
    if (!item.url) return <div className="h-32 p-3 text-xs text-zinc-500">{item.status}</div>;
    if (item.type?.includes('video') || item.type === 'lip_sync' || item.type === 'cinema') {
      return <video src={item.url} className="h-32 w-full object-cover" muted preload="metadata" />;
    }
    if (item.type?.includes('audio') || item.type === 'text_to_speech') {
      return <div className="flex h-32 items-center p-3"><audio src={item.url} controls className="w-full" /></div>;
    }
    return <img src={item.url} alt={item.prompt || 'Generated content'} className="h-32 w-full object-cover" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">AmarktAI Creative Studio</h1>
        <p className="mt-1 text-sm text-zinc-400">Generate images, video, audio and long-form projects through GenX.</p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-400" />
          <p className="text-sm text-red-300">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-white/[0.03] p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${activeTab === tab.id ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:text-white'}`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[600px]">
        {activeTab === 'image' && <ImageStudio studioClient={studioClient} onGenerationComplete={handleGenerationComplete} historyItems={history.filter((item) => item.type?.includes('image'))} />}
        {activeTab === 'video' && <VideoStudio studioClient={studioClient} onGenerationComplete={handleGenerationComplete} historyItems={history.filter((item) => item.type?.includes('video'))} />}
        {activeTab === 'lipsync' && <LipSyncStudio studioClient={studioClient} onGenerationComplete={handleGenerationComplete} historyItems={history.filter((item) => item.type === 'lip_sync')} />}
        {activeTab === 'cinema' && <CinemaStudio studioClient={studioClient} onGenerationComplete={handleGenerationComplete} historyItems={history.filter((item) => item.type === 'cinema')} />}
        {activeTab === 'longform' && <LongFormStudio studioClient={studioClient} />}
      </div>

      {history.length > 0 && activeTab !== 'longform' && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white"><History className="h-5 w-5 text-brand-400" />Server History</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {history.slice(0, 12).map((item) => (
              <div key={item.id} className="group overflow-hidden rounded-lg border border-white/[0.06] bg-white/[0.02]">
                {renderPreview(item)}
                <div className="p-3">
                  <p className="truncate text-xs text-zinc-400">{item.prompt || item.type || 'Generation'}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">{item.status} · {new Date(item.timestamp).toLocaleTimeString()}</span>
                    {item.url && (
                      <button onClick={() => handleDownload(item.url!, `amarktai-${item.id}`)} className="rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
