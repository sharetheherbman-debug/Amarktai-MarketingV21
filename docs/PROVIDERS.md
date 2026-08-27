# AI Provider Documentation

Complete guide to configuring and managing AI providers in AmarktAI Marketing.

## Provider Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Provider Router                                    │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Request Flow                                   │  │
│  │                                                                       │  │
│  │  1. Receive chat/embedding request                                   │  │
│  │  2. Select provider by priority + model availability                 │  │
│  │  3. Execute request                                                  │  │
│  │  4. On failure, failover to next provider                            │  │
│  │  5. Track usage and update health status                             │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   GenX Router    │  │   Together AI    │  │    DeepInfra     │          │
│  │                  │  │                  │  │                  │          │
│  │  Priority: 10    │  │  Priority: 5     │  │  Priority: 1     │          │
│  │  Status: Healthy │  │  Status: Healthy │  │  Status: Healthy │          │
│  │                  │  │                  │  │                  │          │
│  │  GPT-4o          │  │  Llama 3.1 405B  │  │  Llama 3.1 405B  │          │
│  │  Claude 3        │  │  Mixtral 8x22B   │  │  Mixtral 8x22B   │          │
│  │  Gemini Pro      │  │  Qwen2 72B       │  │  Gemma 2 27B     │          │
│  │  Llama 3.1       │  │  Gemma 2         │  │  DeepSeek 67B    │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Supported Providers

### GenX Router

GenX Router is the primary AI provider, offering access to multiple model families through a unified API.

**Base URL:** `https://api.genxrouter.com/v1`

**Setup:**

