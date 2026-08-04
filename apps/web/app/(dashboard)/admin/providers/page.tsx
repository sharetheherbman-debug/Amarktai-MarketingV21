'use client';

import { useState } from 'react';
import {
  Cpu,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Plus,
  ArrowDownUp,
  RefreshCw,
  DollarSign,
  Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';

interface ProviderConfig {
  name: string;
  description: string;
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  priority: number;
  enabled: boolean;
  status: 'idle' | 'testing' | 'connected' | 'disconnected';
}

const defaultProviders: ProviderConfig[] = [
  {
    name: 'GenX Router',
    description: 'Primary AI provider with broad model support and low latency.',
    apiKey: '',
    baseUrl: 'https://api.genxrouter.ai/v1',
    defaultModel: 'genx-flash',
    priority: 1,
    enabled: true,
    status: 'idle',
  },
  {
    name: 'Together AI',
    description: 'High-performance inference for open-source models.',
    apiKey: '',
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    priority: 2,
    enabled: true,
    status: 'idle',
  },
  {
    name: 'DeepInfra',
    description: 'Cost-effective inference with a wide model catalog.',
    apiKey: '',
    baseUrl: 'https://api.deepinfra.com/v1/openai',
    defaultModel: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
    priority: 3,
    enabled: false,
    status: 'idle',
  },
];

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>(defaultProviders);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [failoverEnabled, setFailoverEnabled] = useState(true);

  function updateProvider(index: number, updates: Partial<ProviderConfig>) {
    setProviders((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...updates } : p))
    );
  }

  async function testConnection(index: number) {
    updateProvider(index, { status: 'testing' });
    await new Promise((r) => setTimeout(r, 1500));
    const hasKey = providers[index].apiKey.length > 0;
    updateProvider(index, { status: hasKey ? 'connected' : 'disconnected' });
    toast[hasKey ? 'success' : 'error'](
      hasKey ? `${providers[index].name} connected` : `${providers[index].name} connection failed`
    );
  }

  function saveProvider(index: number) {
    toast.success(`${providers[index].name} settings saved`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">AI Provider Configuration</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manage your AI providers and API keys. Configure priorities, test connections, and monitor usage.
        </p>
      </div>

      <div className="space-y-4">
        {providers.map((provider, i) => (
          <div
            key={provider.name}
            className="rounded-xl border border-white/[0.06] bg-surface-100 p-6"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
                  <Cpu className="h-5 w-5 text-brand-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-white">{provider.name}</h3>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        provider.status === 'connected' && 'bg-brand-500/10 text-brand-400',
                        provider.status === 'disconnected' && 'bg-red-500/10 text-red-400',
                        provider.status === 'testing' && 'bg-amber-500/10 text-amber-400',
                        provider.status === 'idle' && 'bg-zinc-500/10 text-zinc-400'
                      )}
                    >
                      {provider.status === 'idle' ? 'Not tested' : provider.status}
                    </span>
                    {provider.priority === 1 && (
                      <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">{provider.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">Priority: {provider.priority}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={provider.enabled}
                  onClick={() => updateProvider(i, { enabled: !provider.enabled })}
                  className={cn(
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                    provider.enabled ? 'bg-brand-500' : 'bg-zinc-600'
                  )}
                >
                  <span
                    className={cn(
                      'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                      provider.enabled ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">API Key</label>
                <div className="relative">
                  <input
                    type={showKeys[provider.name] ? 'text' : 'password'}
                    value={provider.apiKey}
                    onChange={(e) => updateProvider(i, { apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 pr-10 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowKeys((prev) => ({ ...prev, [provider.name]: !prev[provider.name] }))
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                  >
                    {showKeys[provider.name] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Base URL</label>
                <input
                  type="text"
                  value={provider.baseUrl}
                  onChange={(e) => updateProvider(i, { baseUrl: e.target.value })}
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Default model</label>
                <select
                  value={provider.defaultModel}
                  onChange={(e) => updateProvider(i, { defaultModel: e.target.value })}
                  className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none transition-colors focus:border-brand-500/50"
                >
                  <option value={provider.defaultModel}>{provider.defaultModel}</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => testConnection(i)}
                disabled={provider.status === 'testing'}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
              >
                {provider.status === 'testing' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : provider.status === 'connected' ? (
                  <CheckCircle2 className="h-4 w-4 text-brand-400" />
                ) : provider.status === 'disconnected' ? (
                  <XCircle className="h-4 w-4 text-red-400" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Test Connection
              </button>
              <button
                type="button"
                onClick={() => saveProvider(i)}
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
              >
                Save
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-lg border border-dashed border-white/[0.12] px-4 py-2.5 text-sm font-medium text-zinc-400 transition-colors hover:border-white/[0.2] hover:text-white"
      >
        <Plus className="h-4 w-4" />
        Add Custom Provider
      </button>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <Activity className="h-4 w-4 text-brand-400" />
            Usage Summary
          </h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Total API calls this month</span>
              <span className="font-medium text-white">0</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Cost this month</span>
              <span className="font-medium text-white">$0.00</span>
            </div>
            <div className="border-t border-white/[0.06] pt-3">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 mb-2">Cost by provider</p>
              {providers.filter(p => p.enabled).map((p) => (
                <div key={p.name} className="flex items-center justify-between py-1 text-sm">
                  <span className="text-zinc-400">{p.name}</span>
                  <span className="text-zinc-500">$0.00</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-white">
            <ArrowDownUp className="h-4 w-4 text-brand-400" />
            Failover Configuration
          </h3>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Enable automatic failover</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Automatically route to the next provider if one fails.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={failoverEnabled}
                onClick={() => setFailoverEnabled(!failoverEnabled)}
                className={cn(
                  'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                  failoverEnabled ? 'bg-brand-500' : 'bg-zinc-600'
                )}
              >
                <span
                  className={cn(
                    'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                    failoverEnabled ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">Failover order</p>
              <div className="space-y-2">
                {providers
                  .filter((p) => p.enabled)
                  .sort((a, b) => a.priority - b.priority)
                  .map((p) => (
                    <div
                      key={p.name}
                      className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                    >
                      <ArrowDownUp className="h-4 w-4 text-zinc-500" />
                      <span className="text-sm text-white">{p.name}</span>
                      <span className="ml-auto text-xs text-zinc-500">Priority {p.priority}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
