# Phase 1 Decisions Log

## Decision 1: Studio Package Location
- **Decision**: Restored to `packages/studio/` as `@amarktai/studio`
- **Rationale**: Preserves original structure; compatible with monorepo
- **Status**: COMPLETE

## Decision 2: GenX Endpoint for Media Generation
- **Decision**: GenX does NOT have confirmed media generation endpoints
- **Evidence**: `genx.provider.ts` only implements `chat/completions` and `embeddings`
- **Impact**: Text-to-Image and other media workflows will return `GENX_MODALITY_NOT_AVAILABLE`
- **Status**: HONEST_LIMITATION

## Decision 3: First Real Workflow
- **Decision**: Since GenX lacks media endpoints, no real media generation is possible
- **Alternative**: The Studio will load and display all 4 tabs with honest status labels
- **Status**: UI_OPERATIONAL / GENERATION_NOT_AVAILABLE

## Decision 4: Branding Strategy
- **Decision**: Full AmarktAI branding applied to recovered Studio
- **Changes**: Remove Muapi references, use AmarktAI colors/logo/navigation
- **Status**: COMPLETE

## Decision 5: Browser API Key Architecture
- **Decision**: Remove localStorage API key pattern; use server-side GenX only
- **Impact**: No `muapi_key` in browser; no API key input shown to users
- **Status**: COMPLETE

## Decision 6: Database Tables
- **Decision**: Create `studio_generations` table for tracking generation requests
- **Status**: COMPLETE

## Decision 7: Deployment Target
- **Decision**: Use existing Docker Compose infrastructure
- **Status**: PENDING_VERIFICATION

## Decision 8: Features Postponed
- Media generation (pending GenX support)
- Real image/video output
- File uploads to external storage
- Job polling for async media generation
