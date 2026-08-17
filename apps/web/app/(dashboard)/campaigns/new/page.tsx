'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

const campaignTypes = [
  { value: 'content', label: 'Content campaign' },
  { value: 'social', label: 'Social campaign' },
  { value: 'email', label: 'Email campaign' },
  { value: 'ads', label: 'Advertising campaign' },
  { value: 'sms', label: 'SMS campaign' },
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('content');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      setSaving(true);
      setError(null);
      await api.post('/campaigns', { body: { name: name.trim(), description: description.trim() || undefined, type } });
      router.push('/campaigns');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The campaign could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link href="/campaigns" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-600"><ArrowLeft className="h-4 w-4" />Back to campaigns</Link>
      <div><h1 className="text-2xl font-bold text-white">Create campaign</h1><p className="mt-1 text-sm text-zinc-400">Start with a clear name, purpose and channel. The campaign is created as a draft.</p></div>
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-white/[0.06] bg-surface-100 p-6 shadow-sm">
        <label className="block text-sm font-medium text-zinc-300">Campaign name<span className="text-red-500"> *</span><input required maxLength={255} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-white" placeholder="Spring client growth campaign" /></label>
        <label className="block text-sm font-medium text-zinc-300">Primary channel<select value={type} onChange={(event) => setType(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-white/10 bg-surface-200 px-3 text-white">{campaignTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="block text-sm font-medium text-zinc-300">What should this campaign achieve?<textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-white/[0.03] p-3 text-white" placeholder="Describe the audience, offer and intended outcome." /></label>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="flex flex-wrap gap-3"><button type="submit" disabled={saving || !name.trim()} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create draft campaign</button><Link href="/campaigns" className="rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-500">Cancel</Link></div>
      </form>
    </div>
  );
}
