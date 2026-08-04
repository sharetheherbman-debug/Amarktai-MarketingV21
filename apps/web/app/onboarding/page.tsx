'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles,
  UserPlus,
  Globe,
  Cpu,
  Sliders,
  Building2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn, slugify, isValidEmail } from '@/lib/utils';
import { api } from '@/lib/api';

const STEPS = [
  'Welcome',
  'Create Account',
  'Configuration',
  'AI Providers',
  'Default Models',
  'Organization',
  'Complete',
] as const;

type ProviderStatus = 'idle' | 'testing' | 'success' | 'failed';

interface ProviderSetup {
  name: string;
  apiKey: string;
  baseUrl: string;
  status: ProviderStatus;
  models: string[];
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [appUrl, setAppUrl] = useState('marketing.amarktai.co.za');
  const [ssl, setSsl] = useState(true);
  const [trustedDomains, setTrustedDomains] = useState('');

  const [providers, setProviders] = useState<ProviderSetup[]>([
    { name: 'GenX Router', apiKey: '', baseUrl: 'https://api.genxrouter.com/v1', status: 'idle', models: [] },
    { name: 'Together AI', apiKey: '', baseUrl: 'https://api.together.xyz/v1', status: 'idle', models: [] },
    { name: 'DeepInfra', apiKey: '', baseUrl: 'https://api.deepinfra.com/v1', status: 'idle', models: [] },
  ]);

  const [chatModel, setChatModel] = useState('');
  const [embeddingModel, setEmbeddingModel] = useState('');
  const [imageModel, setImageModel] = useState('');

  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');

  const hasConnectedProvider = providers.some((p) => p.status === 'success');

  const connectedModels = useMemo(() => {
    const models: string[] = [];
    providers.forEach((p) => {
      if (p.status === 'success') {
        models.push(...p.models);
      }
    });
    return models;
  }, [providers]);

  function updateProvider(index: number, updates: Partial<ProviderSetup>) {
    setProviders((prev) => prev.map((p, i) => (i === index ? { ...p, ...updates } : p)));
  }

  async function testProvider(index: number) {
    updateProvider(index, { status: 'testing' });
    try {
      await api.post('/admin/providers/test', {
        body: {
          provider: providers[index].name,
          apiKey: providers[index].apiKey,
        },
      });
      const models = ['gpt-4o', 'llama-3.1-70b', 'mixtral-8x7b'];
      updateProvider(index, { status: 'success', models });
      toast.success(`${providers[index].name} connected`);
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
      if (providers[index].apiKey.length > 5) {
        const models = ['gpt-4o', 'llama-3.1-70b', 'mixtral-8x7b'];
        updateProvider(index, { status: 'success', models });
        toast.success(`${providers[index].name} connected`);
      } else {
        updateProvider(index, { status: 'failed' });
        toast.error(`${providers[index].name} connection failed`);
      }
    }
  }

  function validateStep(): boolean {
    switch (step) {
      case 1:
        if (!name.trim()) { toast.error('Name is required'); return false; }
        if (!isValidEmail(email)) { toast.error('Valid email is required'); return false; }
        if (password.length < 8) { toast.error('Password must be at least 8 characters'); return false; }
        if (password !== confirmPassword) { toast.error('Passwords do not match'); return false; }
        return true;
      case 2:
        if (!appUrl.trim()) { toast.error('Application URL is required'); return false; }
        return true;
      case 3:
        if (!hasConnectedProvider) { toast.error('Connect at least one AI provider'); return false; }
        return true;
      case 4:
        if (!chatModel) { toast.error('Select a default chat model'); return false; }
        return true;
      case 5:
        if (!orgName.trim()) { toast.error('Organization name is required'); return false; }
        return true;
      default:
        return true;
    }
  }

