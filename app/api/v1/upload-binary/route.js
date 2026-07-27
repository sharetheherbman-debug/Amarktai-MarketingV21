import { handleUploadBinaryProxy } from '@/app/api/_lib/uploadBinaryHandler';

export async function POST(request) {
    return handleUploadBinaryProxy(request);
}
