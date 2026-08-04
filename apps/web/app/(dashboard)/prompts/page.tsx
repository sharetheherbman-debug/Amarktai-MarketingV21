'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  FileText,
  Edit2,
  Play,
  Copy,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  Clock,
  Hash,
  Loader2,
  RotateCcw,
  Variable,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

const categories = ['All', 'Content', 'SEO', 'Social', 'Email', 'Research', 'CRM', 'Analytics', 'System'] as const;
type Category = (typeof categories)[number];

interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array';
  required: boolean;
  description?: string;
}

interface PromptVersion {
  id: string;
  version: number;
  template: string;
  variables: PromptVariable[];
  systemPrompt?: string;
  createdAt: string;
}

interface Prompt {
  id: string;
  name: string;
  category: Exclude<Category, 'All'>;
  template: string;
  variables: PromptVariable[];
  systemPrompt?: string;
  version: number;
  usageCount: number;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  versions?: PromptVersion[];
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category>('All');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);
  const [testingPrompt, setTestingPrompt] = useState<Prompt | null>(null);
  const [showVersionHistory, setShowVersionHistory] = useState<Prompt | null>(null);

  const fetchPrompts = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (activeCategory !== 'All') params.category = activeCategory;
      if (search) params.search = search;
      const data = await api.get<{ data: Prompt[] }>('/prompts', { params });
      setPrompts(data.data);
    } catch {
      toast.error('Failed to load prompts');
    } finally {
      setLoading(false);
    }
  }, [activeCategory, search]);

  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  const filteredPrompts = prompts.filter((p) => {
    if (activeCategory !== 'All' && p.category !== activeCategory) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleDelete(id: string) {
    if (!confirm('Delete this prompt?')) return;
    try {
      await api.delete(`/prompts/${id}`);
      setPrompts((prev) => prev.filter((p) => p.id !== id));
      toast.success('Prompt deleted');
    } catch {
      toast.error('Failed to delete prompt');
    }
  }

  async function handleClone(prompt: Prompt) {
    try {
      const data = await api.post<{ data: Prompt }>('/prompts', {
        body: {
          name: `${prompt.name} (Copy)`,
          category: prompt.category,
          template: prompt.template,
          variables: prompt.variables,
          systemPrompt: prompt.systemPrompt,
        },
      });
      setPrompts((prev) => [data.data, ...prev]);
      toast.success('Prompt cloned');
    } catch {
      toast.error('Failed to clone prompt');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Prompt Library</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Manage reusable prompt templates with variables for your AI agents.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Create Prompt
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-white/[0.06] bg-surface-100 p-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                activeCategory === cat
                  ? 'bg-white/[0.08] text-white'
                  : 'text-zinc-400 hover:text-white'
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search prompts..."
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
      ) : filteredPrompts.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] bg-surface-100">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.04]">
              <FileText className="h-8 w-8 text-zinc-500" />
            </div>
            <h3 className="mt-6 text-lg font-semibold text-white">No prompts yet</h3>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">
              Create your first prompt to get started.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              Create your first prompt
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPrompts.map((prompt) => (
            <div
              key={prompt.id}
              className="group relative rounded-xl border border-white/[0.06] bg-surface-100 p-5 transition-all hover:border-brand-500/30 hover:bg-surface-200"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="truncate text-base font-semibold text-white">{prompt.name}</h3>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-full bg-brand-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-400">
                      {prompt.category}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <Hash className="h-3 w-3" />
                      v{prompt.version}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-zinc-500">
                      <Play className="h-3 w-3" />
                      {prompt.usageCount} uses
                    </span>
                  </div>
                </div>
              </div>

              <p className="mt-3 line-clamp-2 text-sm text-zinc-400">
                {prompt.template.slice(0, 120)}...
              </p>

              <div className="mt-4 flex items-center justify-between">
                <span className="flex items-center gap-1 text-xs text-zinc-500">
                  <Clock className="h-3 w-3" />
                  {formatDate(prompt.updatedAt)}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingPrompt(prompt)}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                    title="Edit"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestingPrompt(prompt)}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-brand-400"
                    title="Test"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVersionHistory(prompt)}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-amber-400"
                    title="Version History"
                  >
                    <Clock className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClone(prompt)}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-blue-400"
                    title="Clone"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(prompt.id)}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <PromptModal
          onClose={() => setShowCreateModal(false)}
          onSave={(prompt) => {
            setPrompts((prev) => [prompt, ...prev]);
            setShowCreateModal(false);
          }}
        />
      )}

      {editingPrompt && (
        <PromptModal
          prompt={editingPrompt}
          onClose={() => setEditingPrompt(null)}
          onSave={(updated) => {
            setPrompts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            setEditingPrompt(null);
          }}
        />
      )}

      {testingPrompt && (
        <TestPromptModal
          prompt={testingPrompt}
          onClose={() => setTestingPrompt(null)}
        />
      )}

      {showVersionHistory && (
        <VersionHistorySidebar
          prompt={showVersionHistory}
          onClose={() => setShowVersionHistory(null)}
          onRollback={(version) => {
            setPrompts((prev) =>
              prev.map((p) =>
                p.id === showVersionHistory.id
                  ? { ...p, template: version.template, variables: version.variables, version: version.version }
                  : p
              )
            );
            setShowVersionHistory(null);
          }}
        />
      )}
    </div>
  );
}

