import { MUAPI_BASE, proxyRequest } from '@/app/api/_lib/proxyHelpers';

// Build the target URL without a trailing slash when path is empty.
// e.g. GET /api/agents?is_template=true  → https://api.muapi.ai/agents?is_template=true
// e.g. GET /api/agents/by-slug/foo       → https://api.muapi.ai/agents/by-slug/foo
function buildTargetUrl(pathSegments, search) {
    const path = pathSegments.join('/');
    const base = `${MUAPI_BASE}/agents`;
    return path ? `${base}/${path}${search}` : `${base}${search}`;
}

export async function GET(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'GET', logLabel: 'agents GET' });
}

export async function POST(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'POST', hasBody: true, logLabel: 'agents POST' });
}

export async function DELETE(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'DELETE', logLabel: 'agents DELETE' });
}

export async function PUT(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = buildTargetUrl(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'PUT', hasBody: true, logLabel: 'agents PUT' });
}