1. Sign up at [genxrouter.com](https://genxrouter.com)
2. Generate an API key
3. Add to environment:

```bash
GENX_API_KEY=your_genx_api_key
GENX_BASE_URL=https://api.genxrouter.com/v1
```

**Available Models:**

| Model | Type | Context | Best For |
|-------|------|---------|----------|
| `gpt-4o` | Chat | 128K | Complex content, analysis |
| `gpt-4o-mini` | Chat | 128K | Fast, cost-effective |
| `gpt-4-turbo` | Chat | 128K | Long-form content |
| `gpt-3.5-turbo` | Chat | 16K | Simple tasks |
| `claude-3-opus` | Chat | 200K | Creative writing |
| `claude-3-sonnet` | Chat | 200K | Balanced performance |
| `claude-3-haiku` | Chat | 200K | Fast responses |
| `gemini-pro` | Chat | 32K | Multilingual content |
| `llama-3.1-70b` | Chat | 128K | Open-source alternative |
| `mixtral-8x7b` | Chat | 32K | Fast inference |

**Configuration:**

```json
{
  "name": "GenX Router",
  "type": "genx",
  "api_key": "your-api-key",
  "base_url": "https://api.genxrouter.com/v1",
  "enabled": true,
  "priority": 10
}
```

**API Format:**

GenX Router uses the OpenAI-compatible API format:

```bash
curl https://api.genxrouter.com/v1/chat/completions \
  -H "Authorization: Bearer $GENX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a marketing assistant."},
      {"role": "user", "content": "Write a product description for a coffee maker."}
    ],
    "temperature": 0.7,
    "max_tokens": 500
  }'
```

---

### Together AI

Together AI provides access to open-source models with fast inference.

**Base URL:** `https://api.together.xyz/v1`

**Setup:**

1. Sign up at [together.ai](https://together.ai)
2. Generate an API key
3. Add to environment:

```bash
TOGETHER_API_KEY=your_together_api_key
TOGETHER_BASE_URL=https://api.together.xyz/v1
```

**Available Models:**

| Model | Type | Context | Best For |
|-------|------|---------|----------|
| `meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo` | Chat | 128K | Complex tasks |
| `meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo` | Chat | 128K | General purpose |
| `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` | Chat | 128K | Fast, lightweight |
| `mistralai/Mixtral-8x22B-Instruct-v0.1` | Chat | 64K | Multilingual |
| `mistralai/Mixtral-8x7B-Instruct-v0.1` | Chat | 32K | Fast inference |
| `Qwen/Qwen2-72B-Instruct` | Chat | 128K | Chinese + English |
| `google/gemma-2-27b-it` | Chat | 8K | Efficient processing |
| `deepseek-ai/deepseek-llm-67b-chat` | Chat | 128K | Code + text |

**Configuration:**

```json
{
  "name": "Together AI",
  "type": "together",
  "api_key": "your-api-key",
  "base_url": "https://api.together.xyz/v1",
  "enabled": true,
  "priority": 5
}
```

**Special Features:**

Together AI also supports image generation:

```bash
curl https://api.together.xyz/v1/images/generations \
  -H "Authorization: Bearer $TOGETHER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "stabilityai/stable-diffusion-xl-base-1.0",
    "prompt": "A modern coffee maker on a kitchen counter",
    "size": "1024x1024"
  }'
```

---

### DeepInfra

DeepInfra offers cost-effective inference for open-source models.

**Base URL:** `https://api.deepinfra.com/v1`

**Setup:**

1. Sign up at [deepinfra.com](https://deepinfra.com)
2. Generate an API key
3. Add to environment:

```bash
DEEPINFRA_API_KEY=your_deepinfra_api_key
DEEPINFRA_BASE_URL=https://api.deepinfra.com/v1
```

**Available Models:**

| Model | Type | Context | Best For |
|-------|------|---------|----------|
| `meta-llama/Meta-Llama-3.1-405B-Instruct` | Chat | 128K | Complex tasks |
| `meta-llama/Meta-Llama-3.1-70B-Instruct` | Chat | 128K | General purpose |
| `meta-llama/Meta-Llama-3.1-8B-Instruct` | Chat | 128K | Fast inference |
| `mistralai/Mixtral-8x22B-Instruct-v0.1` | Chat | 64K | Multilingual |
| `Qwen/Qwen2-72B-Instruct` | Chat | 128K | Chinese + English |
| `google/gemma-2-27b-it` | Chat | 8K | Efficient processing |
| `deepseek-ai/deepseek-llm-67b-chat` | Chat | 128K | Code + text |
| `databricks/dbrx-instruct` | Chat | 128K | Enterprise tasks |

**Configuration:**

```json
{
  "name": "DeepInfra",
  "type": "deepinfra",
  "api_key": "your-api-key",
  "base_url": "https://api.deepinfra.com/v1",
  "enabled": true,
  "priority": 1
}
```

## Provider Router

### How Requests Are Routed

The Provider Router selects the best provider for each request based on:

1. **Priority** - Higher priority providers are preferred
2. **Model Availability** - Routes to provider that supports the requested model
3. **Health Status** - Unhealthy providers are excluded
4. **Failover** - Automatic failover on errors

```
Request: "Write a blog post" (model: gpt-4o)
    │
    ▼
┌─────────────────────────────────┐
│  Select Provider                │
│                                 │
│  1. Filter: enabled = true      │
│  2. Filter: health != unhealthy │
│  3. Sort: priority DESC         │
│  4. Check: model availability   │
│                                 │
│  Result: GenX Router (priority 10, has gpt-4o)
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  Execute Request                │
│                                 │
│  GenX Router.chat(messages,     │
│    model: "gpt-4o",             │
│    options: { temp: 0.7 })      │
└─────────────────────────────────┘
    │
    ├── Success ──▶ Return response
    │
    └── Failure ──▶ Failover
                    │
                    ▼
              ┌─────────────────────────────────┐
              │  Try Next Provider              │
              │                                 │
              │  Filter out: GenX Router        │
              │  Next: Together AI (priority 5) │
              │                                 │
              │  Together AI doesn't have gpt-4o│
              │  Skip to: DeepInfra (priority 1)│
              │                                 │
              │  DeepInfra doesn't have gpt-4o  │
              │  No provider available          │
              │                                 │
              │  Error: "No available provider" │
              └─────────────────────────────────┘
```

### Provider Selection Algorithm

```typescript
async selectProvider(model?: string): Promise<ProviderInstance | null> {
  // 1. Get all enabled, healthy providers sorted by priority
  const available = Array.from(this.providers.values())
    .filter(p => p.enabled && p.healthStatus !== 'unhealthy')
    .sort((a, b) => b.priority - a.priority);

  if (available.length === 0) return null;

  // 2. If model specified, find provider that supports it
  if (model) {
    const withModel = available.filter(p => p.provider.getModels().includes(model));
    if (withModel.length > 0) return withModel[0];
  }

  // 3. Return highest priority provider
  return available[0];
}
```

## Failover Configuration

### Automatic Failover

Failover is automatic when a provider returns an error:

```typescript
async failover(failedProviderId, messages, model, options) {
  const available = Array.from(this.providers.values())
    .filter(p => p.id !== failedProviderId && p.enabled && p.healthStatus !== 'unhealthy')
    .sort((a, b) => b.priority - a.priority);

  for (const provider of available) {
    try {
      return await provider.provider.chat(messages, model, options);
    } catch (error) {
      continue; // Try next provider
    }
  }

  throw new Error('All providers failed');
}
```

### Failover Scenarios

| Scenario | Behavior |
|----------|----------|
| Provider timeout | Try next provider |
| Provider 500 error | Try next provider |
| Provider rate limit | Try next provider |
| Model not found | Skip to provider with model |
| All providers fail | Return error to user |

## Cost Optimization

### Priority-Based Routing

Set priorities based on cost and performance:

```json
[
  { "name": "GenX Router", "priority": 10 },
  { "name": "Together AI", "priority": 5 },
  { "name": "DeepInfra", "priority": 1 }
]
```

Higher priority = tried first. Use this to prefer cheaper or faster providers.

### Model Selection

Choose appropriate models for each task:

| Task | Recommended Model | Reason |
|------|-------------------|--------|
| Simple content | `gpt-4o-mini` | Fast, cheap |
| Complex content | `gpt-4o` | High quality |
| Creative writing | `claude-3-opus` | Best creativity |
| Bulk generation | `llama-3.1-8B` | Very fast |
| Multilingual | `Qwen2-72B` | Strong multilingual |

### Usage Tracking

Monitor usage through the provider management interface:

```typescript
// Usage stats are automatically tracked
await query(
  `UPDATE ai_providers
   SET usage_stats = jsonb_set(
     COALESCE(usage_stats, '{}'),
     '{total_requests}',
     (COALESCE(usage_stats->>'total_requests', '0')::int + 1)::text::jsonb
   )
   WHERE id = $1`,
  [providerId]
);
```

## Adding Custom Providers

### Provider Interface

To add a custom provider, implement the `ProviderInterface`:

```typescript
interface ProviderInterface {
  getName(): string;
  getModels(): string[];
  chat(messages: ChatMessage[], model: string, options?: ChatOptions): Promise<string>;
  embeddings(input: string | string[], model: string): Promise<EmbeddingResult[]>;
  healthCheck(): Promise<boolean>;
  getModels(): string[];
  imageGenerate?(prompt: string, model: string, options?: ImageGenerateOptions): Promise<string>;
}
```

### Example: Adding OpenAI Direct

```typescript
// apps/api/src/providers/openai.provider.ts

import { ChatMessage, ChatOptions, EmbeddingResult, ProviderInterface } from '../types';

export class OpenAIProvider implements ProviderInterface {
  private apiKey: string;
  private baseUrl: string;
  private models: string[];

  constructor(config: { apiKey: string; baseUrl: string }) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'];
  }

  getName(): string {
    return 'openai';
  }

  getModels(): string[] {
    return this.models;
  }

  async chat(messages: ChatMessage[], model: string, options?: ChatOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? 4096,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async embeddings(input: string | string[], model: string): Promise<EmbeddingResult[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: Array.isArray(input) ? input : [input],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data.map((item: any) => ({
      embedding: item.embedding,
      token_count: data.usage?.total_tokens || 0,
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
```

### Register Custom Provider

Add to the provider router:

```typescript
// apps/api/src/providers/provider-router.ts

import { OpenAIProvider } from './openai.provider';

private createProviderInstance(type: string, config: { apiKey: string; baseUrl: string }): ProviderInterface {
  switch (type) {
    case 'genx':
      return new GenXProvider(config);
    case 'together':
      return new TogetherProvider(config);
    case 'deepinfra':
      return new DeepInfraProvider(config);
    case 'openai':  // Add this
      return new OpenAIProvider(config);
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}
```

## Health Monitoring

### Health Check Endpoint

```http
GET /api/v1/providers/health
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "name": "GenX Router",
      "status": "healthy",
      "latency": 150,
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    {
      "name": "Together AI",
      "status": "degraded",
      "latency": 500,
      "lastCheck": "2024-01-15T10:30:00.000Z"
    },
    {
      "name": "DeepInfra",
      "status": "unhealthy",
      "latency": 0,
      "lastCheck": "2024-01-15T10:30:00.000Z",
      "error": "Connection timeout"
    }
  ]
}
```

### Health Status Values

| Status | Description |
|--------|-------------|
| `healthy` | Provider is responding normally |
| `degraded` | Provider is responding but slowly |
| `unhealthy` | Provider is not responding |
| `unknown` | Health check not yet performed |

### Health Check Logic

```typescript
async getHealthStatus(): Promise<ProviderHealth[]> {
  const results: ProviderHealth[] = [];

  for (const [id, instance] of this.providers) {
    const start = Date.now();
    try {
      const healthy = await instance.provider.healthCheck();
      const latency = Date.now() - start;

      const status: HealthStatus = healthy ? 'healthy' : 'degraded';
      await query(
        'UPDATE ai_providers SET health_status = $1, last_health_check = NOW() WHERE id = $2',
        [status, id]
      );

      results.push({ name: instance.name, status, latency, lastCheck: new Date() });
    } catch (error) {
      await query(
        'UPDATE ai_providers SET health_status = $1, last_health_check = NOW() WHERE id = $2',
        ['unhealthy', id]
      );

      results.push({
        name: instance.name,
        status: 'unhealthy',
        latency: Date.now() - start,
        lastCheck: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}
```

## Usage Tracking

### Tracked Metrics

The system tracks the following metrics per provider:

```json
{
  "total_requests": 1500,
  "total_tokens": 2500000,
  "total_cost": 15.50,
  "last_request_at": "2024-01-15T10:30:00.000Z"
}
```

### Viewing Usage

```http
GET /api/v1/providers
Authorization: Bearer <token>
```

The response includes `usage_stats` for each provider.

### Reset Usage Stats

Usage stats can be reset through the database:

```sql
UPDATE ai_providers
SET usage_stats = '{}'
WHERE id = 'provider-uuid';
```

## Marketing Library stock providers

The tenant Marketing Library can search Pexels, Pixabay, Unsplash, Openverse,
and Wikimedia Commons. Pexels, Pixabay, and Unsplash require their server-side
keys (`PEXELS_API_KEY`, `PIXABAY_API_KEY`, and `UNSPLASH_ACCESS_KEY`). Openverse
works anonymously; `OPENVERSE_CLIENT_ID` and `OPENVERSE_CLIENT_SECRET` are
optional. Wikimedia Commons works anonymously. Freesound is intentionally not
part of this gateway.

The customer UI reports each adapter as `AVAILABLE`,
`EXTERNAL_CONFIGURATION_REQUIRED`, `RATE_LIMITED`, or
`PROVIDER_UNAVAILABLE`. Searches are not bulk mirrored. A customer must select
an item before it is saved, and each saved item keeps its source page, creator,
license, attribution, commercial-use and derivatives eligibility in the tenant
provenance ledger. Unsplash results remain hotlinked and call the returned
download-tracking endpoint on selection. Other selected media is copied into
private tenant storage so temporary provider URLs are not used as a permanent
asset host.
