# ADR-008: Docker Strategy

## Status

Accepted

## Context

The platform needs consistent deployment across development, staging, and production environments with minimal setup.

## Decision

Use Docker Compose with:
- PostgreSQL 16 Alpine for database
- Redis 7 Alpine for caching and queues
- Multi-stage Dockerfiles for API and Web
- Nginx Alpine as reverse proxy
- Health checks on all services
- Named volumes for data persistence
- Bridge network for service communication

## Consequences

**Positive:**
- One-command setup for full stack
- Consistent environments across machines
- Health checks ensure service readiness
- Easy to scale individual services

**Negative:**
- Docker overhead on development machines
- Multi-stage builds increase CI time
- Need to manage secrets outside compose files
