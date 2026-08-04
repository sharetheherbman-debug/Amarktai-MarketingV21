'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  Bot,
  Edit2,
  Play,
  Clock,
  Trash2,
  X,
  Loader2,
  ChevronDown,
  Hash,
  Zap,
  Shield,
  Crown,
  Briefcase,
  Settings,
  MessageSquare,
  Send,
  Code,
  DollarSign,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate, slugify } from '@/lib/utils';
import toast from 'react-hot-toast';

const agentTypeFilters = ['All', 'worker', 'manager', 'director', 'executive'] as const;
type AgentTypeFilter = (typeof agentTypeFilters)[number];

const agentTypeConfig: Record<string, { label: string; color: string; bg: string; icon: typeof Bot }> = {
  worker: { label: 'Worker', color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Zap },
  manager: { label: 'Manager', color: 'text-purple-400', bg: 'bg-purple-500/10', icon: Shield },
  director: { label: 'Director', color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Crown },
  executive: { label: 'Executive', color: 'text-brand-400', bg: 'bg-brand-500/10', icon: Briefcase },
};

interface AgentTool {
  id: string;
  name: string;
  description: string;
}

interface Agent {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string;
  status: string;
  model: string;
  systemPrompt: string;
  capabilities: string[];
  tools: string[];
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface Conversation {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt: string;
  messages?: { role: string; content: string; createdAt: string }[];
}

interface ExecutionResult {
  output: string;
  toolCalls: { tool: string; input: string; output: string }[];
  tokenUsage: { prompt: number; completion: number; total: number };
  cost: number;
}

interface Provider {
  id: string;
  name: string;
  models: { id: string; name: string }[];
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<AgentTypeFilter>('All');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [executingAgent, setExecutingAgent] = useState<Agent | null>(null);
  const [historyAgent, setHistoryAgent] = useState<Agent | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (typeFilter !== 'All') params.type = typeFilter;
      if (search) params.search = search;
      const data = await api.get<{ data: Agent[] }>('/agents', { params });
      setAgents(data.data);
    } catch {
      toast.error('Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, [typeFilter, search]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const filteredAgents = agents.filter((a) => {
    if (typeFilter !== 'All' && a.type !== typeFilter) return false;
    if (search && !a.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleDelete(id: string) {
    if (!confirm('Delete this agent?')) return;
    try {
      await api.delete(`/agents/${id}`);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      toast.success('Agent deleted');
    } catch {
      toast.error('Failed to delete agent');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AI Agents</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Create and manage AI agents to automate your marketing workflows.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Create Agent
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-surface-100 p-1">
          {agentTypeFilters.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors capitalize',
                typeFilter === type
                  ? 'bg-white/[0.08] text-white'
                  : 'text-zinc-400 hover:text-white'
              )}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] pl-10 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
              <Bot className="h-8 w-8 text-zinc-500" />
            </div>
            <h3 className="mt-6 text-lg font-semibold text-white">No agents yet</h3>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">
              Create your first AI agent to start automating your marketing.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              Create your first agent
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAgents.map((agent) => {
            const config = agentTypeConfig[agent.type] ?? agentTypeConfig.worker;
            const TypeIcon = config.icon;
            return (
              <div
                key={agent.id}
                className="group relative rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/30 hover:bg-surface-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', config.bg)}>
                      <TypeIcon className={cn('h-5 w-5', config.color)} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white">{agent.name}</h3>
                      <span className={cn('text-[10px] font-semibold uppercase tracking-wide', config.color)}>
                        {config.label}
                      </span>
                    </div>
                  </div>
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                    agent.status === 'active'
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-zinc-500/10 text-zinc-400'
                  )}>
                    {agent.status}
                  </span>
                </div>

                <p className="mt-3 line-clamp-2 text-sm text-zinc-400">{agent.description}</p>

                <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Settings className="h-3 w-3" />
                    {agent.model}
                  </span>
                  {agent.lastUsedAt && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(agent.lastUsedAt)}
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-end gap-1 border-t border-white/[0.06] pt-3">
                  <button
                    type="button"
                    onClick={() => setEditingAgent(agent)}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                    title="Edit"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setExecutingAgent(agent)}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-brand-400"
                    title="Execute"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryAgent(agent)}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-amber-400"
                    title="View History"
                  >
                    <MessageSquare className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(agent.id)}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreateModal && (
        <AgentModal
          onClose={() => setShowCreateModal(false)}
          onSave={(agent) => {
            setAgents((prev) => [agent, ...prev]);
            setShowCreateModal(false);
          }}
        />
      )}

