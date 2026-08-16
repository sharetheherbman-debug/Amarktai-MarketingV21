# GenX Media Capability Evidence

**Status date:** 2026-08-11

This document describes the current Phase 1 source, not the historical text-only GenX adapter.

## Current provider architecture

Media generation is implemented through:

- `apps/api/src/providers/genx-multimodal.provider.ts`
- `apps/api/src/services/genx-model-registry.service.ts`
- `apps/api/src/services/genx-pricing.service.ts`
- `apps/api/src/services/governed-generation.service.ts`
- `apps/api/src/workers/generation-worker.ts`
- `apps/api/src/workers/longform-still-worker.ts`

The older `genx.provider.ts` text/chat adapter is not the complete capability boundary for Studio media.

## Runtime capability rule

The Studio does **not** assume a hard-coded image/video endpoint exists.

Instead it:

1. authenticates to the configured GenX runtime;
2. loads/synchronizes the live model catalogue;
3. maps each model to supported operations;
4. requires a usable, priced model for the requested operation;
5. fails closed when pricing/model capability is stale, missing or ambiguous;
6. routes paid generation through the governed Generation Credit lifecycle.

Therefore a capability is exposed for real execution only when a compatible model is runtime-confirmed and priceable.

## Source-supported operations

The current multimodal provider and Studio orchestration support the following operation families when present in the live GenX catalogue:

- text generation;
- text-to-image;
- image/media transformations where supported by a runtime model;
- text-to-video;
- image-to-video;
- audio/voice operations where supported by a runtime model;
- long-form scene production;
- local long-form rendering/stitching with FFmpeg.

The exact model IDs are deliberately not hard-coded in this evidence document because the provider catalogue and pricing can change.

## Generation Credit governance

Paid provider execution is governed through the Generation Credit system:

`quote -> policy/approval -> reserve -> provider submission -> completion -> settle`

On provider failure the reservation is released according to the governed generation lifecycle.

Studio and long-form generation must not bypass this lifecycle.

## Cost-aware long-form production

Phase 1 includes a `quality_hybrid` long-form strategy.

- Hero, action, continuity or motion-critical scenes may use a genuine AI-video operation.
- Suitable non-motion-critical scenes may use one governed GenX image generation followed by local FFmpeg pan/zoom motion.
- The existing render worker then normalizes/stitches scene clips and can apply transitions, narration, soundtrack ducking, subtitles and final encoding locally.
- Automatic model selection excludes unpriced/stale models and prefers the lowest reservation-credit requirement compatible with the required operation unless an explicit model is selected.

This reduces unnecessary provider-video spend without forcing every scene to use still imagery.

## What is code-complete vs live-accepted

### Code-complete

- runtime catalogue discovery;
- fail-closed media capability exposure;
- governed credit reservation/settlement/release;
- asynchronous provider job tracking;
- image/video Studio orchestration;
- cost-aware hybrid long-form routing;
- local FFmpeg long-form rendering.

### Still requires controlled deployment acceptance

Do **not** claim a specific live GenX image/video/audio model is production-accepted until the deployed environment proves it using the real configured GenX account.

For each retained operation the deployment acceptance must verify:

1. live catalogue/model visibility;
2. current price quote;
3. credit reservation;
4. provider submission;
5. result retrieval;
6. output validity;
7. settlement/release correctness;
8. failure-path credit correctness.

The system must truthfully show unavailable/blocked state if the live provider cannot satisfy an operation.

## Conclusion

The historical conclusion that Studio media is necessarily preview-only is obsolete.

The current code supports real GenX multimodal execution **when the live GenX catalogue confirms a compatible priced model**. Final provider acceptance is an operational deployment gate, not something this source document fabricates.