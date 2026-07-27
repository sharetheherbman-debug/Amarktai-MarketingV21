import { MUAPI_BASE, proxyRequest } from '@/app/api/_lib/proxyHelpers';

// Proxies /api/api/v1/* -> https://api.muapi.ai/api/v1/*
// This is required because the AiAgent library hardcodes a double /api/api
function targetUrlFor(pathSegments, search) {
    const path = pathSegments.join('/');
    return `${MUAPI_BASE}/api/v1/${path}${search}`;
}

export async function GET(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'GET', logLabel: 'api/v1 GET' });
}

export async function POST(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'POST', hasBody: true, logLabel: 'api/v1 POST' });
}
