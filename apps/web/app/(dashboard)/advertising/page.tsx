'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  Image as ImageIcon,
  Loader2,
  Megaphone,
  MousePointerClick,
  RefreshCw,
  Sparkles,
  Target,
  WalletCards,
} from 'lucide-react';
import { StudioClient } from '@amarktai/studio';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { ApiResponse } from '@/types';

interface Connection {
  id: string;
  name: string;
  provider_name: string;
  health_status: string;
  last_sync_at: string | null;
}

interface Campaign {
  id: string;
  connection_name: string;
  provider_name: string;
  name: string;
  status: string;
  objective: string | null;
  metrics: Record<string, number> | string;
  last_synced_at: string;
}

interface StudioModel {
  id: string;
  name: string;
  operations?: string[];
  status?: string;
}

interface WhiteLabelBrand { brand_name?: string | null; brand_logo?: string | null; brand_colors?: Record<string, unknown>; brand_font?: string | null; }
interface BrandDnaView { companyName?: string; logoUrl?: string; primaryColor?: string; secondaryColor?: string; accentColor?: string; preferredCtas?: string[]; }

type QualityTier = 'economy' | 'smart' | 'premium';
type AdFormat = 'square' | 'landscape' | 'portrait';

const FORMAT_PRESETS: Record<AdFormat, { label: string; width: number; height: number; note: string }> = {
  square: { label: 'Facebook / Instagram Square', width: 1080, height: 1080, note: '1:1 feed creative' },
  landscape: { label: 'Facebook Landscape', width: 1200, height: 628, note: '1.91:1 link / feed creative' },
  portrait: { label: 'Instagram Portrait', width: 1080, height: 1350, note: '4:5 feed creative' },
};

const IMAGE_TIER_PREFERENCES: Record<QualityTier, string[]> = {
  economy: ['genxlm-pro-v1-img-fast', 'genxlm-pro-v1-img', 'grok-imagine'],
  smart: ['genxlm-pro-v1-img', 'recraft-v4.1', 'grok-imagine-2', 'genxlm-pro-v1-img-fast'],
  premium: ['recraft-v4.1-pro', 'recraft-v4.1', 'genxlm-pro-v1-img'],
};

const TIER_COPY: Record<QualityTier, { title: string; detail: string }> = {
  economy: { title: 'Economy', detail: 'Lowest-cost social visual' },
  smart: { title: 'Smart', detail: 'Recommended quality / cost balance' },
  premium: { title: 'Premium', detail: 'Highest-fidelity visual' },
};

function readMetrics(value: Campaign['metrics']): Record<string, number> {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, number>;
    } catch {
      return {};
    }
  }
  return value || {};
}

function chooseModel(models: StudioModel[], tier: QualityTier): StudioModel | undefined {
  // Customer tiers map only to reviewed, policy-approved routes. Never fall back
  // to an arbitrary runtime model: an unavailable tier must remain unavailable.
  const available = models.filter((model) => model.status === undefined || model.status === 'available' || model.status === 'healthy');
  for (const id of IMAGE_TIER_PREFERENCES[tier]) {
    const match = available.find((model) => model.id === id);
    if (match) return match;
  }
  return undefined;
}

function splitWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = words[0];
  for (let index = 1; index < words.length; index += 1) {
    const candidate = `${current} ${words[index]}`;
    if (ctx.measureText(candidate).width <= maxWidth) current = candidate;
    else {
      lines.push(current);
      current = words[index];
    }
  }
  lines.push(current);
  return lines;
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  const x = (width - drawWidth) / 2;
  const y = (height - drawHeight) / 2;
  ctx.drawImage(image, x, y, drawWidth, drawHeight);
}

