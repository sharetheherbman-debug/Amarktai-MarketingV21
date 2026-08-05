'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Image,
  Video,
  Mic,
  Film,
  Sparkles,
  Loader2,
  AlertCircle,
  X,
  Download,
  History,
  Settings,
  Send,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface StudioModel {
  id: string;
  name: string;
  type: string;
  provider: string;
  status: 'available' | 'pending' | 'unsupported';
  description: string;
}

interface Generation {
  id: string;
  type: string;
  model: string | null;
  prompt: string | null;
  status: string;
  progress: number;
  output_urls: string[];
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const tabs = [
  { id: 'image', label: 'Image Studio', icon: Image },
  { id: 'video', label: 'Video Studio', icon: Video },
  { id: 'lipsync', label: 'Lip Sync Studio', icon: Mic },
  { id: 'cinema', label: 'Cinema Studio', icon: Film },
] as const;

type TabId = typeof tabs[number]['id'];

const statusConfig: Record<string, { color: string; bg: string; icon: typeof CheckCircle2 }> = {
  completed: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 },
  processing: { color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Loader2 },
  pending: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Clock },
  failed: { color: 'text-red-400', bg: 'bg-red-500/10', icon: XCircle },
  cancelled: { color: 'text-zinc-400', bg: 'bg-zinc-500/10', icon: XCircle },
};

export default function CreativeStudioPage() {
  const [activeTab, setActiveTab] = useState<TabId>('image');
  const [models, setModels] = useState<StudioModel[]>([]);
  const [history, setHistory] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [quality, setQuality] = useState('standard');

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [modelsRes, historyRes] = await Promise.all([
        api.get<ApiResponse<StudioModel[]>>('/studio/models'),
        api.get<ApiResponse<Generation[]>>('/studio/history', { params: { organization_id: orgId } }),
      ]);
      setModels(modelsRes.data);
      setHistory(historyRes.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGenerate = async () => {
    if (!prompt || !orgId) return;
    try {
      setGenerating(true);
      setError(null);

      const typeMap: Record<TabId, string> = {
        image: 'text_to_image',
        video: 'text_to_video',
        lipsync: 'lip_sync',
        cinema: 'cinema',
      };

      const res = await api.post<ApiResponse<Generation>>('/studio/generations', {
        body: {
          organization_id: orgId,
          type: typeMap[activeTab],
          model: selectedModel || undefined,
          prompt,
          negative_prompt: negativePrompt || undefined,
          options: { aspect_ratio: aspectRatio, quality },
        },
      });

      const gen = res.data;

      if (gen.status === 'failed' && gen.error_code === 'GENX_MODALITY_NOT_AVAILABLE') {
        setError(`This generation type is not yet available through GenX. ${gen.error_message || ''}`);
      } else if (gen.status === 'completed') {
        setHistory(prev => [gen, ...prev]);
      } else {
        // Poll for status
        setHistory(prev => [gen, ...prev]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const availableModels = models.filter(m =>
    m.status === 'available' &&
    (activeTab === 'image' ? m.type === 'text_to_image' || m.type === 'image_to_image' :
     activeTab === 'video' ? m.type === 'text_to_video' || m.type === 'image_to_video' :
     activeTab === 'lipsync' ? m.type === 'lip_sync' :
     m.type === 'cinema')
  );

  const pendingModels = models.filter(m =>
    m.status === 'pending' &&
    (activeTab === 'image' ? m.type === 'text_to_image' || m.type === 'image_to_image' :
     activeTab === 'video' ? m.type === 'text_to_video' || m.type === 'image_to_video' :
     activeTab === 'lipsync' ? m.type === 'lip_sync' :
     m.type === 'cinema')
  );

  const filteredHistory = history.filter(h =>
    activeTab === 'image' ? ['text_to_image', 'image_to_image'].includes(h.type) :
    activeTab === 'video' ? ['text_to_video', 'image_to_video'].includes(h.type) :
    activeTab === 'lipsync' ? h.type === 'lip_sync' :
    h.type === 'cinema'
  );

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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Generation Form */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              {tabs.find(t => t.id === activeTab)?.label}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={`Describe the ${activeTab} you want to generate...`}
                  rows={4}
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
                />
              </div>

              {activeTab === 'image' && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Negative Prompt</label>
                  <input
                    type="text"
                    value={negativePrompt}
                    onChange={e => setNegativePrompt(e.target.value)}
                    placeholder="What to exclude from the image..."
                    className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Aspect Ratio</label>
                  <select
                    value={aspectRatio}
                    onChange={e => setAspectRatio(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-white outline-none focus:border-brand-500/50"
                  >
                    <option value="1:1">1:1 Square</option>
                    <option value="16:9">16:9 Widescreen</option>
                    <option value="9:16">9:16 Portrait</option>
                    <option value="4:3">4:3 Standard</option>
                    <option value="3:4">3:4 Portrait</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Quality</label>
                  <select
                    value={quality}
                    onChange={e => setQuality(e.target.value)}
                    className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-white outline-none focus:border-brand-500/50"
                  >
                    <option value="standard">Standard</option>
                    <option value="high">High</option>
                    <option value="ultra">Ultra</option>
                  </select>
                </div>
              </div>

              {/* Available Models */}
              {availableModels.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">Available Models</label>
                  <div className="grid grid-cols-2 gap-2">
                    {availableModels.map(model => (
                      <button
                        key={model.id}
                        onClick={() => setSelectedModel(model.id)}
                        className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                          selectedModel === model.id
                            ? 'border-brand-500/50 bg-brand-500/10 text-white'
                            : 'border-white/[0.06] bg-white/[0.02] text-zinc-300 hover:bg-white/[0.04]'
                        }`}
                      >
                        {model.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Models */}
              {pendingModels.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-zinc-500 mb-1.5">GenX Mapping Pending</label>
                  <div className="grid grid-cols-2 gap-2">
                    {pendingModels.map(model => (
                      <div
                        key={model.id}
                        className="rounded-lg border border-white/[0.04] bg-white/[0.01] p-3 text-sm text-zinc-600"
                      >
                        {model.name}
                        <span className="ml-2 text-[10px] text-zinc-600">Phase 2</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating || !prompt}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-400 disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>
        </div>

        {/* History */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
              <History className="h-5 w-5 text-brand-400" />
              Recent Generations
            </h2>
            {filteredHistory.length === 0 ? (
              <p className="text-sm text-zinc-500">No generations yet</p>
            ) : (
              <div className="space-y-3">
                {filteredHistory.slice(0, 10).map(gen => {
                  const status = statusConfig[gen.status] || statusConfig.pending;
                  const StatusIcon = status.icon;
                  return (
                    <div key={gen.id} className="rounded-lg border border-white/[0.04] bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-zinc-400 truncate flex-1">{gen.prompt}</p>
                        <StatusIcon className={`h-4 w-4 ml-2 ${status.color} ${gen.status === 'processing' ? 'animate-spin' : ''}`} />
                      </div>
                      {gen.error_code && (
                        <p className="mt-1 text-[11px] text-red-400">{gen.error_code}</p>
                      )}
                      {gen.output_urls.length > 0 && (
                        <div className="mt-2">
                          {gen.output_urls.map((url, i) => (
                            <div key={i} className="text-xs text-brand-400 truncate">{typeof url === 'string' ? url : JSON.stringify(url)}</div>
                          ))}
                        </div>
                      )}
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {new Date(gen.created_at).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
