# ADR-007: Memory Architecture

## Status

Accepted

## Context

AI operations need persistent context (business profile, brand voice, conversation history) without re-fetching from the database on every call.

## Decision

Implement a memory service with:
- Key-value store in PostgreSQL `memory` table
- Typed memory: business, brand, conversation, knowledge, preference
- Namespace support for scoping
- Automatic expiration support
- Helper methods for common operations

## Consequences

**Positive:**
- Fast retrieval of frequently-needed context
- Flexible storage for any data shape
- Namespace isolation prevents conflicts

**Negative:**
- Manual cache invalidation needed
- No built-in memory search (relies on knowledge system for semantic search)
