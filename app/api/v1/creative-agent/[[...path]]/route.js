import { MUAPI_BASE, proxyRequest } from '@/app/api/_lib/proxyHelpers';

function targetUrlFor(pathSegments, search) {
    const path = pathSegments.join('/');
    return `${MUAPI_BASE}/api/v1/creative-agent/${path}${search}`;
}

const AUTH_OPTIONS = { allowBearer: true, stripAuthHeaders: true };

export async function GET(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'GET', ...AUTH_OPTIONS, logLabel: 'creative-agent GET' });
}

export async function POST(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'POST', hasBody: true, ...AUTH_OPTIONS, logLabel: 'creative-agent POST' });
}

export async function PATCH(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'PATCH', hasBody: true, ...AUTH_OPTIONS, logLabel: 'creative-agent PATCH' });
}

export async function DELETE(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'DELETE', ...AUTH_OPTIONS, logLabel: 'creative-agent DELETE' });
}
