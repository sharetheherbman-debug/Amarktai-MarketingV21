# ADR-005: Knowledge System with Vector Search

## Status

Accepted

## Context

AI agents need access to organization-specific knowledge for accurate content generation. Knowledge comes from websites, documents, and APIs in various formats.

## Decision

Implement a knowledge system with:
- Source management (website crawler, document import, API feeds)
- Text chunking with configurable token limits
- Vector embeddings stored in pgvector
- Similarity search for semantic retrieval
- Metadata tracking per item

## Consequences

**Positive:**
- Semantic search finds relevant context beyond keyword matching
- Scalable chunking handles large documents
- Source management enables automatic re-sync

**Negative:**
- Requires pgvector extension
- Embedding generation adds latency and cost
- Chunk size affects retrieval quality
