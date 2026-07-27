import { MUAPI_BASE, proxyRequest } from '@/app/api/_lib/proxyHelpers';

function targetUrlFor(pathSegments, search) {
    const path = pathSegments.join('/');
    return `${MUAPI_BASE}/workflow/${path}${search}`;
}

export async function GET(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'GET', logLabel: 'workflow GET' });
}

export async function POST(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'POST', hasBody: true, logLabel: 'workflow POST' });
}

export async function DELETE(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'DELETE', logLabel: 'workflow DELETE' });
}

export async function PUT(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const targetUrl = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'PUT', hasBody: true, logLabel: 'workflow PUT' });
}
