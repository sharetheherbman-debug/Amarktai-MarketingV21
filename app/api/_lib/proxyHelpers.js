import { NextResponse } from 'next/server';

export const MUAPI_BASE = 'https://api.muapi.ai';

/**
 * Extracts the caller-supplied MuAPI key from request headers.
 *
 * Cookie-based auth is intentionally NOT supported here: the `muapi_key`
 * cookie is set client-side without HttpOnly (it must be readable by the
 * axios interceptor), so any XSS could steal it if we treated it as a
 * trusted credential (CWE-522). Only explicit headers set by same-origin JS
 * are honored.
 *
 * @param {Request} request
 * @param {{ allowBearer?: boolean }} [options] - when true, also accepts
 *   `Authorization: Bearer <key>` (used by the creative-agent routes).
 */
export function getApiKey(request, { allowBearer = false } = {}) {
    if (allowBearer) {
        const authHeader = request.headers.get('authorization');
        if (authHeader && authHeader.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }
    }
    return request.headers.get('x-api-key') || null;
}

/**
 * Clones the inbound headers for forwarding upstream, stripping anything
 * that must never reach MuAPI: `host`/`connection` (only meaningful for the
 * hop to this server) and `cookie` (CWE-522 - cookies are not a trusted
 * credential and must not be forwarded).
 *
 * @param {Request} request
 * @param {{ stripAuthHeaders?: boolean }} [options] - when true, also drops
 *   any inbound `authorization`/`x-api-key` headers so the caller can
 *   re-apply a single validated key explicitly (used by creative-agent).
 */
export function cleanHeaders(request, { stripAuthHeaders = false } = {}) {
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('connection');
    headers.delete('cookie');
    if (stripAuthHeaders) {
        headers.delete('authorization');
        headers.delete('x-api-key');
    }
    return headers;
}

/**
 * Builds the standard set of forwarding headers for a MuAPI proxy route:
 * inbound headers cleaned of hop-by-hop/credential headers, with the
 * caller's API key (if any) applied as `x-api-key`.
 */
export function buildProxyHeaders(request, { allowBearer = false, stripAuthHeaders = false } = {}) {
    const headers = cleanHeaders(request, { stripAuthHeaders });
    const apiKey = getApiKey(request, { allowBearer });
    // NOTE: the key itself is intentionally never logged (CWE-200).
    if (apiKey) headers.set('x-api-key', apiKey);
    return headers;
}

/**
 * Performs the upstream fetch and converts the result into a NextResponse.
 *
 * On failure, the real error is logged server-side only. The response sent
 * to the client is a generic message — never `error.message`/stack — so
 * internal details (paths, upstream hostnames, library internals) can't
 * leak to callers (CWE-209, information exposure through an error message).
 *
 * @param {string} targetUrl
 * @param {RequestInit} init
 * @param {{ logLabel?: string, transform?: (data: any) => void }} [options]
 *   `transform` lets a route rewrite fields in the upstream JSON body (e.g.
 *   rewriting an S3 upload URL) before it's returned to the client.
 */
export async function proxyFetchJson(targetUrl, init, { logLabel, transform } = {}) {
    try {
        const response = await fetch(targetUrl, init);
        const data = await response.json();
        if (transform) transform(data);
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        console.error(`[proxy${logLabel ? ` ${logLabel}` : ''} ERROR] ${targetUrl}:`, error);
        return NextResponse.json({ error: 'Upstream request failed' }, { status: 500 });
    }
}

/**
 * Convenience wrapper combining `buildProxyHeaders` + `proxyFetchJson` for
 * the common case of "forward this request to MuAPI as-is".
 *
 * @param {Request} request
 * @param {string} targetUrl
 * @param {{ method: string, allowBearer?: boolean, stripAuthHeaders?: boolean, hasBody?: boolean, logLabel?: string, transform?: (data: any) => void }} options
 */
export async function proxyRequest(request, targetUrl, options) {
    const { method, allowBearer = false, stripAuthHeaders = false, hasBody = false, logLabel, transform } = options;
    const headers = buildProxyHeaders(request, { allowBearer, stripAuthHeaders });
    const init = { method, headers };
    if (hasBody) {
        init.body = await request.arrayBuffer();
    }
    return proxyFetchJson(targetUrl, init, { logLabel, transform });
}
