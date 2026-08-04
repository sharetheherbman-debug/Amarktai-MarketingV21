# ADR-003: Prompt Library with Versioning

## Status

Accepted

## Context

Prompts are critical assets that need versioning, testing, and rollback capabilities. Changes to prompts can significantly affect output quality.

## Decision

Implement a prompt library with:
- Versioned prompts stored in `prompt_library` and `prompt_versions`
- Automatic version increment on update
- Rollback to any previous version
- Test cases per prompt for regression testing
- Performance scoring

## Consequences

**Positive:**
- Safe prompt iteration with rollback
- Testable prompts with regression detection
- Performance tracking over versions

**Negative:**
- More database tables and queries
- Need to maintain test cases