      {editingAgent && (
        <AgentModal
          agent={editingAgent}
          onClose={() => setEditingAgent(null)}
          onSave={(updated) => {
            setAgents((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
            setEditingAgent(null);
          }}
        />
      )}

      {executingAgent && (
        <ExecuteAgentModal
          agent={executingAgent}
          onClose={() => setExecutingAgent(null)}
        />
      )}

      {historyAgent && (
        <AgentHistorySidebar
          agent={historyAgent}
          onClose={() => setHistoryAgent(null)}
        />
      )}
    </div>
  );
}

function AgentModal({
  agent,
  onClose,
  onSave,
}: {
  agent?: Agent;
  onClose: () => void;
  onSave: (agent: Agent) => void;
}) {
  const [name, setName] = useState(agent?.name ?? '');
  const [slug, setSlug] = useState(agent?.slug ?? '');
  const [type, setType] = useState(agent?.type ?? 'worker');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '');
  const [model, setModel] = useState(agent?.model ?? '');
  const [capabilities, setCapabilities] = useState<string[]>(agent?.capabilities ?? []);
  const [selectedTools, setSelectedTools] = useState<string[]>(agent?.tools ?? []);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [availableTools, setAvailableTools] = useState<AgentTool[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [providersData, toolsData] = await Promise.all([
          api.get<{ data: Provider[] }>('/providers'),
          api.get<{ data: AgentTool[] }>('/agents/tools'),
        ]);
        setProviders(providersData.data);
        setAvailableTools(toolsData.data);
      } catch {
        // Providers/tools not available yet
      }
    }
    loadData();
  }, []);

  function handleNameChange(value: string) {
    setName(value);
    if (!agent) setSlug(slugify(value));
  }

  function addCapability() {
    setCapabilities((prev) => [...prev, '']);
  }

  function removeCapability(index: number) {
    setCapabilities((prev) => prev.filter((_, i) => i !== index));
  }

  function updateCapability(index: number, value: string) {
    setCapabilities((prev) => prev.map((c, i) => (i === index ? value : c)));
  }

  function toggleTool(toolId: string) {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      setSaving(true);
      const body = { name, slug, type, description, systemPrompt, model, capabilities, tools: selectedTools };
      if (agent) {
        const data = await api.put<{ data: Agent }>(`/agents/${agent.id}`, { body });
        onSave(data.data);
      } else {
        const data = await api.post<{ data: Agent }>('/agents', { body });
        onSave(data.data);
      }
      toast.success(agent ? 'Agent updated' : 'Agent created');
    } catch {
      toast.error('Failed to save agent');
    } finally {
      setSaving(false);
    }
  }

  const allModels = providers.flatMap((p) => p.models.map((m) => ({ ...m, provider: p.name })));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.06] bg-surface-100 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {agent ? 'Edit Agent' : 'Create Agent'}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Name</label>
            <input type="text" value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Content Writer" className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Slug</label>
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="content-writer" className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Type</label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none transition-colors focus:border-brand-500/50">
              {Object.entries(agentTypeConfig).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What does this agent do?" className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">System Prompt</label>
            <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={4} placeholder="You are a helpful marketing assistant..." className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none transition-colors focus:border-brand-500/50">
              <option value="">Select a model</option>
              {allModels.map((m) => (
                <option key={m.id} value={m.id}>{m.provider} / {m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-zinc-300">Capabilities</label>
              <button type="button" onClick={addCapability} className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-400 transition-colors hover:bg-brand-500/10">
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>
            <div className="space-y-2">
              {capabilities.map((cap, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="text" value={cap} onChange={(e) => updateCapability(i, e.target.value)} placeholder="Capability" className="h-8 flex-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50" />
                  <button type="button" onClick={() => removeCapability(i)} className="rounded p-1 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {availableTools.length > 0 && (
            <div>
              <label className="mb-3 block text-sm font-medium text-zinc-300">Tools</label>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableTools.map((tool) => (
                  <label
                    key={tool.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-all',
                      selectedTools.includes(tool.id)
                        ? 'border-brand-500/50 bg-brand-500/10'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedTools.includes(tool.id)}
                      onChange={() => toggleTool(tool.id)}
                      className="rounded border-zinc-600"
                    />
                    <div>
                      <p className="text-sm font-medium text-white">{tool.name}</p>
                      <p className="text-xs text-zinc-500">{tool.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {agent ? 'Save Changes' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExecuteAgentModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [task, setTask] = useState('');
  const [inputJson, setInputJson] = useState('{}');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [executing, setExecuting] = useState(false);

  async function handleExecute() {
    if (!task.trim()) {
      toast.error('Task description is required');
      return;
    }
    try {
      setExecuting(true);
      let parsedInput = {};
      try {
        parsedInput = JSON.parse(inputJson);
      } catch {
        toast.error('Invalid JSON input');
        setExecuting(false);
        return;
      }
      const data = await api.post<{ data: ExecutionResult }>(`/agents/${agent.id}/execute`, {
        body: { task, input: parsedInput },
      });
      setResult(data.data);
    } catch {
      toast.error('Execution failed');
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.06] bg-surface-100 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Execute: {agent.name}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Task Description</label>
            <textarea value={task} onChange={(e) => setTask(e.target.value)} rows={3} placeholder="Describe what the agent should do..." className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50" />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Input JSON
              <span className="ml-2 text-xs text-zinc-500">Optional</span>
            </label>
            <textarea value={inputJson} onChange={(e) => setInputJson(e.target.value)} rows={4} className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 font-mono text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50" />
          </div>

          {result && (
            <div className="space-y-4">
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
                  <MessageSquare className="h-4 w-4" />
                  Agent Response
                </h3>
                <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-4">
                  <pre className="whitespace-pre-wrap text-sm text-zinc-300">{result.output}</pre>
                </div>
              </div>

              {result.toolCalls.length > 0 && (
                <div>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-300">
                    <Code className="h-4 w-4" />
                    Tool Calls
                  </h3>
                  <div className="space-y-2">
                    {result.toolCalls.map((call, i) => (
                      <div key={i} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                        <p className="text-xs font-semibold text-brand-400">{call.tool}</p>
                        <p className="mt-1 text-xs text-zinc-500">Input: {call.input}</p>
                        <p className="mt-1 text-xs text-zinc-400">Output: {call.output}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-zinc-500" />
                  <span className="text-xs text-zinc-400">
                    Tokens: {result.tokenUsage.total} (prompt: {result.tokenUsage.prompt}, completion: {result.tokenUsage.completion})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-zinc-500" />
                  <span className="text-xs text-zinc-400">Cost: ${result.cost.toFixed(4)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white">
            Close
          </button>
          <button type="button" onClick={handleExecute} disabled={executing} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] disabled:opacity-50">
            {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Execute
          </button>
        </div>
      </div>
    </div>
  );
}

function AgentHistorySidebar({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{ data: Conversation[] }>(`/agents/${agent.id}/conversations`);
        setConversations(data.data);
      } catch {
        setConversations([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [agent.id]);

  async function loadMessages(convo: Conversation) {
    if (convo.messages) {
      setSelectedConvo(convo);
      return;
    }
    try {
      const data = await api.get<{ data: { role: string; content: string; createdAt: string }[] }>(
        `/agents/${agent.id}/conversations/${convo.id}/messages`
      );
      const updated = { ...convo, messages: data.data };
      setConversations((prev) => prev.map((c) => (c.id === convo.id ? updated : c)));
      setSelectedConvo(updated);
    } catch {
      toast.error('Failed to load messages');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md h-full overflow-y-auto border-l border-white/[0.06] bg-surface-100 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Conversation History</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-400">{agent.name}</p>

        {selectedConvo ? (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setSelectedConvo(null)}
              className="mb-4 text-sm text-brand-400 hover:text-brand-300"
            >
              Back to list
            </button>
            <h3 className="text-sm font-semibold text-white">{selectedConvo.title}</h3>
            <div className="mt-4 space-y-3">
              {selectedConvo.messages?.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg p-3',
                    msg.role === 'user'
                      ? 'border border-white/[0.06] bg-white/[0.02]'
                      : 'border border-brand-500/20 bg-brand-500/5'
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 mb-1">
                    {msg.role}
                  </p>
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{msg.content}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
              </div>
            ) : conversations.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">No conversations yet.</p>
            ) : (
              conversations.map((convo) => (
                <button
                  key={convo.id}
                  type="button"
                  onClick={() => loadMessages(convo)}
                  className="w-full rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-left transition-colors hover:border-brand-500/30 hover:bg-white/[0.04]"
                >
                  <p className="text-sm font-medium text-white">{convo.title}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
                    <span>{convo.messageCount} messages</span>
                    <span>{formatDate(convo.lastMessageAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
