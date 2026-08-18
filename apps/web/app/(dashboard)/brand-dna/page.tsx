'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Building2, ChevronDown, ChevronRight, Dna, Key, Loader2, MessageSquare,
  Mic, Package, Palette, PenTool, Plus, Save, Share2, Shield, Swords,
  Target, Trash2, Users,
} from 'lucide-react';
import { api } from '@/lib/api';
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
  companyName: '', description: '', industry: '', websiteUrl: '', products: [],
  voiceDescription: '', tone: 'professional', demographics: '', psychographics: '',
  goals: [], keywords: [], writingStyle: '', prohibitedPhrases: [], complianceRules: [],
  primaryColor: '#052b57', secondaryColor: '#ffffff', accentColor: '#167cc1', logoUrl: '',
  socialHandles: {}, competitors: [], preferredCtas: [],
};

const tones = ['professional', 'casual', 'friendly', 'authoritative', 'playful'] as const;
const socialPlatforms = ['twitter', 'linkedin', 'facebook', 'instagram', 'tiktok', 'youtube'] as const;
const inputClass = 'ep-input min-h-10 px-3 py-2 text-sm';
const textareaClass = 'ep-input px-3 py-2.5 text-sm leading-6';

export default function BrandDNAPage() {
  const [brandDNA, setBrandDNA] = useState<BrandDNA>(defaultBrandDNA);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['company', 'products', 'voice', 'audience']));

  const fetchBrandDNA = useCallback(async () => {
    try {
      const data = await api.get<{ data: BrandDNA }>('/brand-dna');
      setBrandDNA({ ...defaultBrandDNA, ...data.data });
    } catch {
      // A new workspace legitimately starts without Brand DNA.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchBrandDNA(); }, [fetchBrandDNA]);

  function toggleSection(id: string) {
    setOpenSections((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    try {
      setSaving(true);
      if (brandDNA.id) await api.put('/brand-dna', { body: brandDNA });
      else {
        const data = await api.post<{ data: BrandDNA }>('/brand-dna', { body: brandDNA });
        setBrandDNA(data.data);
      }
      setLastSaved(new Date());
      toast.success('Brand DNA saved');
    } catch {
      toast.error('Brand DNA could not be saved');
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof BrandDNA>(key: K, value: BrandDNA[K]) {
    setBrandDNA((previous) => ({ ...previous, [key]: value }));
  }

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--ep-blue)]" /></div>;

  const hasData = Boolean(brandDNA.companyName || brandDNA.description || brandDNA.products.length);

  return (
    <div className="space-y-6">
      <header className="ep-panel p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="ep-section-label">Business Brain · Brand DNA</p>
            <h1 className="ep-page-title mt-2">Define the facts and voice your marketing must follow.</h1>
            <p className="ep-page-copy mt-3 text-sm leading-6 sm:text-base">Products, audience, tone, goals, proof, restrictions and visual identity become grounded context for campaign planning and content production.</p>
          </div>
          <div className="flex items-center gap-3">
            {lastSaved && <span className="hidden text-xs text-[var(--ep-text-soft)] sm:inline">Saved {lastSaved.toLocaleTimeString()}</span>}
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="ep-button-primary px-4 py-2.5 text-sm">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Brand DNA</button>
          </div>
        </div>
      </header>

      {!hasData && <div className="ep-status-warning rounded-xl border p-4"><div className="flex items-start gap-3"><Dna className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-extrabold">Complete your Business Brain.</p><p className="mt-1 text-sm leading-5 opacity-80">Start with the company, products, brand voice and audience. Add only facts and claims your marketing is allowed to use.</p></div></div></div>}

      <div className="space-y-3">
        <CollapsibleSection id="company" title="Company & Business" icon={Building2} isOpen={openSections.has('company')} onToggle={() => toggleSection('company')}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company name"><input value={brandDNA.companyName} onChange={(event) => updateField('companyName', event.target.value)} placeholder="Business name" className={inputClass} /></Field>
            <Field label="Industry"><input value={brandDNA.industry} onChange={(event) => updateField('industry', event.target.value)} placeholder="Industry or market" className={inputClass} /></Field>
            <Field label="Website"><input type="url" value={brandDNA.websiteUrl} onChange={(event) => updateField('websiteUrl', event.target.value)} placeholder="https://example.com" className={inputClass} /></Field>
            <div className="md:col-span-2"><Field label="What the business does"><textarea value={brandDNA.description} onChange={(event) => updateField('description', event.target.value)} rows={4} placeholder="Describe the business, its offer and what makes it useful." className={textareaClass} /></Field></div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="products" title="Products & Services" icon={Package} isOpen={openSections.has('products')} onToggle={() => toggleSection('products')}>
          <DynamicList items={brandDNA.products} onChange={(items) => updateField('products', items)} placeholder="Product or service" />
        </CollapsibleSection>

        <CollapsibleSection id="voice" title="Brand Voice" icon={Mic} isOpen={openSections.has('voice')} onToggle={() => toggleSection('voice')}>
          <div className="grid gap-4 md:grid-cols-[1fr_240px]">
            <Field label="Voice description"><textarea value={brandDNA.voiceDescription} onChange={(event) => updateField('voiceDescription', event.target.value)} rows={4} placeholder="How should the brand sound?" className={textareaClass} /></Field>
            <Field label="Tone"><select value={brandDNA.tone} onChange={(event) => updateField('tone', event.target.value)} className={inputClass}>{tones.map((tone) => <option key={tone} value={tone}>{tone.charAt(0).toUpperCase() + tone.slice(1)}</option>)}</select></Field>
          </div>
        </CollapsibleSection>

        <CollapsibleSection id="audience" title="Target Audience" icon={Users} isOpen={openSections.has('audience')} onToggle={() => toggleSection('audience')}>
          <div className="grid gap-4 md:grid-cols-2"><Field label="Demographics"><textarea value={brandDNA.demographics} onChange={(event) => updateField('demographics', event.target.value)} rows={4} placeholder="Location, age, role, income, business size or other relevant facts." className={textareaClass} /></Field><Field label="Psychographics"><textarea value={brandDNA.psychographics} onChange={(event) => updateField('psychographics', event.target.value)} rows={4} placeholder="Needs, priorities, motivations, objections and pain points." className={textareaClass} /></Field></div>
        </CollapsibleSection>

        <CollapsibleSection id="goals" title="Goals" icon={Target} isOpen={openSections.has('goals')} onToggle={() => toggleSection('goals')}><DynamicList items={brandDNA.goals} onChange={(items) => updateField('goals', items)} placeholder="Marketing or business goal" /></CollapsibleSection>
        <CollapsibleSection id="keywords" title="Keywords & Topics" icon={Key} isOpen={openSections.has('keywords')} onToggle={() => toggleSection('keywords')}><DynamicList items={brandDNA.keywords} onChange={(items) => updateField('keywords', items)} placeholder="Keyword, phrase or important topic" /></CollapsibleSection>
        <CollapsibleSection id="writing" title="Writing Style" icon={PenTool} isOpen={openSections.has('writing')} onToggle={() => toggleSection('writing')}><Field label="Style guidelines"><textarea value={brandDNA.writingStyle} onChange={(event) => updateField('writingStyle', event.target.value)} rows={5} placeholder="Preferred structure, formatting, vocabulary and writing rules." className={textareaClass} /></Field></CollapsibleSection>

        <CollapsibleSection id="compliance" title="Claims, Restrictions & Compliance" icon={Shield} isOpen={openSections.has('compliance')} onToggle={() => toggleSection('compliance')}>
          <div className="grid gap-5 md:grid-cols-2"><div><h4 className="mb-3 text-sm font-extrabold text-[var(--ep-navy)]">Prohibited phrases or claims</h4><DynamicList items={brandDNA.prohibitedPhrases} onChange={(items) => updateField('prohibitedPhrases', items)} placeholder="Phrase or claim marketing must not use" /></div><div><h4 className="mb-3 text-sm font-extrabold text-[var(--ep-navy)]">Compliance rules</h4><DynamicList items={brandDNA.complianceRules} onChange={(items) => updateField('complianceRules', items)} placeholder="Rule or requirement" /></div></div>
        </CollapsibleSection>

        <CollapsibleSection id="visual" title="Visual Identity" icon={Palette} isOpen={openSections.has('visual')} onToggle={() => toggleSection('visual')}>
          <div className="space-y-4"><div className="grid gap-4 sm:grid-cols-3"><ColorField label="Primary colour" value={brandDNA.primaryColor} onChange={(value) => updateField('primaryColor', value)} /><ColorField label="Secondary colour" value={brandDNA.secondaryColor} onChange={(value) => updateField('secondaryColor', value)} /><ColorField label="Accent colour" value={brandDNA.accentColor} onChange={(value) => updateField('accentColor', value)} /></div><Field label="Business logo URL"><input type="url" value={brandDNA.logoUrl} onChange={(event) => updateField('logoUrl', event.target.value)} placeholder="https://example.com/logo.png" className={inputClass} /></Field></div>
        </CollapsibleSection>

        <CollapsibleSection id="social" title="Social Handles" icon={Share2} isOpen={openSections.has('social')} onToggle={() => toggleSection('social')}>
          <div className="grid gap-4 sm:grid-cols-2">{socialPlatforms.map((platform) => <Field key={platform} label={platform.charAt(0).toUpperCase() + platform.slice(1)}><input value={brandDNA.socialHandles[platform] ?? ''} onChange={(event) => updateField('socialHandles', { ...brandDNA.socialHandles, [platform]: event.target.value })} placeholder="@handle or profile URL" className={inputClass} /></Field>)}</div>
        </CollapsibleSection>

        <CollapsibleSection id="competitors" title="Known Competitors" icon={Swords} isOpen={openSections.has('competitors')} onToggle={() => toggleSection('competitors')}><DynamicKeyValueList items={brandDNA.competitors} onChange={(items) => updateField('competitors', items)} /></CollapsibleSection>
        <CollapsibleSection id="ctas" title="Preferred Calls to Action" icon={MessageSquare} isOpen={openSections.has('ctas')} onToggle={() => toggleSection('ctas')}><DynamicList items={brandDNA.preferredCtas} onChange={(items) => updateField('preferredCtas', items)} placeholder="Call to action" /></CollapsibleSection>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, isOpen, onToggle, children }: { id: string; title: string; icon: React.ComponentType<{ className?: string }>; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  return <section className="ep-card overflow-hidden"><button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-[var(--ep-blue-soft)]"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--ep-blue-soft)] text-[var(--ep-blue)]"><Icon className="h-4 w-4" /></span><span className="flex-1 font-extrabold text-[var(--ep-navy)]">{title}</span>{isOpen ? <ChevronDown className="h-4 w-4 text-[var(--ep-text-soft)]" /> : <ChevronRight className="h-4 w-4 text-[var(--ep-text-soft)]" />}</button>{isOpen && <div className="border-t border-[var(--ep-border)] p-5 sm:p-6">{children}</div>}</section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-extrabold text-[var(--ep-text-muted)]">{label}</span>{children}</label>;
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Field label={label}><div className="flex items-center gap-2"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-[var(--ep-border)] bg-white p-1" /><input value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} min-w-0 flex-1`} /></div></Field>;
}

function DynamicList({ items, onChange, placeholder }: { items: string[]; onChange: (items: string[]) => void; placeholder: string }) {
  return <div className="space-y-2">{items.map((item, index) => <div key={index} className="flex items-center gap-2"><input value={item} onChange={(event) => onChange(items.map((value, current) => current === index ? event.target.value : value))} placeholder={placeholder} className={`${inputClass} min-w-0 flex-1`} /><button type="button" onClick={() => onChange(items.filter((_, current) => current !== index))} className="rounded-lg p-2 text-[var(--ep-text-soft)] hover:bg-[var(--ep-danger-soft)] hover:text-[var(--ep-danger)]" aria-label="Remove"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => onChange([...items, ''])} className="ep-button-secondary px-3 py-2 text-xs"><Plus className="h-3.5 w-3.5" /> Add</button></div>;
}

function DynamicKeyValueList({ items, onChange }: { items: { name: string; url: string }[]; onChange: (items: { name: string; url: string }[]) => void }) {
  return <div className="space-y-2">{items.map((item, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input value={item.name} onChange={(event) => onChange(items.map((value, current) => current === index ? { ...value, name: event.target.value } : value))} placeholder="Competitor name" className={inputClass} /><input type="url" value={item.url} onChange={(event) => onChange(items.map((value, current) => current === index ? { ...value, url: event.target.value } : value))} placeholder="Website URL" className={inputClass} /><button type="button" onClick={() => onChange(items.filter((_, current) => current !== index))} className="rounded-lg p-2 text-[var(--ep-text-soft)] hover:bg-[var(--ep-danger-soft)] hover:text-[var(--ep-danger)]" aria-label="Remove competitor"><Trash2 className="h-4 w-4" /></button></div>)}<button type="button" onClick={() => onChange([...items, { name: '', url: '' }])} className="ep-button-secondary px-3 py-2 text-xs"><Plus className="h-3.5 w-3.5" /> Add competitor</button></div>;
}
