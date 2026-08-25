import { lookup } from 'dns/promises';
import net from 'net';
import type { LookupFunction } from 'net';
import { Agent } from 'undici';
import { AppError } from '../middleware/errorHandler';
import { env } from '../config/env';

export interface SafeFetchOptions extends Omit<RequestInit, 'redirect' | 'signal'> {
  timeoutMs?: number;
  maxRedirects?: number;
  maxResponseBytes?: number;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('ff')) return true;
  if (normalized.startsWith('2001:db8')) return true;
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isPrivateIpv4(mapped[1]) : false;
}

function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

function configuredGenXOrigin(): string | null {
  try {
    return new URL(env.GENX_BASE_URL).origin;
  } catch {
    return null;
  }
}

function requestHeadersFor(current: URL, configured?: HeadersInit): Headers {
  const headers = new Headers(configured || {});
  const genxOrigin = configuredGenXOrigin();
  if (
    genxOrigin &&
    current.origin === genxOrigin &&
    env.GENX_API_KEY &&
    !headers.has('Authorization')
  ) {
    headers.set('Authorization', `Bearer ${env.GENX_API_KEY}`);
  }
  return headers;
}

export async function validatePublicHttpUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, 'Invalid external URL', 'INVALID_EXTERNAL_URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError(400, 'Only HTTP and HTTPS URLs are allowed', 'UNSAFE_EXTERNAL_URL');
  }
  if (url.username || url.password) {
    throw new AppError(400, 'Credentials in external URLs are not allowed', 'UNSAFE_EXTERNAL_URL');
  }
  // WHATWG URL implementations retain brackets around IPv6 literals in
  // `hostname`, so normalize them before applying IP safety checks.
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new AppError(400, 'Local network URLs are not allowed', 'UNSAFE_EXTERNAL_URL');
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new AppError(400, 'Private network URLs are not allowed', 'UNSAFE_EXTERNAL_URL');
    return url;
  }

  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError(400, 'External hostname could not be resolved', 'EXTERNAL_HOST_UNRESOLVED');
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new AppError(400, 'External hostname resolves to a private or unsafe address', 'UNSAFE_EXTERNAL_URL');
  }
  return url;
}

async function readLimitedBody(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new AppError(413, 'External response is too large', 'EXTERNAL_RESPONSE_TOO_LARGE');
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new AppError(413, 'External response is too large', 'EXTERNAL_RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export interface SafeFetchResponse {
  url: string;
  status: number;
  ok: boolean;
  headers: Headers;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
  bytes(): Promise<Uint8Array>;
}

export async function safeFetch(value: string, options: SafeFetchOptions = {}): Promise<SafeFetchResponse> {
  const timeoutMs = Math.max(1000, Math.min(options.timeoutMs || 20000, 120000));
  const maxRedirects = Math.max(0, Math.min(options.maxRedirects ?? 5, 10));
  const maxResponseBytes = Math.max(1024, Math.min(options.maxResponseBytes || 5 * 1024 * 1024, 25 * 1024 * 1024));
  let current = await validatePublicHttpUrl(value);
  let method = String(options.method || 'GET').toUpperCase();
  let body = options.body;

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    const pinnedAddresses = net.isIP(current.hostname)
      ? [{ address: current.hostname, family: net.isIP(current.hostname) }]
      : await lookup(current.hostname, { all: true, verbatim: true });
    if (pinnedAddresses.length === 0 || pinnedAddresses.some((entry) => isPrivateAddress(entry.address))) {
      throw new AppError(400, 'External hostname resolves to a private or unsafe address', 'UNSAFE_EXTERNAL_URL');
    }
    const pinnedLookup = ((_hostname: string, lookupOptions: Record<string, unknown>, callback: (...args: unknown[]) => void) => {
      if (lookupOptions?.all === true) callback(null, pinnedAddresses);
      else callback(null, pinnedAddresses[0].address, pinnedAddresses[0].family);
    }) as unknown as LookupFunction;
    const dispatcher = new Agent({ connect: { lookup: pinnedLookup } });
    const headers = requestHeadersFor(current, options.headers);
    let response: Response;
    try {
      response = await fetch(current, {
        ...options,
        headers,
        method,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        dispatcher,
      } as RequestInit & { dispatcher: Agent });
    } catch (error) {
      await dispatcher.close();
      throw error;
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      try {
        const location = response.headers.get('location');
        if (!location) throw new AppError(502, 'External redirect did not include a location', 'EXTERNAL_REDIRECT_INVALID');
        if (redirectCount === maxRedirects) throw new AppError(502, 'External request exceeded the redirect limit', 'EXTERNAL_REDIRECT_LIMIT');
        current = await validatePublicHttpUrl(new URL(location, current).toString());
      } finally {
        await response.body?.cancel();
        await dispatcher.close();
      }
      if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }

    let cached: Uint8Array;
    try {
      cached = await readLimitedBody(response, maxResponseBytes);
    } finally {
      await dispatcher.close();
    }
    const bytes = async () => cached;
    return {
      url: response.url || current.toString(),
      status: response.status,
      ok: response.ok,
      headers: response.headers,
      bytes,
      text: async () => new TextDecoder().decode(await bytes()),
      json: async <T>() => JSON.parse(new TextDecoder().decode(await bytes())) as T,
    };
  }
  throw new AppError(502, 'External request could not be completed', 'EXTERNAL_REQUEST_FAILED');
}
