# ADR-002: Brand DNA System

## Status

Accepted

## Context

AI-generated content must be consistent with the organization's brand voice, tone, and guidelines. Without a centralized brand identity system, each AI call would need to include brand context inline.

## Decision

Create a `brand_dna` table and service that stores:
- Company name, description, industry
- Brand voice and tone settings
- Target audience demographics
- Writing style guidelines
- Compliance rules and prohibited phrases
- Preferred CTAs

The context engine loads Brand DNA automatically when generating content.

## Consequences

**Positive:**
- Consistent brand voice across all AI operations
- Single source of truth for brand identity
- Easy to update without changing prompts

**Negative:**
- Additional database queries per AI operation
- Need to keep Brand DNA in sync with actual brand changes
