# ADR-006: Agent Hierarchy

## Status

Accepted

## Context

Complex marketing tasks require multiple agents working together. A flat agent structure makes it difficult to compose complex workflows.

## Decision

Implement an agent hierarchy with:
- Agent definitions with parent-child relationships
- Worker agents for specific tasks
- Orchestrator agents for multi-step workflows
- Shared tool registry across agents
- Per-agent model and provider configuration

## Consequences

**Positive:**
- Composable agent workflows
- Specialized agents for specific tasks
- Flexible model selection per agent

**Negative:**
- Orchestration complexity
- Need to manage agent communication
- Debugging multi-agent flows is harder
