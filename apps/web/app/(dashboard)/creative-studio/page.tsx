'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Image,
  Video,
  Mic,
  Film,
  Loader2,
  AlertCircle,
  X,
  History,
  Download,
} from 'lucide-react';
import { ImageStudio, VideoStudio, LipSyncStudio, CinemaStudio, StudioClient } from '@amarktai/studio';
import { useAuthStore } from '@/stores/auth.store';

const tabs = [
  { id: 'image', label: 'Image Studio', icon: Image },
  { id: 'video', label: 'Video Studio', icon: Video },
  { id: 'lipsync', label: 'Lip Sync Studio', icon: Mic },
  { id: 'cinema', label: 'Cinema Studio', icon: Film },
] as const;

type TabId = typeof tabs[number]['id'];

export default function CreativeStudioPage() {
  const [activeTab, setActiveTab] = useState<TabId>('image');
  const [history, setHistory] = useState<Array<{ id: string; url: string; prompt?: string; model?: string; timestamp: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const { token, user } = useAuthStore();
  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  // Create studio client
  const studioClient = useMemo(() => {
    return new StudioClient({
      organizationId: orgId,
      getToken: () => token,
    });
  }, [orgId, token]);

  const handleGenerationComplete = useCallback((result: { url: string; model?: string; prompt?: string; type?: string }) => {
    const entry = {
      id: Date.now().toString(),
      url: result.url,
      prompt: result.prompt,
      model: result.model,
      timestamp: new Date().toISOString(),
    };
    setHistory(prev => [entry, ...prev]);
  }, []);

  const handleDownload = useCallback((url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">AmarktAI Creative Studio</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Generate images, videos, and media content with AI.
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

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-white/[0.03] p-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id ? 'bg-brand-500/10 text-brand-400' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Studio Content */}
      <div className="min-h-[600px]">
        {activeTab === 'image' && (
          <ImageStudio
            studioClient={studioClient}
            onGenerationComplete={handleGenerationComplete}
            historyItems={history}
          />
        )}
        {activeTab === 'video' && (
          <VideoStudio
            studioClient={studioClient}
            onGenerationComplete={handleGenerationComplete}
            historyItems={history}
          />
        )}
        {activeTab === 'lipsync' && (
          <LipSyncStudio
            studioClient={studioClient}
            onGenerationComplete={handleGenerationComplete}
            historyItems={history}
          />
        )}
        {activeTab === 'cinema' && (
          <CinemaStudio
            studioClient={studioClient}
            onGenerationComplete={handleGenerationComplete}
            historyItems={history}
          />
        )}
      </div>

      {/* Generation History */}
      {history.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
            <History className="h-5 w-5 text-brand-400" />
            Recent Generations
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {history.slice(0, 8).map(item => (
              <div key={item.id} className="group relative rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
                {item.url && (
                  <img
                    src={item.url}
                    alt={item.prompt || 'Generated content'}
                    className="w-full h-32 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <div className="p-3">
                  <p className="text-xs text-zinc-400 truncate">{item.prompt || 'No prompt'}</p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-500">{new Date(item.timestamp).toLocaleTimeString()}</span>
                    <button
                      onClick={() => handleDownload(item.url, `generation-${item.id}.png`)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 text-zinc-400 hover:text-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
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
