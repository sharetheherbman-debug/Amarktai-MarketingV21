'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Palette,
  Save,
  Loader2,
  AlertCircle,
  X,
  Globe,
  Image,
  Type,
  Mail,
  CheckCircle2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/types';

interface WhiteLabelConfig {
  id: string;
  organization_id: string;
  brand_name: string | null;
  brand_logo: string | null;
  brand_favicon: string | null;
  brand_colors: Record<string, unknown>;
  brand_font: string | null;
  custom_css: string | null;
  email_branding: Record<string, unknown>;
  login_page_config: Record<string, unknown>;
  removed_branding: boolean;
  custom_footer: string | null;
  support_email: string | null;
  support_url: string | null;
  terms_url: string | null;
  privacy_url: string | null;
}

export default function WhiteLabelPage() {
  const [config, setConfig] = useState<WhiteLabelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const orgId = typeof window !== 'undefined' ? localStorage.getItem('org_id') || '' : '';

  const fetchConfig = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get<ApiResponse<WhiteLabelConfig>>('/white-label/config', {
        params: { organization_id: orgId },
      });
      setConfig(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    if (!config) return;
    try {
      setSaving(true);
      await api.put('/white-label/config', {
        body: { ...config, organization_id: orgId },
      });
      setSuccess('Configuration saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (field: string, value: unknown) => {
    if (!config) return;
    setConfig({ ...config, [field]: value });
  };

  const updateBrandColors = (key: string, value: string) => {
    if (!config) return;
    setConfig({
      ...config,
      brand_colors: { ...(config.brand_colors || {}), [key]: value },
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">White Label Settings</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Customize branding for your agency and clients.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
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

      {success && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <p className="text-sm text-emerald-300">{success}</p>
        </div>
      )}

      {/* Brand Identity */}
      <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Image className="h-5 w-5 text-brand-400" />
          Brand Identity
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-zinc-300">Brand Name</label>
            <input
              type="text"
              value={config?.brand_name || ''}
              onChange={(e) => updateConfig('brand_name', e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
              placeholder="Your Brand Name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Brand Font</label>
            <input
              type="text"
              value={config?.brand_font || ''}
              onChange={(e) => updateConfig('brand_font', e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
              placeholder="Inter, sans-serif"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Logo URL</label>
            <input
              type="url"
              value={config?.brand_logo || ''}
              onChange={(e) => updateConfig('brand_logo', e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
              placeholder="https://example.com/logo.png"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Favicon URL</label>
            <input
              type="url"
              value={config?.brand_favicon || ''}
              onChange={(e) => updateConfig('brand_favicon', e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
              placeholder="https://example.com/favicon.ico"
            />
          </div>
        </div>
      </div>

      {/* Colors */}
      <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Palette className="h-5 w-5 text-brand-400" />
          Brand Colors
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {['primary', 'secondary', 'accent', 'background', 'text'].map((colorKey) => (
            <div key={colorKey}>
              <label className="block text-sm font-medium text-zinc-300 capitalize">{colorKey}</label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={(config?.brand_colors?.[colorKey] as string) || '#6366f1'}
                  onChange={(e) => updateBrandColors(colorKey, e.target.value)}
                  className="h-10 w-10 rounded-lg border border-white/[0.06] bg-transparent"
                />
                <input
                  type="text"
                  value={(config?.brand_colors?.[colorKey] as string) || ''}
                  onChange={(e) => updateBrandColors(colorKey, e.target.value)}
                  className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
                  placeholder="#6366f1"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contact & Legal */}
      <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Mail className="h-5 w-5 text-brand-400" />
          Contact & Legal
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-zinc-300">Support Email</label>
            <input
              type="email"
              value={config?.support_email || ''}
              onChange={(e) => updateConfig('support_email', e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
              placeholder="support@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Support URL</label>
            <input
              type="url"
              value={config?.support_url || ''}
              onChange={(e) => updateConfig('support_url', e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
              placeholder="https://support.example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Terms URL</label>
            <input
              type="url"
              value={config?.terms_url || ''}
              onChange={(e) => updateConfig('terms_url', e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
              placeholder="https://example.com/terms"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Privacy URL</label>
            <input
              type="url"
              value={config?.privacy_url || ''}
              onChange={(e) => updateConfig('privacy_url', e.target.value)}
              className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
              placeholder="https://example.com/privacy"
            />
          </div>
        </div>
      </div>

      {/* Advanced */}
      <div className="rounded-xl border border-white/[0.06] bg-surface-100 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Type className="h-5 w-5 text-brand-400" />
          Advanced
        </h2>
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white">Remove AmarktAI Branding</p>
              <p className="text-xs text-zinc-500">Hide &quot;Powered by AmarktAI&quot; from client-facing pages</p>
            </div>
            <button
              onClick={() => updateConfig('removed_branding', !config?.removed_branding)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                config?.removed_branding ? 'bg-brand-500' : 'bg-zinc-600'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  config?.removed_branding ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Custom Footer HTML</label>
            <textarea
              value={config?.custom_footer || ''}
              onChange={(e) => updateConfig('custom_footer', e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
              placeholder="<p>&copy; 2026 Your Company</p>"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300">Custom CSS</label>
            <textarea
              value={config?.custom_css || ''}
              onChange={(e) => updateConfig('custom_css', e.target.value)}
              rows={5}
              className="mt-1 block w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 font-mono text-sm text-white placeholder-zinc-500 focus:border-brand-500 focus:outline-none"
              placeholder=":root { --brand-primary: #6366f1; }"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
