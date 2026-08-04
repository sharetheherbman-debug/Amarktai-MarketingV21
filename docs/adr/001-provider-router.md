# ADR-001: Provider Router with Automatic Failover

## Status

Accepted

## Context

The platform needs to integrate with multiple AI providers (GenX Router, Together AI, DeepInfra) for text generation and embeddings. Each provider has different models, pricing, and reliability characteristics.

## Decision

Implement a Provider Router that:
- Routes requests based on model availability and provider priority
- Automatically fails over to the next available provider on error
- Tracks provider health and excludes unhealthy providers
- Records usage statistics per provider

## Consequences

**Positive:**
- High availability through failover
- Cost optimization through priority-based routing
- Easy to add new providers

**Negative:**
- Increased complexity in request handling
- Need to maintain provider-specific adapters
- Health check overhead
