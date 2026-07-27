import { MUAPI_BASE, proxyRequest } from '@/app/api/_lib/proxyHelpers';

export async function GET(request) {
    const { search } = new URL(request.url);
    const targetUrl = `${MUAPI_BASE}/app/get_file_upload_url${search}`;

    return proxyRequest(request, targetUrl, { method: 'GET', logLabel: 'get_upload_url GET' });
}
