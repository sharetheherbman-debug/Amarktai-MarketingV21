# GenX Studio Capability Map

**Status date:** 2026-08-11

## Launch principle

EquiProfile Marketing exposes only capabilities that can be satisfied by the live GenX runtime and the local production stack. There are no launch promises based purely on historical endpoint names.

A media workflow is executable only when:

- the live GenX catalogue contains a compatible model/operation;
- the model is available and runtime-confirmed according to current policy;
- current pricing can be quoted safely;
- Generation Credit controls authorize and reserve the work;
- the relevant worker/render path is available.

If any required condition is missing, the workflow must fail closed and report an unavailable/blocked state rather than fake success.

## Current Studio capability map

| Capability | Code state | Live release gate |
|---|---|---|
| Text/content generation | Implemented and governed | Confirm real GenX text execution and settlement |
| Text-to-image / image advert assets | Implemented through runtime-confirmed multimodal models | Confirm at least one priced live image model and output quality |
| Image/media transformations | Operation-driven where supported by the live model catalogue | Confirm only the transformations retained for launch |
| Text-to-video | Implemented through runtime-confirmed multimodal models | Confirm at least one priced live video model and output quality |
| Image-to-video | Implemented where the live model advertises the operation | Confirm live operation/model mapping |
| Audio/voice | Operation-driven where the live model catalogue supports it | Confirm retained live voice/audio operation(s) |
| Long-form video | Implemented as governed scene production plus local FFmpeg rendering | Confirm mixed-scene production, narration/music/subtitles and final render |
| Hybrid still-motion long-form | Implemented | Confirm image generation plus local motion clip path and cost evidence |
| Cinema/long-form stitching | Implemented locally with FFmpeg | Confirm deployed render worker and storage paths |

## Image adverts

Campaign production can request image assets from approved campaign briefs. Studio media execution uses the live GenX model registry rather than an unverified hard-coded image endpoint.

Release acceptance should prove an actual advert workflow end to end:

`approved campaign brief -> image request -> price/credit reservation -> GenX image -> stored Studio asset -> owner review/approval`

No fake image generation or placeholder advert should be treated as acceptance.

## Long-form video economics

The default long-form strategy is `quality_hybrid` rather than “generate every scene as premium AI video”.

Scene routing can use:

- genuine AI video for hero/action/continuity/motion-critical scenes;
- one governed image generation plus local FFmpeg motion for suitable scenes;
- explicit owner/model overrides where needed.

Automatic model choice fails closed on unpriced/stale options and prefers the lowest quoted Generation Credit reservation compatible with the operation unless an explicit compatible model is selected.

The final render remains local: scene normalization, transitions, narration, music ducking, subtitles and final encode do not require another paid video-generation call.

## Website/business learning

Marketing contains website/knowledge ingestion. Public web fetching is required to use SSRF-safe URL validation, bounded redirects and response-size/content-type limits. Extracted knowledge is stored/scoped for the connected organization and can be supplied to planning/generation context.

Website ingestion must be tested against a real public EquiProfile page after deployment before autonomous use is enabled.

## Platform strategy intelligence

The campaign context includes a dated public-guidance snapshot for major channels including Google Ads Search, YouTube, TikTok, LinkedIn and Meta/Facebook/Instagram.

This is intentionally framed as evidence-informed strategy, not secret-algorithm access. The engine should combine:

1. public platform guidance and creative constraints;
2. connected account/campaign performance;
3. conversion events from the host application;
4. ongoing measurement and optimization.

No repository documentation should claim knowledge of proprietary ranking or auction internals that the platforms do not publish.

## Quality over speed

Phase 1 should prefer controlled quality over high generation throughput:

- Manual + Emergency Stop ON is the safe initial mode;
- campaign plans/briefs precede governed paid generation;
- content-quality checks can block or hold weak/non-compliant output;
- external publication is gated by the Control Centre;
- worker concurrency can remain conservative during acceptance.

## Historical note

Older documentation described GenX Studio media as `UNCONFIRMED` or `PREVIEW` because only the historical text adapter had been inspected. That assessment no longer describes the current multimodal/runtime-catalogue implementation.

## Final acceptance boundary

Source completeness is not the same as provider acceptance. Before customer-facing autonomous use, deployment must prove every required retained modality with the real GenX account, real Generation Credits, real workers and valid outputs. Any operation that cannot be proven should remain unavailable rather than being advertised as working.