function PromptModal({
  prompt,
  onClose,
  onSave,
}: {
  prompt?: Prompt;
  onClose: () => void;
  onSave: (prompt: Prompt) => void;
}) {
  const [name, setName] = useState(prompt?.name ?? '');
  const [category, setCategory] = useState<Exclude<Category, 'All'>>(prompt?.category ?? 'Content');
  const [template, setTemplate] = useState(prompt?.template ?? '');
  const [systemPrompt, setSystemPrompt] = useState(prompt?.systemPrompt ?? '');
  const [variables, setVariables] = useState<PromptVariable[]>(prompt?.variables ?? []);
  const [saving, setSaving] = useState(false);

  function addVariable() {
    setVariables((prev) => [...prev, { name: '', type: 'string', required: false }]);
  }

  function removeVariable(index: number) {
    setVariables((prev) => prev.filter((_, i) => i !== index));
  }

  function updateVariable(index: number, field: keyof PromptVariable, value: string | boolean) {
    setVariables((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: value } : v))
    );
  }

  async function handleSave() {
    if (!name.trim() || !template.trim()) {
      toast.error('Name and template are required');
      return;
    }
    try {
      setSaving(true);
      const body = { name, category, template, variables, systemPrompt: systemPrompt || undefined };
      if (prompt) {
        const data = await api.put<{ data: Prompt }>(`/prompts/${prompt.id}`, { body });
        onSave(data.data);
      } else {
        const data = await api.post<{ data: Prompt }>('/prompts', { body });
        onSave(data.data);
      }
      toast.success(prompt ? 'Prompt updated' : 'Prompt created');
    } catch {
      toast.error('Failed to save prompt');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.06] bg-surface-100 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {prompt ? 'Edit Prompt' : 'Create Prompt'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Blog Post Generator"
              className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Exclude<Category, 'All'>)}
              className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white outline-none transition-colors focus:border-brand-500/50"
            >
              {categories.filter((c) => c !== 'All').map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">
              Template
              <span className="ml-2 text-xs text-zinc-500">Use {'{{variable}}'} syntax</span>
            </label>
            <textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={6}
              placeholder="Write a {{type}} about {{topic}} for {{audience}}..."
              className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 font-mono text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-300">System Prompt (optional)</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={3}
              placeholder="You are a helpful marketing assistant..."
              className="w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-zinc-300">Variables</label>
              <button
                type="button"
                onClick={addVariable}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-brand-400 transition-colors hover:bg-brand-500/10"
              >
                <Plus className="h-3 w-3" />
                Add Variable
              </button>
            </div>
            {variables.length === 0 ? (
              <p className="text-sm text-zinc-500">No variables defined.</p>
            ) : (
              <div className="space-y-2">
                {variables.map((v, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <Variable className="h-4 w-4 text-zinc-500 shrink-0" />
                    <input
                      type="text"
                      value={v.name}
                      onChange={(e) => updateVariable(i, 'name', e.target.value)}
                      placeholder="Variable name"
                      className="h-8 flex-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-brand-500/50"
                    />
                    <select
                      value={v.type}
                      onChange={(e) => updateVariable(i, 'type', e.target.value)}
                      className="h-8 rounded-md border border-white/[0.06] bg-white/[0.03] px-2 text-sm text-white outline-none focus:border-brand-500/50"
                    >
                      <option value="string">String</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                      <option value="array">Array</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={v.required}
                        onChange={(e) => updateVariable(i, 'required', e.target.checked)}
                        className="rounded border-zinc-600"
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      onClick={() => removeVariable(i)}
                      className="rounded p-1 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {prompt ? 'Save Changes' : 'Create Prompt'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TestPromptModal({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  function renderTemplate(): string {
    let rendered = prompt.template;
    for (const [key, value] of Object.entries(values)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return rendered;
  }

  async function handleTest() {
    try {
      setTesting(true);
      const data = await api.post<{ data: { output: string } }>(`/prompts/${prompt.id}/test`, {
        body: { variables: values },
      });
      setResult(data.data.output);
    } catch {
      setResult(renderTemplate());
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/[0.06] bg-surface-100 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Test: {prompt.name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-5">
          {prompt.variables.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-medium text-zinc-300">Enter Variable Values</h3>
              <div className="space-y-3">
                {prompt.variables.map((v) => (
                  <div key={v.name}>
                    <label className="mb-1 block text-xs font-medium text-zinc-400">
                      {'{{' + v.name + '}}'}
                      {v.required && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      type="text"
                      value={values[v.name] ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [v.name]: e.target.value }))}
                      placeholder={`Enter ${v.name}...`}
                      className="h-9 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-300">Rendered Preview</h3>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <pre className="whitespace-pre-wrap text-sm text-zinc-300">{renderTemplate()}</pre>
            </div>
          </div>

          {result !== null && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-300">AI Output</h3>
              <div className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-4">
                <pre className="whitespace-pre-wrap text-sm text-zinc-300">{result}</pre>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Run Test
          </button>
        </div>
      </div>
    </div>
  );
}

function VersionHistorySidebar({
  prompt,
  onClose,
  onRollback,
}: {
  prompt: Prompt;
  onClose: () => void;
  onRollback: (version: PromptVersion) => void;
}) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{ data: PromptVersion[] }>(`/prompts/${prompt.id}/versions`);
        setVersions(data.data);
      } catch {
        setVersions([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [prompt.id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md h-full overflow-y-auto border-l border-white/[0.06] bg-surface-100 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Version History</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-1 text-sm text-zinc-400">{prompt.name}</p>

        <div className="mt-6 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
            </div>
          ) : versions.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-500">No version history available.</p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white">Version {v.version}</span>
                  <span className="text-xs text-zinc-500">{formatDate(v.createdAt)}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-xs text-zinc-400 font-mono">
                  {v.template}
                </p>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onRollback(v)}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/10"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Rollback
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