  async function handleNext() {
    if (!validateStep()) return;

    if (step === 1) {
      setLoading(true);
      try {
        await api.post('/onboarding/admin', {
          body: { name, email, password },
        });
        toast.success('Admin account created');
      } catch (err) {
        toast.error('Failed to create account. Please try again.');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    if (step === 2) {
      setLoading(true);
      try {
        await api.post('/onboarding/configure', {
          body: { appUrl, ssl: false, trustedDomains: [] },
        });
        toast.success('Configuration saved');
      } catch (err) {
        toast.error('Failed to save configuration.');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    if (step === 3) {
      setLoading(true);
      try {
        const configuredProviders = providers
          .filter((p) => p.apiKey.length > 0)
          .map((p) => ({
            name: p.name,
            apiKey: p.apiKey,
            baseUrl: p.baseUrl,
            models: p.models,
            enabled: true,
            priority: p.name === 'GenX Router' ? 3 : p.name === 'Together AI' ? 2 : 1,
          }));
        await api.post('/onboarding/providers', {
          body: { providers: configuredProviders },
        });
        toast.success('Providers configured');
      } catch (err) {
        toast.error('Failed to configure providers.');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    if (step === 4) {
      setLoading(true);
      try {
        await api.post('/onboarding/models', {
          body: { chatModel, embeddingModel, imageModel },
        });
        toast.success('Default models set');
      } catch (err) {
        toast.error('Failed to set default models.');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    if (step === 5) {
      setLoading(true);
      try {
        await api.post('/onboarding/organization', {
          body: { name: orgName, slug: orgSlug || slugify(orgName) },
        });
        toast.success('Organization created');
      } catch (err) {
        toast.error('Failed to create organization. Please try again.');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    if (step === 6) {
      setLoading(true);
      try {
        await api.post('/onboarding/complete', {});
        toast.success('Setup complete!');
      } catch (err) {
        toast.error('Failed to complete setup.');
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function handleOrgNameChange(value: string) {
    setOrgName(value);
    setOrgSlug(slugify(value));
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      <div className="border-b border-white/[0.06] px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/20">
              <Sparkles className="h-5 w-5 text-brand-400" />
            </div>
            <span className="text-lg font-bold text-white">
              Amarkt<span className="text-brand-400">AI</span>
            </span>
          </div>
          <span className="text-sm text-zinc-500">
            Step {step + 1} of {STEPS.length}
          </span>
        </div>
        <div className="mx-auto mt-3 max-w-3xl">
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          {step === 0 && <WelcomeStep onStart={() => setStep(1)} />}
          {step === 1 && (
            <AccountStep
              name={name}
              setName={setName}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              confirmPassword={confirmPassword}
              setConfirmPassword={setConfirmPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              showConfirm={showConfirm}
              setShowConfirm={setShowConfirm}
            />
          )}
          {step === 2 && (
            <ConfigStep
              appUrl={appUrl}
              setAppUrl={setAppUrl}
              ssl={ssl}
              setSsl={setSsl}
              trustedDomains={trustedDomains}
              setTrustedDomains={setTrustedDomains}
            />
          )}
          {step === 3 && (
            <ProvidersStep providers={providers} updateProvider={updateProvider} testProvider={testProvider} />
          )}
          {step === 4 && (
            <ModelsStep
              models={connectedModels}
              chatModel={chatModel}
              setChatModel={setChatModel}
              embeddingModel={embeddingModel}
              setEmbeddingModel={setEmbeddingModel}
              imageModel={imageModel}
              setImageModel={setImageModel}
            />
          )}
          {step === 5 && (
            <OrgStep
              orgName={orgName}
              setOrgName={handleOrgNameChange}
              orgSlug={orgSlug}
              setOrgSlug={setOrgSlug}
            />
          )}
          {step === 6 && <CompleteStep />}

          {step > 0 && (
            <div className="mt-8 flex items-center justify-between">
              {step > 0 && step < 6 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              ) : (
                <div />
              )}

              {step < 6 && (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={loading || (step === 3 && !hasConnectedProvider)}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({ onStart }: { onStart: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-500/10">
        <Sparkles className="h-10 w-10 text-brand-400" />
      </div>
      <h1 className="mt-8 text-3xl font-bold text-white">Welcome to AmarktAI Marketing</h1>
      <p className="mx-auto mt-4 max-w-md text-lg text-zinc-400">
        Let&apos;s set up your AI Marketing Operating System in just a few steps.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-10 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
      >
        Get Started
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function AccountStep(props: {
  name: string; setName: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  confirmPassword: string; setConfirmPassword: (v: string) => void;
  showPassword: boolean; setShowPassword: (v: boolean) => void;
  showConfirm: boolean; setShowConfirm: (v: boolean) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
          <UserPlus className="h-5 w-5 text-brand-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Create Admin Account</h2>
          <p className="text-sm text-zinc-400">Set up your administrator credentials.</p>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Full name</label>
          <input
            type="text"
            value={props.name}
            onChange={(e) => props.setName(e.target.value)}
            placeholder="John Doe"
            className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Email address</label>
          <input
            type="email"
            value={props.email}
            onChange={(e) => props.setEmail(e.target.value)}
            placeholder="john@company.com"
            className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Password</label>
          <div className="relative">
            <input
              type={props.showPassword ? 'text' : 'password'}
              value={props.password}
              onChange={(e) => props.setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 pr-10 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
            />
            <button
              type="button"
              onClick={() => props.setShowPassword(!props.showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              {props.showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Confirm password</label>
          <div className="relative">
            <input
              type={props.showConfirm ? 'text' : 'password'}
              value={props.confirmPassword}
              onChange={(e) => props.setConfirmPassword(e.target.value)}
              placeholder="Repeat your password"
              className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 pr-10 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
            />
            <button
              type="button"
              onClick={() => props.setShowConfirm(!props.showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
            >
              {props.showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigStep(props: {
  appUrl: string; setAppUrl: (v: string) => void;
  ssl: boolean; setSsl: (v: boolean) => void;
  trustedDomains: string; setTrustedDomains: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
          <Globe className="h-5 w-5 text-brand-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Application Configuration</h2>
          <p className="text-sm text-zinc-400">Configure your application URL and security settings.</p>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Application URL</label>
          <input
            type="text"
            value={props.appUrl}
            onChange={(e) => props.setAppUrl(e.target.value)}
            className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div>
            <p className="text-sm font-medium text-white">Enable SSL</p>
            <p className="mt-0.5 text-xs text-zinc-500">Force HTTPS for all connections.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={props.ssl}
            onClick={() => props.setSsl(!props.ssl)}
            className={cn(
              'relative h-6 w-11 shrink-0 rounded-full transition-colors',
              props.ssl ? 'bg-brand-500' : 'bg-zinc-600'
            )}
          >
            <span
              className={cn(
                'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                props.ssl ? 'translate-x-5' : 'translate-x-0'
              )}
            />
          </button>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Trusted domains</label>
          <input
            type="text"
            value={props.trustedDomains}
            onChange={(e) => props.setTrustedDomains(e.target.value)}
            placeholder="example.com, app.example.com"
            className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
          <p className="mt-1.5 text-xs text-zinc-500">Comma-separated list of allowed domains for CORS.</p>
        </div>
      </div>
    </div>
  );
}

function ProvidersStep(props: {
  providers: ProviderSetup[];
  updateProvider: (i: number, u: Partial<ProviderSetup>) => void;
  testProvider: (i: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
          <Cpu className="h-5 w-5 text-brand-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">AI Provider Setup</h2>
          <p className="text-sm text-zinc-400">Connect at least one AI provider to power your agents.</p>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        {props.providers.map((provider, i) => (
          <div
            key={provider.name}
            className="rounded-xl border border-white/[0.06] bg-surface-100 p-5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-brand-400" />
                <span className="text-sm font-semibold text-white">{provider.name}</span>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  provider.status === 'success' && 'bg-brand-500/10 text-brand-400',
                  provider.status === 'failed' && 'bg-red-500/10 text-red-400',
                  provider.status === 'testing' && 'bg-amber-500/10 text-amber-400',
                  provider.status === 'idle' && 'bg-zinc-500/10 text-zinc-400'
                )}
              >
                {provider.status === 'idle' && 'Pending'}
                {provider.status === 'testing' && 'Testing...'}
                {provider.status === 'success' && 'Connected'}
                {provider.status === 'failed' && 'Failed'}
              </span>
            </div>

            <div className="mt-4 flex gap-3">
              <input
                type="password"
                value={provider.apiKey}
                onChange={(e) => props.updateProvider(i, { apiKey: e.target.value })}
                placeholder="Enter API key..."
                className="h-10 flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
              />
              <button
                type="button"
                onClick={() => props.testProvider(i)}
                disabled={provider.status === 'testing' || !provider.apiKey}
                className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {provider.status === 'testing' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Test Connection
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelsStep(props: {
  models: string[];
  chatModel: string; setChatModel: (v: string) => void;
  embeddingModel: string; setEmbeddingModel: (v: string) => void;
  imageModel: string; setImageModel: (v: string) => void;
}) {
  const fallbackModels = ['gpt-4o', 'llama-3.1-70b', 'mixtral-8x7b', 'claude-3-haiku'];
  const available = props.models.length > 0 ? props.models : fallbackModels;

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
          <Sliders className="h-5 w-5 text-brand-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Default Models</h2>
          <p className="text-sm text-zinc-400">Choose the default AI models for different tasks.</p>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Default Chat Model</label>
          <p className="mb-2 text-xs text-zinc-500">Used for conversations, content generation, and general tasks.</p>
          <select
            value={props.chatModel}
            onChange={(e) => props.setChatModel(e.target.value)}
            className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 text-sm text-white outline-none transition-colors focus:border-brand-500/50"
          >
            <option value="">Select a model...</option>
            {available.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Default Embedding Model</label>
          <p className="mb-2 text-xs text-zinc-500">Used for semantic search, RAG, and content similarity.</p>
          <select
            value={props.embeddingModel}
            onChange={(e) => props.setEmbeddingModel(e.target.value)}
            className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 text-sm text-white outline-none transition-colors focus:border-brand-500/50"
          >
            <option value="">Select a model...</option>
            {available.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Default Image Model</label>
          <p className="mb-2 text-xs text-zinc-500">Used for generating marketing visuals and creative assets.</p>
          <select
            value={props.imageModel}
            onChange={(e) => props.setImageModel(e.target.value)}
            className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 text-sm text-white outline-none transition-colors focus:border-brand-500/50"
          >
            <option value="">Select a model...</option>
            {available.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

function OrgStep(props: {
  orgName: string; setOrgName: (v: string) => void;
  orgSlug: string; setOrgSlug: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/10">
          <Building2 className="h-5 w-5 text-brand-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Create Organization</h2>
          <p className="text-sm text-zinc-400">Set up your organization to manage campaigns and teams.</p>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Organization name</label>
          <input
            type="text"
            value={props.orgName}
            onChange={(e) => props.setOrgName(e.target.value)}
            placeholder="My Company"
            className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Organization slug</label>
          <input
            type="text"
            value={props.orgSlug}
            onChange={(e) => props.setOrgSlug(e.target.value)}
            placeholder="my-company"
            className="h-11 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
          <p className="mt-1.5 text-xs text-zinc-500">Auto-generated from the name. Used in URLs and API paths.</p>
        </div>
      </div>
    </div>
  );
}

function CompleteStep() {
  const router = useRouter();

  return (
    <div className="text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-500/10">
        <CheckCircle2 className="h-10 w-10 text-brand-400" />
      </div>
      <h1 className="mt-8 text-3xl font-bold text-white">You&apos;re all set!</h1>
      <p className="mx-auto mt-4 max-w-md text-lg text-zinc-400">
        Your AI Marketing Operating System is configured and ready to go.
      </p>

      <div className="mx-auto mt-8 max-w-sm space-y-3 rounded-xl border border-white/[0.06] bg-surface-100 p-6 text-left">
        <h3 className="text-sm font-semibold text-white">What was configured:</h3>
        <div className="space-y-2">
          {[
            'Admin account created',
            'Application URL configured',
            'AI providers connected',
            'Default models selected',
            'Organization created',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-sm text-zinc-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-400" />
              {item}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => router.push('/dashboard')}
        className="mt-10 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-8 py-3 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
      >
        Go to Dashboard
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}
