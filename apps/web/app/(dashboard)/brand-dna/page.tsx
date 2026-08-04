'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Save,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
  Dna,
  Building2,
  Package,
  Mic,
  Users,
  Target,
  Key,
  PenTool,
  Shield,
  Palette,
  Share2,
  Swords,
  MessageSquare,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface BrandDNA {
  id?: string;
  companyName: string;
  description: string;
  industry: string;
  websiteUrl: string;
  products: string[];
  voiceDescription: string;
  tone: string;
  demographics: string;
  psychographics: string;
  goals: string[];
  keywords: string[];
  writingStyle: string;
  prohibitedPhrases: string[];
  complianceRules: string[];
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string;
  socialHandles: Record<string, string>;
  competitors: { name: string; url: string }[];
  preferredCtas: string[];
}

const defaultBrandDNA: BrandDNA = {
  companyName: '',
  description: '',
  industry: '',
  websiteUrl: '',
  products: [],
  voiceDescription: '',
  tone: 'professional',
  demographics: '',
  psychographics: '',
  goals: [],
  keywords: [],
  writingStyle: '',
  prohibitedPhrases: [],
  complianceRules: [],
  primaryColor: '#6366f1',
  secondaryColor: '#8b5cf6',
  accentColor: '#ec4899',
  logoUrl: '',
  socialHandles: {},
  competitors: [],
  preferredCtas: [],
};

const tones = ['professional', 'casual', 'friendly', 'authoritative', 'playful'] as const;

const socialPlatforms = ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'youtube'] as const;

const inputClass = 'h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50';
const textareaClass = 'w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50';

