"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Plug,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ApiResponse } from "@/types";

type Provider = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  auth_config: { fields?: string[] } | string;
  config_schema: { fields?: string[] } | string;
  capabilities: string[] | string;
};
type Connection = {
  id: string;
  name: string;
  provider_slug: string;
  provider_name: string;
  provider_category: string;
  health_status: string;
  status: string;
  error_message: string | null;
  last_sync_at: string | null;
  has_credentials: boolean;
};
type OAuthProvider = {
  platform: string;
  configured: boolean;
  reconnect_supported: boolean;
};
type SocialConnection = {
  id: string;
  platform: string;
  account_name: string | null;
  status: string;
  config?: {
    oauth?: { expires_at?: string | null; refresh_supported?: boolean };
  };
};
type StockProvider = {
  provider: string;
  state:
    "AVAILABLE" | "EXTERNAL_CONFIGURATION_REQUIRED" | "TEMPORARILY_UNAVAILABLE";
  message?: string;
};

function objectValue<T extends Record<string, unknown>>(
  value: T | string | null | undefined,
): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return {} as T;
    }
  }
  return (value || {}) as T;
}
function arrayValue(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as string[];
    } catch {
      return [];
    }
  }
  return [];
}
function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ConnectionsPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [providerSlug, setProviderSlug] = useState("");
  const [name, setName] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<OAuthProvider[]>([]);
  const [socialConnections, setSocialConnections] = useState<
    SocialConnection[]
  >([]);
  const [stockProviders, setStockProviders] = useState<StockProvider[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        providerResponse,
        connectionResponse,
        oauthResponse,
        socialResponse,
        stockResponse,
      ] = await Promise.all([
        api.get<ApiResponse<Provider[]>>("/integrations/providers", {
          params: category !== "all" ? { category } : {},
        }),
        api.get<ApiResponse<Connection[]>>("/integrations/connections"),
        api.get<ApiResponse<OAuthProvider[]>>("/amai/social/oauth/providers"),
        api.get<ApiResponse<SocialConnection[]>>("/amai/social/connections"),
        api.get<ApiResponse<StockProvider[]>>("/library/stock/providers"),
      ]);
      setProviders(providerResponse.data || []);
      setConnections(connectionResponse.data || []);
      setOauthProviders(oauthResponse.data || []);
      setSocialConnections(socialResponse.data || []);
      setStockProviders(stockResponse.data || []);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Connections could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [category]);
  useEffect(() => {
    void load();
  }, [load]);
  const provider = useMemo(
    () => providers.find((item) => item.slug === providerSlug),
    [providers, providerSlug],
  );
  const credentialFields = objectValue(provider?.auth_config).fields || [];
  const configFields = objectValue(provider?.config_schema).fields || [];
  const categories = [
    "all",
    ...Array.from(new Set(providers.map((item) => item.category))),
  ];
  const reset = () => {
    setProviderSlug("");
    setName("");
    setCredentials({});
    setConfig({});
    setEditingId(null);
  };
  const parsedValue = (field: string, value: string): unknown => {
    if (["headers", "metric_map"].includes(field)) {
      try {
        return value.trim() ? JSON.parse(value) : {};
      } catch {
        throw new Error(`${label(field)} must be valid JSON.`);
      }
    }
    return value;
  };

  const save = async () => {
    if (!providerSlug || !name.trim()) return;
    setBusy("save");
    setError(null);
    try {
      const parsedCredentials = Object.fromEntries(
        Object.entries(credentials).map(([key, value]) => [
          key,
          parsedValue(key, value),
        ]),
      );
      const parsedConfig = Object.fromEntries(
        Object.entries(config).map(([key, value]) => [
          key,
          parsedValue(key, value),
        ]),
      );
      const request = {
        body: {
          provider_slug: providerSlug,
          name: name.trim(),
          credentials: parsedCredentials,
          config: parsedConfig,
        },
      };
      const response = editingId
        ? await api.put<ApiResponse<Connection>>(
            `/integrations/connections/${editingId}`,
            request,
          )
        : await api.post<ApiResponse<Connection>>(
            "/integrations/connections",
            request,
          );
      const id = response.data?.id || editingId;
      if (id)
        await api.post(`/integrations/connections/${id}/test`, { body: {} });
      setShowForm(false);
      reset();
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The service could not be connected.",
      );
    } finally {
      setBusy(null);
    }
  };
  const run = async (connection: Connection, action: "test" | "sync") => {
    setBusy(connection.id);
    setError(null);
    try {
      const endpoint =
        action === "test"
          ? `/integrations/connections/${connection.id}/test`
          : connection.provider_category === "advertising"
            ? `/integrations/advertising/connections/${connection.id}/sync`
            : `/integrations/analytics/connections/${connection.id}/sync`;
      await api.post(endpoint, { body: {} });
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : `${label(action)} failed.`,
      );
    } finally {
      setBusy(null);
    }
  };
  const remove = async (connection: Connection) => {
    if (
      !confirm(
        `Remove ${connection.name}? Synchronized connection data may also be removed.`,
      )
    )
      return;
    setBusy(connection.id);
    try {
      await api.delete(`/integrations/connections/${connection.id}`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The connection could not be removed.",
      );
    } finally {
      setBusy(null);
    }
  };
  const startOauth = async (platform: string) => {
    setBusy(`oauth:${platform}`);
    setError(null);
    try {
      const response = await api.post<
        ApiResponse<{ authorization_url: string }>
      >(`/amai/social/oauth/${platform}/start`, { body: {} });
      sessionStorage.setItem("marketing_oauth_platform", platform);
      window.location.assign(response.data.authorization_url);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "This provider could not start OAuth.",
      );
      setBusy(null);
    }
  };
  const removeSocial = async (connection: SocialConnection) => {
    if (!confirm(`Remove ${connection.account_name || connection.platform}?`))
      return;
    setBusy(connection.id);
    try {
      await api.delete(`/amai/social/connections/${connection.id}`);
      await load();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The social account could not be removed.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="ep-panel p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="ep-section-label">Connections</p>
            <h1 className="ep-page-title mt-2">
              Connect the channels and measurement services your marketing uses.
            </h1>
            <p className="ep-page-copy mt-3 text-sm leading-6 sm:text-base">
              Manage publishing, analytics, CRM and read/sync advertising
              connections from one canonical workspace. Saved credentials remain
              write-only.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              reset();
              setShowForm(true);
            }}
            className="ep-button-primary shrink-0 px-4 py-2.5 text-sm"
          >
            <Plus className="h-4 w-4" /> Add connection
          </button>
        </div>
      </header>
      {error && (
        <div className="ep-status-danger flex items-start gap-3 rounded-xl border px-4 py-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {showForm && (
        <section className="ep-card p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="ep-section-label">
                {editingId ? "Reconnect service" : "New connection"}
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">
                Choose a service and enter its connection details
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                reset();
              }}
              className="rounded-lg p-2 text-[var(--ep-text-muted)] hover:bg-[var(--ep-surface-subtle)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-xs font-extrabold text-[var(--ep-text-muted)]">
              Service
              <select
                value={providerSlug}
                onChange={(event) => {
                  setProviderSlug(event.target.value);
                  setCredentials({});
                  setConfig({});
                }}
                className="ep-input mt-2 min-h-11 px-3 text-sm font-normal"
              >
                <option value="">Select service</option>
                {providers.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name} · {label(item.category)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-extrabold text-[var(--ep-text-muted)]">
              Connection name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Main business account"
                className="ep-input mt-2 min-h-11 px-3 text-sm font-normal"
              />
            </label>
            {credentialFields.map((field) => (
              <label
                key={field}
                className="text-xs font-extrabold text-[var(--ep-text-muted)]"
              >
                {label(field)}
                {field === "headers" ? (
                  <textarea
                    rows={4}
                    value={credentials[field] || ""}
                    onChange={(event) =>
                      setCredentials((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    placeholder='{"Authorization":"Bearer …"}'
                    className="ep-input mt-2 p-3 font-mono text-xs font-normal"
                  />
                ) : (
                  <input
                    type={
                      field.includes("token") ||
                      field.includes("key") ||
                      field.includes("secret")
                        ? "password"
                        : "text"
                    }
                    value={credentials[field] || ""}
                    onChange={(event) =>
                      setCredentials((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    className="ep-input mt-2 min-h-11 px-3 text-sm font-normal"
                  />
                )}
              </label>
            ))}
            {configFields.map((field) => (
              <label
                key={field}
                className="text-xs font-extrabold text-[var(--ep-text-muted)]"
              >
                {label(field)}
                {field === "metric_map" ? (
                  <textarea
                    rows={4}
                    value={config[field] || ""}
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    className="ep-input mt-2 p-3 font-mono text-xs font-normal"
                  />
                ) : (
                  <input
                    value={config[field] || ""}
                    onChange={(event) =>
                      setConfig((current) => ({
                        ...current,
                        [field]: event.target.value,
                      }))
                    }
                    className="ep-input mt-2 min-h-11 px-3 text-sm font-normal"
                  />
                )}
              </label>
            ))}
          </div>
          {provider?.description && (
            <p className="mt-4 text-sm leading-6 text-[var(--ep-text-muted)]">
              {provider.description}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={!providerSlug || !name.trim() || busy === "save"}
              className="ep-button-primary px-4 py-2.5 text-sm"
            >
              {busy === "save" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plug className="h-4 w-4" />
              )}{" "}
              Save & test
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                reset();
              }}
              className="ep-button-secondary px-4 py-2.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <section className="ep-card p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="ep-section-label">Licensed media</p>
            <h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">
              Stock provider status
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">
              Available providers can be searched from the Marketing Library.
              Optional providers that are not configured do not block the rest
              of Marketing.
            </p>
          </div>
          <Link href="/library" className="ep-button-secondary shrink-0 px-3 py-2 text-xs">
            Open stock search
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {stockProviders
            .filter((item) => ["pexels", "pixabay", "unsplash", "openverse"].includes(item.provider))
            .map((item) => {
              const available = item.state === "AVAILABLE";
              return (
                <article key={item.provider} className="rounded-xl border border-[var(--ep-border)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-extrabold text-[var(--ep-navy)]">{label(item.provider)}</p>
                    <span className={`${available ? "ep-status-success" : "ep-status-warning"} rounded-full border px-2 py-1 text-[10px] font-extrabold`}>
                      {available ? "Connected" : "Not configured"}
                    </span>
                  </div>
                  {item.message && <p className="mt-2 text-xs leading-5 text-[var(--ep-text-muted)]">{item.message}</p>}
                </article>
              );
            })}
        </div>
      </section>

      <section className="ep-card p-5 sm:p-6">
        <p className="ep-section-label">Social publishing accounts</p>
        <h2 className="mt-1 text-lg font-extrabold text-[var(--ep-navy)]">
          Connect through the provider
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--ep-text-muted)]">
          OAuth is shown only when the deployment has a real provider
          application configured. Otherwise Marketing truthfully keeps the
          documented manual credential path available.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {oauthProviders.map((provider) => (
            <article
              key={provider.platform}
              className="rounded-xl border border-[var(--ep-border)] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-extrabold text-[var(--ep-navy)]">
                    {label(provider.platform)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ep-text-muted)]">
                    {provider.configured
                      ? "Secure OAuth connection available"
                      : "Provider app not configured"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!provider.configured || busy !== null}
                  onClick={() => void startOauth(provider.platform)}
                  className="ep-button-secondary px-3 py-2 text-xs"
                >
                  {busy === `oauth:${provider.platform}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plug className="h-3.5 w-3.5" />
                  )}
                  {provider.configured ? "Connect" : "Unavailable"}
                </button>
              </div>
            </article>
          ))}
        </div>
        {socialConnections.length > 0 && (
          <div className="mt-5 space-y-2">
            {socialConnections.map((connection) => (
              <div
                key={connection.id}
                className="flex items-center justify-between rounded-xl bg-[var(--ep-surface-subtle)] p-4"
              >
                <div>
                  <p className="text-sm font-extrabold text-[var(--ep-navy)]">
                    {connection.account_name || label(connection.platform)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ep-text-muted)]">
                    {label(connection.platform)} · {connection.status}
                    {connection.config?.oauth?.expires_at
                      ? ` · token expires ${new Date(connection.config.oauth.expires_at).toLocaleString()}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${connection.account_name || connection.platform}`}
                  onClick={() => void removeSocial(connection)}
                  className="rounded-lg p-2 text-[var(--ep-text-soft)] hover:text-[var(--ep-danger)]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setCategory(item)}
            className={
              category === item
                ? "rounded-full bg-[var(--ep-navy)] px-3 py-1.5 text-xs font-bold text-white"
                : "rounded-full border border-[var(--ep-border)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--ep-text-muted)] hover:bg-[var(--ep-blue-soft)]"
            }
          >
            {item === "all" ? "All services" : label(item)}
          </button>
        ))}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-[var(--ep-navy)]">
            Connected services
          </h2>
          <button
            type="button"
            onClick={() => void load()}
            className="ep-button-secondary px-3 py-2 text-xs"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
        {loading ? (
          <div className="ep-card flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--ep-blue)]" />
          </div>
        ) : connections.length === 0 ? (
          <div className="ep-card py-14 text-center">
            <Plug className="mx-auto h-8 w-8 text-[var(--ep-text-soft)]" />
            <p className="mt-3 text-sm font-semibold text-[var(--ep-text-muted)]">
              No services connected yet.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {connections.map((connection) => {
              const healthy =
                connection.health_status === "healthy" &&
                connection.status !== "error";
              return (
                <article key={connection.id} className="ep-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-extrabold text-[var(--ep-navy)]">
                        {connection.name}
                      </h3>
                      <p className="mt-1 text-xs text-[var(--ep-text-muted)]">
                        {connection.provider_name} ·{" "}
                        {label(connection.provider_category)}
                      </p>
                    </div>
                    <span
                      className={`${healthy ? "ep-status-success" : "ep-status-warning"} inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-extrabold`}
                    >
                      {healthy && <CheckCircle2 className="h-3 w-3" />}
                      {connection.health_status || connection.status}
                    </span>
                  </div>
                  {connection.error_message && (
                    <p className="mt-3 text-xs font-bold text-[var(--ep-danger)]">
                      This connection needs attention. Test it again or
                      reconnect the service.
                    </p>
                  )}
                  <p className="mt-4 text-xs text-[var(--ep-text-soft)]">
                    {connection.last_sync_at
                      ? `Last sync ${new Date(connection.last_sync_at).toLocaleString()}`
                      : "Not synchronized yet"}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void run(connection, "test")}
                      disabled={busy === connection.id}
                      className="ep-button-secondary px-2.5 py-1.5 text-xs"
                    >
                      {busy === connection.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}{" "}
                      Test
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(connection.id);
                        setProviderSlug(connection.provider_slug);
                        setName(connection.name);
                        setCredentials({});
                        setConfig({});
                        setShowForm(true);
                      }}
                      className="ep-button-secondary px-2.5 py-1.5 text-xs"
                    >
                      Reconnect
                    </button>
                    {["analytics", "advertising"].includes(
                      connection.provider_category,
                    ) && (
                      <button
                        type="button"
                        onClick={() => void run(connection, "sync")}
                        disabled={busy === connection.id}
                        className="ep-button-primary px-2.5 py-1.5 text-xs"
                      >
                        Sync now
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={`Remove ${connection.name}`}
                      onClick={() => void remove(connection)}
                      className="ml-auto rounded-lg p-2 text-[var(--ep-text-soft)] hover:bg-[var(--ep-danger-soft)] hover:text-[var(--ep-danger)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold text-[var(--ep-navy)]">
          Available services
        </h2>
        {providers.length === 0 ? (
          <div className="ep-card py-12 text-center text-sm text-[var(--ep-text-muted)]">
            No services are currently available for this workspace.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {providers.map((item) => (
              <article key={item.id} className="ep-card p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-[var(--ep-blue-soft)] p-2.5 text-[var(--ep-blue)]">
                    <Plug className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-[var(--ep-navy)]">
                      {item.name}
                    </h3>
                    <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--ep-text-soft)]">
                      {label(item.category)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-5 text-[var(--ep-text-muted)]">
                  {item.description ||
                    "Connect this service to make its supported marketing capabilities available in your workspace."}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {arrayValue(item.capabilities).map((capability) => (
                    <span
                      key={capability}
                      className="rounded-full bg-[var(--ep-surface-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--ep-text-muted)]"
                    >
                      {label(capability)}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
