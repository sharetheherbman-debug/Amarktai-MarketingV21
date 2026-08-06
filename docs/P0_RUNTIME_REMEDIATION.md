# P0 Runtime Remediation

This branch repairs deterministic runtime blockers found in the audit of `development` at `b76b137`.

## Included

- Ordered PostgreSQL extension bootstrap and checksum migration runner.
- Schema alignment for GenX registry, Studio queues, scene queues, renders and assets.
- Reproducible API and FFmpeg worker images.
- Correct worker commands and one-shot migration service.
- Nginx API path preservation and GenX webhook forwarding.
- Live GenX model validation and automatic initial catalogue sync.
- BullMQ-backed quick Studio and long-form scene generation.
- Persistent Studio history and async completion handling.
- Organization-scoped uploads and authenticated byte-range asset delivery.
- Long-form project/scene workspace and durable render queue.
- Clip normalization, cancellation-aware rendering, and authenticated MP4/thumbnail assets.

## Runtime verification still required

1. Populate `.env`, especially `GENX_API_KEY` and production secrets.
2. Build and start the complete Docker stack from a clean checkout.
3. Execute migrations 000–016 against an empty database.
4. Record the exact live GenX catalogue and model category counts.
5. Test representative image, video, audio/voice and lip-sync jobs.
6. Produce and probe a real six-scene 60-second MP4.
7. Configure production hosting, DNS and TLS, then run public smoke tests.