async function loadImageWithCredentials(url: string): Promise<HTMLImageElement> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error(`Could not load generated visual (${response.status})`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Generated visual could not be decoded'));
      image.src = objectUrl;
    });
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function AdvertisingPage() {
  const { currentOrganization } = useAuthStore();
  const organizationId = currentOrganization?.id || '';
  const organizationName = currentOrganization?.name || '';
  const studio = useMemo(() => new StudioClient({ organizationId }), [organizationId]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [imageModels, setImageModels] = useState<StudioModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [tier, setTier] = useState<QualityTier>('smart');
  const [format, setFormat] = useState<AdFormat>('square');
  const [visualPrompt, setVisualPrompt] = useState('Premium British equestrian lifestyle scene at a contemporary stable, elegant bay warmblood, confident professional rider and modern digital-first atmosphere, natural morning light, aspirational but authentic, clean composition with generous negative space for advertising copy.');
  const [headline, setHeadline] = useState('A clearer next step for your customers.');
  const [body, setBody] = useState('Bring your approved offer, service and customer value into one compelling campaign material.');
  const [cta, setCta] = useState('');
  const [brandName, setBrandName] = useState(organizationName);
  const [brandLogo, setBrandLogo] = useState('');
  const [brandPrimary, setBrandPrimary] = useState('');
  const [brandSecondary, setBrandSecondary] = useState('');
  const [brandAccent, setBrandAccent] = useState('');
  const [brandFont, setBrandFont] = useState('sans-serif');
  const [generating, setGenerating] = useState(false);
  const [visualUrl, setVisualUrl] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);

  useEffect(() => {
    if (organizationName && brandName === 'EquiProfile') setBrandName(organizationName);
  }, [organizationName, brandName]);

  const selectedModel = useMemo(() => chooseModel(imageModels, tier), [imageModels, tier]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [connectionsResult, campaignsResult, modelsResult, whiteLabelResult, brandDnaResult] = await Promise.allSettled([
      api.get<ApiResponse<Connection[]>>('/integrations/connections', { params: { category: 'advertising' } }),
      api.get<ApiResponse<Campaign[]>>('/integrations/advertising/campaigns'),
      studio.listModels('text_to_image'),
      api.get<ApiResponse<WhiteLabelBrand>>('/white-label/config', { params: { organization_id: organizationId } }),
      api.get<ApiResponse<BrandDnaView | null>>('/brand-dna', { params: { organization_id: organizationId } }),
    ]);

    if (connectionsResult.status === 'fulfilled') setConnections(connectionsResult.value.data || []);
    if (campaignsResult.status === 'fulfilled') setCampaigns(campaignsResult.value.data || []);
    if (modelsResult.status === 'fulfilled') setImageModels((modelsResult.value || []) as StudioModel[]);
    const whiteLabel = whiteLabelResult.status === 'fulfilled' ? whiteLabelResult.value.data : null;
    const dna = brandDnaResult.status === 'fulfilled' ? brandDnaResult.value.data : null;
    const colors = whiteLabel?.brand_colors || {};
    const configuredName = String(whiteLabel?.brand_name || dna?.companyName || organizationName || '').trim();
    const configuredLogo = String(whiteLabel?.brand_logo || dna?.logoUrl || '').trim();
    const primary = String(colors.primary || colors.primary_color || dna?.primaryColor || '').trim();
    const secondary = String(colors.secondary || colors.text || dna?.secondaryColor || '').trim();
    const accent = String(colors.accent || colors.accent_color || dna?.accentColor || primary || '').trim();
    setBrandName(configuredName); setBrandLogo(configuredLogo); setBrandPrimary(primary); setBrandSecondary(secondary); setBrandAccent(accent); setBrandFont(String(whiteLabel?.brand_font || 'sans-serif'));
    if (dna?.preferredCtas?.[0]) setCta((current) => current.trim() || String(dna.preferredCtas![0]));

    if (modelsResult.status === 'rejected') {
      setError(modelsResult.reason instanceof Error ? modelsResult.reason.message : 'Image generation models could not be loaded.');
    } else if (connectionsResult.status === 'rejected' || campaignsResult.status === 'rejected') {
      setError('Ad creation is available, but some connected-account reporting could not be refreshed.');
    }
    setLoading(false);
  }, [organizationId, organizationName, studio]);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/integrations/advertising/connections/${id}/sync`, { body: {} });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Advertising sync failed.');
    } finally {
      setBusyId(null);
    }
  };

  const renderCreative = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !visualUrl) {
      setCanvasReady(false);
      return;
    }
    if (!brandName.trim() || !brandLogo || !brandPrimary) {
      throw new Error('Complete tenant Branding settings (name, logo and primary colour) before composing a final advertising material.');
    }

    const preset = FORMAT_PRESETS[format];
    canvas.width = preset.width;
    canvas.height = preset.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browser canvas is unavailable');

    const [visual, logo] = await Promise.all([loadImageWithCredentials(visualUrl), loadImageWithCredentials(brandLogo)]);
    drawCover(ctx, visual, preset.width, preset.height);

    const width = preset.width;
    const height = preset.height;
    const padding = Math.round(width * 0.065);
    const textWidth = Math.round(width * 0.78);
    const gradient = ctx.createLinearGradient(0, height * 0.25, 0, height);
    gradient.addColorStop(0, 'rgba(0,0,0,0.02)');
    gradient.addColorStop(0.48, 'rgba(0,0,0,0.52)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.94)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const brandFontSize = Math.max(28, Math.round(width * 0.03));
    const foreground = brandSecondary || '#ffffff';
    const brandTypeface = `${brandFont}, sans-serif`;
    const logoHeight = Math.max(42, Math.round(height * 0.06));
    const logoWidth = Math.max(80, Math.round(logoHeight * (logo.naturalWidth / Math.max(1, logo.naturalHeight))));
    ctx.drawImage(logo, padding, padding, logoWidth, logoHeight);
    ctx.fillStyle = foreground;
    ctx.font = `700 ${brandFontSize}px ${brandTypeface}`;
    ctx.textBaseline = 'top';
    ctx.fillText(brandName.trim(), padding + logoWidth + 16, padding + Math.max(0, Math.round((logoHeight - brandFontSize) / 2)));

    const headlineFont = Math.max(46, Math.round(width * 0.065));
    ctx.font = `800 ${headlineFont}px ${brandTypeface}`;
    const headlineLines = splitWords(ctx, headline, textWidth).slice(0, 3);
    const headlineLineHeight = Math.round(headlineFont * 1.04);

    const bodyFont = Math.max(24, Math.round(width * 0.028));
    const bodyLineHeight = Math.round(bodyFont * 1.35);
    ctx.font = `500 ${bodyFont}px ${brandTypeface}`;
    const bodyLines = splitWords(ctx, body, textWidth).slice(0, 3);

    const buttonHeight = Math.max(58, Math.round(height * 0.075));
    const blockHeight = headlineLines.length * headlineLineHeight + 24 + bodyLines.length * bodyLineHeight + 34 + buttonHeight;
    let y = height - padding - blockHeight;

    ctx.fillStyle = foreground;
    ctx.font = `800 ${headlineFont}px ${brandTypeface}`;
    for (const line of headlineLines) {
      ctx.fillText(line, padding, y);
      y += headlineLineHeight;
    }

    y += 24;
    ctx.fillStyle = foreground;
    ctx.globalAlpha = 0.9;
    ctx.font = `500 ${bodyFont}px ${brandTypeface}`;
    for (const line of bodyLines) {
      ctx.fillText(line, padding, y);
      y += bodyLineHeight;
    }

    ctx.globalAlpha = 1;
    y += 34;
    const ctaFont = Math.max(23, Math.round(width * 0.025));
    ctx.font = `800 ${ctaFont}px ${brandTypeface}`;
    const ctaLabel = cta.trim() || 'Learn more';
    const buttonWidth = Math.min(textWidth, Math.max(Math.round(width * 0.28), ctx.measureText(ctaLabel).width + 64));
    ctx.fillStyle = brandPrimary;
    ctx.fillRect(padding, y, buttonWidth, buttonHeight);
    ctx.fillStyle = brandSecondary || '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(ctaLabel, padding + 28, y + buttonHeight / 2);

    setCanvasReady(true);
  }, [visualUrl, format, headline, body, cta, brandName, brandLogo, brandPrimary, brandSecondary, brandAccent, brandFont]);

  useEffect(() => {
    let cancelled = false;
    if (!visualUrl) {
      setCanvasReady(false);
      return;
    }
    void renderCreative().catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : 'The final ad preview could not be composed.');
    });
    return () => {
      cancelled = true;
    };
  }, [visualUrl, renderCreative]);

  const generateAd = async () => {
    if (!organizationId) {
      setError('Choose an organization before creating an advert.');
      return;
    }
    if (!selectedModel) {
      setError('The selected quality route is not currently available. Choose another quality level or return when the approved route is healthy.');
      return;
    }
    if (!visualPrompt.trim() || !headline.trim()) {
      setError('Visual direction and headline are required.');
      return;
    }

    setGenerating(true);
    setError(null);
    setCanvasReady(false);
    try {
      const prompt = [
        'Create ONLY the photographic / illustrated background visual for a premium paid social advertisement.',
        'Do not generate any text, words, letters, logos, watermarks, UI, labels, signs or typography.',
        'Keep the main subject visually strong while leaving clean negative space for deterministic brand copy overlays.',
        visualPrompt.trim(),
      ].join(' ');

      const generation = await studio.createGeneration({
        type: 'text_to_image',
        model: selectedModel.id,
        prompt,
        negative_prompt: 'text, words, letters, typography, logo, watermark, caption, poster text, deformed anatomy, low quality, blurry',
        options: {},
      });

      if (!generation?.url) throw new Error('Generation completed without an image output.');
      setGenerationId(generation.id || null);
      setVisualUrl(generation.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The social ad visual could not be generated.');
    } finally {
      setGenerating(false);
    }
  };

  const downloadAd = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasReady) return;
    const preset = FORMAT_PRESETS[format];
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
    if (!blob) {
      setError('The composed advert could not be exported.');
      return;
    }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(brandName || 'advert').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${format}-${preset.width}x${preset.height}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const totals = useMemo(() => campaigns.reduce((sum, campaign) => {
    const metric = readMetrics(campaign.metrics);
    sum.impressions += Number(metric.impressions || 0);
    sum.clicks += Number(metric.clicks || 0);
    sum.spend += Number(metric.spend_cents || 0);
    sum.conversions += Number(metric.conversions || 0);
    return sum;
  }, { impressions: 0, clicks: 0, spend: 0, conversions: 0 }), [campaigns]);

  const cards = [
    ['Impressions', totals.impressions, Eye],
    ['Clicks', totals.clicks, MousePointerClick],
    ['Spend', `$${(totals.spend / 100).toLocaleString()}`, WalletCards],
    ['Conversions', totals.conversions, Target],
  ] as const;

  return <div className="space-y-6">
    <header className="ep-panel p-6 sm:p-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="ep-section-label">Advertising</p>
          <h1 className="ep-page-title mt-2">Create a finished Facebook or Instagram advert.</h1>
          <p className="ep-page-copy mt-3 max-w-3xl text-sm leading-6 sm:text-base">AI generates the visual only. Your headline, message, CTA and brand are composed exactly by the application, so paid social creative does not depend on an image model spelling marketing copy correctly.</p>
        </div>
        <button type="button" onClick={() => void load()} className="ep-button-secondary px-4 py-2.5 text-sm"><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>
    </header>

    {error && <div className="ep-status-danger flex items-start gap-3 rounded-xl border px-4 py-3 text-sm"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

    <section className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
      <div className="ep-card p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div><p className="ep-section-label">Ad builder</p><h2 className="mt-1 text-xl font-extrabold text-[var(--ep-navy)]">Facebook / Instagram image ad</h2></div>
          <div className="rounded-xl bg-[var(--ep-blue-soft)] p-2 text-[var(--ep-blue)]"><Megaphone className="h-5 w-5" /></div>
        </div>

        <p className="mt-5 text-xs font-extrabold uppercase tracking-wide text-[var(--ep-text-muted)]">Quality / cost</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(Object.keys(TIER_COPY) as QualityTier[]).map((item) => <button key={item} type="button" onClick={() => setTier(item)} className={tier === item ? 'rounded-xl border border-[var(--ep-blue)] bg-[var(--ep-blue-soft)] p-3 text-left' : 'rounded-xl border border-[var(--ep-border)] bg-white p-3 text-left hover:border-[var(--ep-border-strong)]'}><span className="block text-xs font-extrabold text-[var(--ep-navy)]">{TIER_COPY[item].title}</span><span className="mt-1 block text-[10px] leading-4 text-[var(--ep-text-muted)]">{TIER_COPY[item].detail}</span></button>)}
        </div>
        <p className="mt-2 text-xs text-[var(--ep-text-soft)]">Creation route: <span className="font-bold text-[var(--ep-text-muted)]">{selectedModel ? `${TIER_COPY[tier].title} route available` : (loading ? 'Checking availability…' : 'Unavailable')}</span></p>

        <label className="mt-5 block text-xs font-extrabold uppercase tracking-wide text-[var(--ep-text-muted)]">Ad format</label>
        <select value={format} onChange={(event) => setFormat(event.target.value as AdFormat)} className="ep-input mt-2 min-h-11 px-3 text-sm">{(Object.entries(FORMAT_PRESETS) as Array<[AdFormat, (typeof FORMAT_PRESETS)[AdFormat]]>).map(([key, preset]) => <option key={key} value={key}>{preset.label} · {preset.width}×{preset.height}</option>)}</select>

        <label className="mt-5 block text-xs font-extrabold uppercase tracking-wide text-[var(--ep-text-muted)]">Visual direction</label>
        <textarea value={visualPrompt} onChange={(event) => setVisualPrompt(event.target.value)} rows={5} maxLength={3000} className="ep-input mt-2 resize-y px-3 py-3 text-sm leading-6" />
        <p className="mt-1 text-[11px] text-[var(--ep-text-soft)]">The generator is instructed to create no text or logos. Copy is added afterwards by the app.</p>

        <label className="mt-4 block text-xs font-extrabold uppercase tracking-wide text-[var(--ep-text-muted)]">Headline</label>
        <input value={headline} onChange={(event) => setHeadline(event.target.value)} maxLength={100} className="ep-input mt-2 min-h-11 px-3 text-sm" />

        <label className="mt-4 block text-xs font-extrabold uppercase tracking-wide text-[var(--ep-text-muted)]">Supporting copy</label>
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} maxLength={220} className="ep-input mt-2 resize-y px-3 py-3 text-sm" />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-extrabold uppercase tracking-wide text-[var(--ep-text-muted)]">CTA<input value={cta} onChange={(event) => setCta(event.target.value)} maxLength={40} className="ep-input mt-2 min-h-11 px-3 text-sm font-normal normal-case tracking-normal" /></label>
          <label className="text-xs font-extrabold uppercase tracking-wide text-[var(--ep-text-muted)]">Brand<input value={brandName} onChange={(event) => setBrandName(event.target.value)} maxLength={60} className="ep-input mt-2 min-h-11 px-3 text-sm font-normal normal-case tracking-normal" /></label>
        </div>

        <button type="button" onClick={() => void generateAd()} disabled={generating || !selectedModel || !organizationId} className="ep-button-primary mt-6 w-full px-4 py-3 text-sm">{generating ? <><Loader2 className="h-4 w-4 animate-spin" />Generating visual…</> : <><Sparkles className="h-4 w-4" />Generate finished advert</>}</button>
        <p className="mt-2 text-center text-[11px] leading-5 text-[var(--ep-text-soft)]">One governed image-generation request. Editing headline, copy, CTA, format or brand after generation costs no additional GenX credits.</p>
      </div>

      <div className="ep-card min-w-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ep-border)] px-5 py-4">
          <div><p className="ep-section-label">Live creative</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Final composed advert</h2></div>
          <button type="button" onClick={() => void downloadAd()} disabled={!canvasReady} className="ep-button-secondary px-3 py-2 text-xs"><Download className="h-3.5 w-3.5" />Download PNG</button>
        </div>
        <div className="flex min-h-[560px] items-center justify-center bg-[var(--ep-page)] p-4 sm:p-7">
          {generating ? <div className="text-center"><Loader2 className="mx-auto h-10 w-10 animate-spin text-[var(--ep-blue)]" /><p className="mt-3 text-sm font-bold text-[var(--ep-text-muted)]">Creating the campaign visual…</p><p className="mt-1 text-xs text-[var(--ep-text-soft)]">Exact copy and CTA will be composed locally after the visual arrives.</p></div> : visualUrl ? <div className="w-full"><canvas ref={canvasRef} className="mx-auto max-h-[70vh] max-w-full rounded-xl bg-white shadow-sm" /><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--ep-success)]"><CheckCircle2 className="h-4 w-4" />{canvasReady ? 'Advert ready' : 'Composing advert…'}</span><span className="text-xs text-[var(--ep-text-soft)]">{FORMAT_PRESETS[format].label} · {FORMAT_PRESETS[format].note}{generationId ? ` · job ${generationId.slice(0, 8)}` : ''}</span></div></div> : <div className="max-w-md text-center"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-[var(--ep-blue)] shadow-sm"><ImageIcon className="h-7 w-7" /></div><p className="mt-4 font-extrabold text-[var(--ep-navy)]">Your advert will appear here</p><p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">Generate one background visual, then refine headline, supporting copy, CTA, brand and output format instantly without another paid request.</p></div>}
        </div>
      </div>
    </section>

    <section className="ep-panel p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3"><div><p className="ep-section-label">Performance</p><h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">Connected advertising accounts</h2></div><span className="text-xs font-semibold text-[var(--ep-text-soft)]">Creation works independently of campaign sync.</span></div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon]) => <article key={label} className="ep-card p-5"><div className="flex justify-between"><p className="text-sm text-[var(--ep-text-muted)]">{label}</p><Icon className="h-4 w-4 text-[var(--ep-blue)]" /></div><p className="mt-3 text-3xl font-extrabold text-[var(--ep-navy)]">{typeof value === 'number' ? value.toLocaleString() : value}</p></article>)}</div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">{connections.map((connection) => <article key={connection.id} className="ep-card p-5"><h3 className="text-sm font-extrabold text-[var(--ep-navy)]">{connection.name}</h3><p className="text-xs text-[var(--ep-text-muted)]">{connection.provider_name} · {connection.health_status}</p><p className="mt-2 text-xs text-[var(--ep-text-soft)]">{connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : 'Never synchronized'}</p><button type="button" onClick={() => void sync(connection.id)} className="ep-button-secondary mt-4 px-3 py-2 text-xs">{busyId === connection.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Sync campaigns</button></article>)}</div>
      {connections.length === 0 && !loading && <p className="mt-4 rounded-xl border border-dashed border-[var(--ep-border)] p-6 text-center text-sm text-[var(--ep-text-muted)]">No Meta Ads or Google Ads account is connected yet. You can still create and download finished ad creative above.</p>}

      <div className="mt-6 overflow-hidden rounded-xl border border-[var(--ep-border)] bg-white"><div className="border-b border-[var(--ep-border)] px-5 py-4"><h3 className="text-sm font-extrabold text-[var(--ep-navy)]">Synchronized campaigns</h3></div>{loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[var(--ep-blue)]" /></div> : campaigns.length === 0 ? <div className="py-12 text-center"><Megaphone className="mx-auto h-8 w-8 text-[var(--ep-text-soft)]" /><p className="mt-3 text-sm text-[var(--ep-text-muted)]">No synchronized campaigns yet.</p></div> : <div className="divide-y divide-[var(--ep-border)]">{campaigns.map((campaign) => { const metric = readMetrics(campaign.metrics); return <article key={campaign.id} className="px-5 py-4"><div className="flex justify-between gap-3"><div><h3 className="text-sm font-bold text-[var(--ep-navy)]">{campaign.name}</h3><p className="text-xs text-[var(--ep-text-muted)]">{campaign.provider_name} · {campaign.connection_name} · {campaign.objective || 'No objective'}</p></div><span className="rounded-full bg-[var(--ep-page)] px-3 py-1 text-xs capitalize text-[var(--ep-text-muted)]">{campaign.status}</span></div><div className="mt-3 flex flex-wrap gap-2">{Object.entries(metric).map(([name, value]) => <span key={name} className="rounded bg-[var(--ep-page)] px-2.5 py-1 text-xs text-[var(--ep-text-muted)]">{name.replaceAll('_', ' ')}: {name === 'spend_cents' ? `$${(Number(value) / 100).toLocaleString()}` : Number(value).toLocaleString()}</span>)}</div></article>; })}</div>}</div>
    </section>
  </div>;
}
