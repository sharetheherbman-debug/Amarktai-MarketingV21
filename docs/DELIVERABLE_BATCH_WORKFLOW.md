# Canonical Deliverable-Batch Workflow

**Status:** Release candidate workflow contract  
**Canonical product:** `Amarktai-MarketingV21` standalone Marketing application  
**Applies to:** Owner-facing Marketing Home, Create, Campaign Planner, Campaign Workspace, Connections, Settings, and Usage & Safety.

## Purpose

Marketing is organized around **finished client deliverables**, rather than an exposed list of generation tools. An owner describes the required business outcome, selects a bounded batch of deliverables, reviews the generated campaign strategy and materials, then releases only through the existing approval and policy controls.

| Owner request | Canonical result | Boundary |
|---|---|---|
| One promotional video and five image adverts | One governed campaign plan with six planned deliverables | No parallel Studio workflow is created |
| Website or business analysis | Business Brain facts feed campaign planning | Facts, claims, restrictions, and product scopes stay validated |
| Promotion on a named channel | Channel-ready plan and approved release path | Connection, spend, approval, and Emergency Stop policies apply |
| Autonomous improvement | Growth Director cycle and observable lifecycle state | It cannot bypass owner controls, approved channels, or current limits |

## Deliverable Batch Contract

The Campaign Planner accepts an optional `requested_deliverables` batch. Each entry has a supported deliverable kind, a count bounded to **1–12**, channel targets, and—in the case of video—a duration bounded to **5–15 seconds**.

A video duration is **not** a generation quantity. Campaign production always queues one governed provider request per requested variation and records the requested short-form duration separately. This prevents a duration such as 15 seconds from being converted into fifteen paid jobs.

| Deliverable kind | Campaign planning behaviour | Production policy |
|---|---|---|
| `image_ad` | Creates branded platform-ready image-ad variations | One governed variation per requested asset |
| `video_ad` | Creates a short-form promotional video requirement | One bounded request per variation, maximum 15 seconds; any use of composition assets requires an available composition runtime |
| `text_ad` | Creates message and CTA variants | Governed written-material route |
| `social_post` | Creates social-ready variants | Governed content and approval route |
| `email` | Creates email deliverables | Governed content and approval route |

## Quality and Truth Controls

Campaign asset prompts require a conversion-oriented promotional result with a clear subject, offer context, focal hierarchy, visual direction, CTA, and accessibility constraints. They prohibit invented claims, prices, guarantees, testimonials, certifications, logos, watermarks, pseudo-text, and unsourced capability claims. Generated visual media remains **pending review** until the existing durable quality and approval gates complete.

> Deterministic overlays, such as approved brand lock-ups or copy, are not delegated to an image model. The asset brief reserves appropriate safe space for an approved composition step where that capability is configured.

## Growth Director and Owner Governance

Marketing Home shows the latest recorded Growth Director lifecycle state and a bounded progress indicator. The Command Centre creates a plan; it does not imply that paid media or outbound publishing has already occurred.

Usage & Safety is the owner-facing governance surface. It calls the existing protected Control Centre endpoints for operating mode, daily and per-action generation-credit limits, campaign advertising limit, approval threshold, allowed channels, approval safeguards, and Emergency Stop. Server-side policy remains the authority.

| Mode | Meaning |
|---|---|
| **Plan and review** | Marketing plans and drafts; the owner remains action-led |
| **Auto-run approved campaigns** | Automation prepares work, while controlled outbound actions require approval |
| **Marketing Autopilot** | Actions may proceed only within every active policy, spend, connection, and approval bound |

## Platform Connections and White Label

Connections retains a single connection workspace. Saved credentials remain write-only. Connection test and synchronization outcomes are surfaced honestly. The release does **not** present a simulated OAuth journey: redirect-based provider connection requires an implemented provider-specific OAuth contract before that option can be offered.

Marketing Settings remains the owner-facing location for white-label branding and custom-domain verification state. A custom domain remains in a pending or failed state until the server-side verification process confirms it.

## Verification Record

The release candidate passed the standalone Marketing verification suite, including TypeScript, build, route, database-contract, security, branding, and version checks. The Marketing API regression suite also passed, including the new deterministic deliverable-batch contract test.

The repository does not have a disposable PostgreSQL and Redis runtime available in this sandbox. Consequently, the authenticated real-browser Marketing end-to-end journey could not be rerun against a local database for this candidate. This is a **release verification limitation**, not a claim of browser acceptance. The required next release-gate action is to run the existing real-backend browser journey against a disposable seeded PostgreSQL/Redis environment, then inspect one complete owner campaign batch from plan through review status.

## Source Boundaries

This document supplements [`SOURCE_OF_TRUTH.md`](./SOURCE_OF_TRUTH.md). The standalone Marketing repository remains the only canonical Marketing engine. EquiProfile Core acts only as a signed host connector and must not regain embedded Marketing planning, campaign, CRM, analytics, media, or publishing modules.
