# Studio

## Scope

Content Studio owns durable written marketing output and revision workflows. Creative Studio owns provider-backed and locally rendered media. Both consume Business Brain and campaign context, preserve organisation isolation, associate outputs with campaigns where requested, and use exact-version approvals.

## Content Studio

Supported content families include social posts, campaign copy, blogs/articles, landing pages, email, newsletters, product/service copy, advertising copy, scripts, and SEO content. A saved output has durable content, type, campaign association, version history, approval state, and timestamps. Refreshing the browser must not discard it.

## Creative Studio

Creative Studio exposes only runtime-confirmed capabilities:

- text and marketing copy;
- text-to-image and campaign/social/ad images;
- text-to-video and image-to-video for short clips, adverts, reels, landscape and vertical formats;
- audio/voice and music when the active catalogue supports them;
- Cinema workflows backed by real assets only;
- lip-sync only when the catalogue and runtime confirm it.

Unavailable operations are labelled unavailable. Missing preview artwork is removed or replaced with a real local asset; visible broken thumbnails are not acceptable.

## Long-form pipeline

```text
brief -> script -> storyboard -> scenes -> production strategy -> quote
      -> reserve credits -> scene production -> continuity
      -> narration/music/captions -> local assembly -> MP4/thumbnail
      -> durable Studio assets -> playback/download
```

Supported output shapes are at least `16:9`, `9:16`, and `1:1`. Reels and Shorts are first-class strategies.

## Production strategies

- **Economy**: generated or approved stills plus local FFmpeg motion by default; paid video only when explicitly selected.
- **Smart/Hybrid**: default. True AI video is reserved for motion-critical scenes; ordinary scenes use still-motion.
- **Cinematic**: a higher proportion of premium AI-video scenes, with cost-aware still-motion elsewhere.
- **Premium**: highest compatible quality inside an explicit approved project budget.

Each scene persists an explicit production mode. A populated `source_image_url` does not change that classification. If still generation succeeded but local rendering failed, retry reuses the existing still and retries only local motion. It must not regenerate the image, switch to AI video, or create another charge.

## Project quote and hard gate

Before Generate All, the API calculates and stores:

- scene count and planned duration;
- still-motion and AI-video scene counts/durations;
- image, AI-video, narration, and music/audio cost;
- total estimated Generation Credits;
- approximate configured billing-currency value;
- maximum allowed project credits;
- production strategy and selected models.

Generation fails closed when pricing is stale, a required model has no price, the quote exceeds policy/project budget, the wallet cannot reserve the estimate, Emergency Stop is active, or another safety policy blocks execution.

## Model selection

Economy selects the lowest-priced runtime-confirmed model meeting capability and quality constraints. Smart applies a quality floor with cost optimisation. Cinematic uses premium models for motion-critical scenes. Premium chooses the highest-compatible quality that stays inside the approved ceiling. Advanced users may make a manual selection, but it remains capability-, policy-, pricing-, and budget-checked.

## Asset and credit idempotency

Successful stills, approved campaign assets, uploaded media, previous scene sources, brand assets, and reusable narration/music are reused when valid. Idempotency keys bind reservation, provider submission, settlement, and release to one logical generation. Retried work must not double-charge or create duplicate durable assets.

## Live-provider boundary

Ordinary tests use deterministic adapters and local media fixtures while exercising the real API, database, queues, storage, and FFmpeg path. Paid provider checks are opt-in, print a quote, require an explicit ceiling, and are documented in [Testing and acceptance](TESTING_AND_ACCEPTANCE.md).