export default function BrandDNAPage() {
  const [brandDNA, setBrandDNA] = useState<BrandDNA>(defaultBrandDNA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['company', 'voice']));

  const fetchBrandDNA = useCallback(async () => {
    try {
      const data = await api.get<{ data: BrandDNA }>('/brand-dna');
      setBrandDNA({ ...defaultBrandDNA, ...data.data });
    } catch {
      // Brand DNA not set up yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrandDNA();
  }, [fetchBrandDNA]);

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    try {
      setSaving(true);
      if (brandDNA.id) {
        await api.put('/brand-dna', { body: brandDNA });
      } else {
        const data = await api.post<{ data: BrandDNA }>('/brand-dna', { body: brandDNA });
        setBrandDNA(data.data);
      }
      setLastSaved(new Date());
      toast.success('Brand DNA saved');
    } catch {
      toast.error('Failed to save Brand DNA');
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof BrandDNA>(key: K, value: BrandDNA[K]) {
    setBrandDNA((prev) => ({ ...prev, [key]: value }));
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  const hasData = brandDNA.companyName || brandDNA.description || brandDNA.products.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Brand DNA</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Define your brand identity so AI agents create content that matches your brand.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {lastSaved && (
            <span className="text-xs text-zinc-500">
              Last saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save
          </button>
        </div>
      </div>

      {!hasData && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="flex items-start gap-3">
            <Dna className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-semibold text-white">Set up your Brand DNA</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Set up your Brand DNA so AI agents create content that matches your brand.
                Fill in as many sections as possible for the best results.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <CollapsibleSection id="company" title="Company Info" icon={Building2} isOpen={openSections.has('company')} onToggle={() => toggleSection('company')}>
          <div className="space-y-4">
            <Field label="Company Name">
              <input type="text" value={brandDNA.companyName} onChange={(e) => updateField('companyName', e.target.value)} placeholder="Acme Inc" className={inputClass} />
            </Field>
            <Field label="Description">
              <textarea value={brandDNA.description} onChange={(e) => updateField('description', e.target.value)} rows={3} placeholder="What does your company do?" className={textareaClass} />
            </Field>
            <Field label="Industry">
              <input type="text" value={brandDNA.industry} onChange={(e) => updateField('industry', e.target.value)} placeholder="SaaS, E-commerce, Healthcare..." className={inputClass} />
            </Field>
            <Field label="Website URL">
              <input type="url" value={brandDNA.websiteUrl} onChange={(e) => updateField('websiteUrl', e.target.value)} placeholder="https://example.com" className={inputClass} />
            </Field>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="products" title="Products & Services" icon={Package} isOpen={openSections.has('products')} onToggle={() => toggleSection('products')}>
          <DynamicList items={brandDNA.products} onChange={(items) => updateField('products', items)} placeholder="Product or service name" />
        </CollapsibleSection>

        <CollapsibleSection id="voice" title="Brand Voice" icon={Mic} isOpen={openSections.has('voice')} onToggle={() => toggleSection('voice')}>
          <div className="space-y-4">
            <Field label="Voice Description">
              <textarea value={brandDNA.voiceDescription} onChange={(e) => updateField('voiceDescription', e.target.value)} rows={3} placeholder="Describe how your brand communicates..." className={textareaClass} />
            </Field>
            <Field label="Tone">
              <select value={brandDNA.tone} onChange={(e) => updateField('tone', e.target.value)} className={cn(inputClass, 'h-10')}>
                {tones.map((t) => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </Field>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="audience" title="Target Audience" icon={Users} isOpen={openSections.has('audience')} onToggle={() => toggleSection('audience')}>
          <div className="space-y-4">
            <Field label="Demographics">
              <textarea value={brandDNA.demographics} onChange={(e) => updateField('demographics', e.target.value)} rows={3} placeholder="Age, location, income level, education..." className={textareaClass} />
            </Field>
            <Field label="Psychographics">
              <textarea value={brandDNA.psychographics} onChange={(e) => updateField('psychographics', e.target.value)} rows={3} placeholder="Interests, values, lifestyle, pain points..." className={textareaClass} />
            </Field>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="goals" title="Goals" icon={Target} isOpen={openSections.has('goals')} onToggle={() => toggleSection('goals')}>
          <DynamicList items={brandDNA.goals} onChange={(items) => updateField('goals', items)} placeholder="Marketing or business goal" />
        </CollapsibleSection>

        <CollapsibleSection id="keywords" title="Keywords" icon={Key} isOpen={openSections.has('keywords')} onToggle={() => toggleSection('keywords')}>
          <DynamicList items={brandDNA.keywords} onChange={(items) => updateField('keywords', items)} placeholder="Keyword or phrase" />
        </CollapsibleSection>

        <CollapsibleSection id="writing" title="Writing Style" icon={PenTool} isOpen={openSections.has('writing')} onToggle={() => toggleSection('writing')}>
          <Field label="Style Guidelines">
            <textarea value={brandDNA.writingStyle} onChange={(e) => updateField('writingStyle', e.target.value)} rows={4} placeholder="Describe preferred writing style, formatting rules, etc." className={textareaClass} />
          </Field>
        </CollapsibleSection>

        <CollapsibleSection id="compliance" title="Compliance" icon={Shield} isOpen={openSections.has('compliance')} onToggle={() => toggleSection('compliance')}>
          <div className="space-y-5">
            <div>
              <h4 className="mb-3 text-sm font-medium text-zinc-300">Prohibited Phrases</h4>
              <DynamicList items={brandDNA.prohibitedPhrases} onChange={(items) => updateField('prohibitedPhrases', items)} placeholder="Phrase to avoid" />
            </div>
            <div>
              <h4 className="mb-3 text-sm font-medium text-zinc-300">Compliance Rules</h4>
              <DynamicList items={brandDNA.complianceRules} onChange={(items) => updateField('complianceRules', items)} placeholder="Compliance rule or guideline" />
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="visual" title="Visual Identity" icon={Palette} isOpen={openSections.has('visual')} onToggle={() => toggleSection('visual')}>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Primary Color">
                <div className="flex items-center gap-2">
                  <input type="color" value={brandDNA.primaryColor} onChange={(e) => updateField('primaryColor', e.target.value)} className="h-10 w-10 cursor-pointer rounded border-0" />
                  <input type="text" value={brandDNA.primaryColor} onChange={(e) => updateField('primaryColor', e.target.value)} className={inputClass} />
                </div>
              </Field>
              <Field label="Secondary Color">
                <div className="flex items-center gap-2">
                  <input type="color" value={brandDNA.secondaryColor} onChange={(e) => updateField('secondaryColor', e.target.value)} className="h-10 w-10 cursor-pointer rounded border-0" />
                  <input type="text" value={brandDNA.secondaryColor} onChange={(e) => updateField('secondaryColor', e.target.value)} className={inputClass} />
                </div>
              </Field>
              <Field label="Accent Color">
                <div className="flex items-center gap-2">
                  <input type="color" value={brandDNA.accentColor} onChange={(e) => updateField('accentColor', e.target.value)} className="h-10 w-10 cursor-pointer rounded border-0" />
                  <input type="text" value={brandDNA.accentColor} onChange={(e) => updateField('accentColor', e.target.value)} className={inputClass} />
                </div>
              </Field>
            </div>
            <Field label="Logo URL">
              <input type="url" value={brandDNA.logoUrl} onChange={(e) => updateField('logoUrl', e.target.value)} placeholder="https://example.com/logo.png" className={inputClass} />
            </Field>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="social" title="Social Handles" icon={Share2} isOpen={openSections.has('social')} onToggle={() => toggleSection('social')}>
          <div className="space-y-3">
            {socialPlatforms.map((platform) => (
              <Field key={platform} label={platform.charAt(0).toUpperCase() + platform.slice(1)}>
                <input
                  type="text"
                  value={brandDNA.socialHandles[platform] ?? ''}
                  onChange={(e) => updateField('socialHandles', { ...brandDNA.socialHandles, [platform]: e.target.value })}
                  placeholder="@yourhandle"
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="competitors" title="Competitors" icon={Swords} isOpen={openSections.has('competitors')} onToggle={() => toggleSection('competitors')}>
          <DynamicKeyValueList
            items={brandDNA.competitors}
            onChange={(items) => updateField('competitors', items)}
            namePlaceholder="Competitor name"
            valuePlaceholder="Website URL"
          />
        </CollapsibleSection>

        <CollapsibleSection id="ctas" title="Preferred CTAs" icon={MessageSquare} isOpen={openSections.has('ctas')} onToggle={() => toggleSection('ctas')}>
          <DynamicList items={brandDNA.preferredCtas} onChange={(items) => updateField('preferredCtas', items)} placeholder="Call to action text" />
        </CollapsibleSection>
      </div>
    </div>
  );
}

function CollapsibleSection({
  id: _id,
  title,
  icon: Icon,
  isOpen,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-surface-100 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-4 transition-colors hover:bg-white/[0.02]"
      >
        <Icon className="h-5 w-5 text-brand-400 shrink-0" />
        <span className="flex-1 text-left text-sm font-semibold text-white">{title}</span>
        {isOpen ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
      </button>
      {isOpen && <div className="border-t border-white/[0.06] px-5 py-5">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-zinc-300">{label}</label>
      {children}
    </div>
  );
}

function DynamicList({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  function addItem() {
    onChange([...items, '']);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, value: string) {
    onChange(items.map((item, i) => (i === index ? value : item)));
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={placeholder}
            className={cn(inputClass, 'flex-1')}
          />
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-brand-400 transition-colors hover:bg-brand-500/10"
      >
        <Plus className="h-3 w-3" />
        Add
      </button>
    </div>
  );
}

function DynamicKeyValueList({
  items,
  onChange,
  namePlaceholder,
  valuePlaceholder,
}: {
  items: { name: string; url: string }[];
  onChange: (items: { name: string; url: string }[]) => void;
  namePlaceholder: string;
  valuePlaceholder: string;
}) {
  function addItem() {
    onChange([...items, { name: '', url: '' }]);
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: 'name' | 'url', value: string) {
    onChange(items.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="text" value={item.name} onChange={(e) => updateItem(i, 'name', e.target.value)} placeholder={namePlaceholder} className={cn(inputClass, 'flex-1')} />
          <input type="url" value={item.url} onChange={(e) => updateItem(i, 'url', e.target.value)} placeholder={valuePlaceholder} className={cn(inputClass, 'flex-1')} />
          <button type="button" onClick={() => removeItem(i)} className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={addItem} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-brand-400 transition-colors hover:bg-brand-500/10">
        <Plus className="h-3 w-3" />
        Add
      </button>
    </div>
  );
}
