'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useUIStore, type Theme } from '@/stores/ui.store';
import { getInitials, slugify } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  User,
  Building2,
  Bell,
  Shield,
  CreditCard,
  CheckCircle2,
  Lock,
  Smartphone,
  Palette,
  Sun,
  Moon,
  Monitor,
  Loader2,
} from 'lucide-react';

const settingsTabs = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'security', label: 'Security', icon: Shield },
] as const;

type TabId = (typeof settingsTabs)[number]['id'];

function SettingsContent() {
  const { user } = useAuthStore();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>('security');

  useEffect(() => {
    const tab = searchParams.get('tab') as TabId | null;
    if (tab && settingsTabs.some((t) => t.id === tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manage your account, organization, and application preferences.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="flex gap-1 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-brand-500/10 text-brand-400'
                  : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 rounded-xl border border-white/[0.06] bg-surface-100 p-6">
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'security' && <SecurityTab />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');

  function handleSave() {
    toast.success('Profile updated');
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Profile</h2>

      <div className="flex items-center gap-4">
        {user?.avatar ? (
          <img src={user.avatar} alt={user.name} className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/20 text-lg font-bold text-brand-400">
            {user?.name ? getInitials(user.name) : 'U'}
          </div>
        )}
        <button
          type="button"
          className="rounded-lg border border-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          Upload avatar
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Full name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Email</label>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={user?.email ?? ''}
              readOnly
              className="h-10 flex-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 text-sm text-zinc-400 outline-none"
            />
            <span className="flex items-center gap-1 rounded-full bg-brand-500/10 px-2.5 py-1 text-xs font-medium text-brand-400">
              <CheckCircle2 className="h-3 w-3" />
              Verified
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
      >
        Save changes
      </button>
    </div>
  );
}

function OrganizationTab() {
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');

  function handleNameChange(value: string) {
    setOrgName(value);
    setSlug(slugify(value));
  }

  function handleSave() {
    toast.success('Organization updated');
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Organization</h2>

      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02]">
          <Building2 className="h-6 w-6 text-zinc-500" />
        </div>
        <button
          type="button"
          className="rounded-lg border border-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
        >
          Upload logo
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Organization name</label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="My Company"
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-300">Slug</label>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="my-company"
            className="h-10 w-full rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-brand-500/50"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
      >
        Save changes
      </button>
    </div>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useUIStore();

  const themeOptions: { value: Theme; label: string; icon: typeof Sun; description: string }[] = [
    {
      value: 'light',
      label: 'Light',
      icon: Sun,
      description: 'Bright and clean interface for well-lit environments.',
    },
    {
      value: 'dark',
      label: 'Dark',
      icon: Moon,
      description: 'Easy on the eyes, ideal for low-light use.',
    },
    {
      value: 'system',
      label: 'System',
      icon: Monitor,
      description: 'Automatically matches your device settings.',
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Appearance</h2>

      <div>
        <p className="mb-3 text-sm text-zinc-400">
          Choose how EquiProfile Marketing looks on this device. Your preference is saved locally.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {themeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={`relative flex flex-col items-center gap-2 rounded-xl border p-4 transition-all ${
                theme === option.value
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
              }`}
            >
              {theme === option.value && (
                <div className="absolute right-2 top-2">
                  <CheckCircle2 className="h-4 w-4 text-brand-400" />
                </div>
              )}
              <option.icon
                className={`h-6 w-6 ${
                  theme === option.value ? 'text-brand-400' : 'text-zinc-400'
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  theme === option.value ? 'text-brand-400' : 'text-white'
                }`}
              >
                {option.label}
              </span>
              <span className="text-center text-[11px] leading-tight text-zinc-500">
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    email: true,
    campaigns: true,
    agents: false,
  });

  function toggle(key: keyof typeof prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    toast.success('Notification preferences updated');
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Notifications</h2>

      <div className="space-y-4">
        {[
          { key: 'email' as const, label: 'Email notifications', description: 'Receive email updates about your account activity.' },
          { key: 'campaigns' as const, label: 'Campaign alerts', description: 'Get notified when campaigns start, pause, or complete.' },
          { key: 'agents' as const, label: 'Agent updates', description: 'Notifications when AI agents complete tasks or need attention.' },
        ].map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"
          >
            <div>
              <p className="text-sm font-medium text-white">{item.label}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{item.description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[item.key]}
              onClick={() => toggle(item.key)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                prefs[item.key] ? 'bg-brand-500' : 'bg-zinc-600'
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  prefs[item.key] ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SecurityTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Security</h2>

      <div className="space-y-4">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-zinc-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Change password</p>
              <p className="mt-0.5 text-xs text-zinc-500">Update your account password.</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-white/[0.06] px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.04] hover:text-white"
            >
              Change
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-3">
            <Smartphone className="h-5 w-5 text-zinc-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-white">Two-factor authentication</p>
              <p className="mt-0.5 text-xs text-zinc-500">Required for every owner session. Recovery codes can be regenerated through the secured MFA API.</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400"
            >
              Required
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

function BillingTab() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Billing</h2>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-400">Current plan</p>
            <p className="mt-1 text-2xl font-bold text-white">Free</p>
          </div>
          <button
            type="button"
            className="rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-400 active:scale-[0.98]"
          >
            Upgrade
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
        <p className="text-sm text-zinc-400">Usage this month</p>
        <div className="mt-3 flex items-end gap-2">
          <span className="text-3xl font-bold text-white">0</span>
          <span className="pb-1 text-sm text-zinc-500">/ 10,000 AI tasks</span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full w-0 rounded-full bg-brand-500 transition-all" />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    }>
      <SettingsContent />
    </Suspense>
  );
}
