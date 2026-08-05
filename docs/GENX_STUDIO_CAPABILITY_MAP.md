# GenX Studio Capability Map

## Evidence-Based Assessment

### GenX Provider Implementation
- **File**: `apps/api/src/providers/genx.provider.ts`
- **Base URL**: `https://api.genxrouter.com/v1`
- **Auth**: Bearer token via `GENX_API_KEY`

### Confirmed Capabilities

| Capability | Status | Evidence |
|------------|--------|----------|
| Chat Completions | CONFIRMED | `POST /chat/completions` implemented in provider |
| Embeddings | CONFIRMED | `POST /embeddings` implemented in provider |
| Health Check | CONFIRMED | `GET /models` implemented |

### Unconfirmed Capabilities

| Capability | Status | Evidence |
|------------|--------|----------|
| Text-to-Image | UNCONFIRMED | No endpoint in provider; no documentation found |
| Image-to-Image | UNCONFIRMED | No endpoint in provider |
| Text-to-Video | UNCONFIRMED | No endpoint in provider |
| Image-to-Video | UNCONFIRMED | No endpoint in provider |
| Video-to-Video | UNCONFIRMED | No endpoint in provider |
| Lip Sync | UNCONFIRMED | No endpoint in provider |
| File Upload | UNCONFIRMED | No endpoint in provider |

### Decision

Since GenX only has confirmed text-based capabilities (chat, embeddings), the Creative Studio will:

1. **Text-to-Image**: Return `GENX_MODALITY_NOT_AVAILABLE` - GenX does not have a confirmed image generation endpoint
2. **Video workflows**: Return `GENX_MODALITY_NOT_AVAILABLE`
3. **Lip Sync**: Return `GENX_MODALITY_NOT_AVAILABLE`
4. **Cinema**: Return `GENX_MODALITY_NOT_AVAILABLE`

The Studio UI will display these workflows with clear "GenX mapping pending" labels.

### Original Muapi Capabilities (for reference)

The original Studio used Muapi (`https://api.muapi.ai`) which supported:
- `/api/v1/{endpoint}` - Image generation endpoints
- `/api/v1/predictions/{id}/result` - Job polling
- `/api/v1/upload_file` - File uploads

These endpoints are NOT available through GenX.

### Future Work

When GenX adds media generation endpoints:
1. Add `imageGenerate` method to `GenXProvider`
2. Update `genx-media.provider.ts` with confirmed endpoints
3. Update model catalogue
4. Enable workflows in UI
