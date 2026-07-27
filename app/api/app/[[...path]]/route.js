import { MUAPI_BASE, proxyRequest } from '@/app/api/_lib/proxyHelpers';

function targetUrlFor(pathSegments, search) {
    const path = pathSegments.join('/');
    // Handle alias: get_upload_file -> get_file_upload_url
    const effectivePath = path === 'get_upload_file' ? 'get_file_upload_url' : path;
    return { effectivePath, url: `${MUAPI_BASE}/app/${effectivePath}${search}` };
}

export async function GET(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const { effectivePath, url: targetUrl } = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, {
        method: 'GET',
        logLabel: 'app GET',
        transform: (data) => {
            // SPECIAL CASE: Intercept upload URL and redirect to local binary proxy.
            // The real S3 URL is passed through as an extra form field that our
            // binary proxy route looks for and validates before forwarding.
            if (effectivePath === 'get_file_upload_url' && data?.url) {
                const originalS3Url = data.url;
                data.url = '/api/upload-binary';
                data.fields = {
                    ...data.fields,
                    'x-proxy-target-url': originalS3Url,
                };
            }
        },
    });
}

export async function POST(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const { url: targetUrl } = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'POST', hasBody: true, logLabel: 'app POST' });
}

export async function DELETE(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const { url: targetUrl } = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'DELETE', logLabel: 'app DELETE' });
}

export async function PUT(request, { params }) {
    const slug = await params;
    const { search } = new URL(request.url);
    const { url: targetUrl } = targetUrlFor(slug.path || [], search);

    return proxyRequest(request, targetUrl, { method: 'PUT', hasBody: true, logLabel: 'app PUT' });
}
