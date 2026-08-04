# API Documentation

Complete API reference for AmarktAI Marketing backend.

## Base URL

```
http://localhost:4000/api/v1
```

In production:
```
https://marketing.amarktai.co.za/api/v1
```

## Authentication

All authenticated endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <access_token>
```

Tokens can also be passed via cookies:
- `accessToken` - Short-lived access token (15 minutes)
- `refreshToken` - Long-lived refresh token (7 days)

### Token Refresh

When the access token expires, use the refresh endpoint to get a new token pair:

```http
POST /api/v1/auth/refresh
Cookie: refreshToken=<refresh_token>
```

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... }
}
```

### Paginated Response

```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "message": "Human-readable error message",
    "machine_readable_error_code": "ERROR_CODE"
  }
}
```

## Rate Limiting

| Endpoint Type | Window | Max Requests |
|--------------|--------|--------------|
| General API | 15 minutes | 100 |
| Auth endpoints | 15 minutes | 20 |

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

---

## Health

### Check API Health

```http
GET /api/v1/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600,
  "environment": "production",
  "version": "1.0.0"
}
```

---

## Authentication

### Register

Create a new user account.

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

**Validation:**
- `email`: Valid email format
- `password`: 8-100 characters
- `name`: 1-255 characters

**Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "email_verified": false,
      "status": "active",
      "created_at": "2024-01-15T10:30:00.000Z"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### Login

Authenticate and receive tokens.

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "user",
      "email_verified": true,
      "status": "active"
    },
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### Logout

Clear authentication cookies.

```http
POST /api/v1/auth/logout
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully"
  }
}
```

### Refresh Token

Get new access token using refresh token.

```http
POST /api/v1/auth/refresh
Cookie: refreshToken=<refresh_token>

# OR

POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refresh_token>"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

### Forgot Password

Request password reset email.

```http
POST /api/v1/auth/forgot-password
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "If an account exists, a reset email has been sent"
  }
}
```

### Reset Password

Reset password using token from email.

```http
POST /api/v1/auth/reset-password
Content-Type: application/json

{
  "token": "reset-token-from-email",
  "password": "newSecurePassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Password reset successfully"
  }
}
```

### Verify Email

Verify email address using token from email.

```http
POST /api/v1/auth/verify-email
Content-Type: application/json

{
  "token": "verification-token-from-email"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Email verified successfully"
  }
}
```

### Resend Verification

Resend email verification link.

```http
POST /api/v1/auth/resend-verification
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "If an account exists, a verification email has been sent"
  }
}
```

### Get Current User

Get authenticated user's profile.

```http
GET /api/v1/auth/me
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatar": null,
    "role": "user",
    "email_verified": true,
    "status": "active",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Organizations

All organization endpoints require authentication.

### List Organizations

Get organizations the authenticated user belongs to.

```http
GET /api/v1/organizations
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Acme Corp",
      "slug": "acme-corp",
      "logo": null,
      "plan": "free",
      "status": "active",
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Create Organization

```http
POST /api/v1/organizations
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Acme Corp",
  "slug": "acme-corp"
}
```

**Validation:**
- `name`: 1-255 characters
- `slug`: 1-255 characters, URL-safe, unique

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "free",
    "status": "active"
  }
}
```

### Get Organization

```http
GET /api/v1/organizations/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "logo": null,
    "settings": {},
    "plan": "free",
    "status": "active",
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### Update Organization

Requires `owner` or `admin` role in the organization.

```http
PUT /api/v1/organizations/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "logo": "https://example.com/logo.png"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Updated Name",
    "logo": "https://example.com/logo.png"
  }
}
```

### Delete Organization

Requires `owner` role in the organization.

```http
DELETE /api/v1/organizations/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Organization deleted"
  }
}
```

### Add Member

Requires `owner` or `admin` role.

```http
POST /api/v1/organizations/:id/members
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newmember@example.com",
  "role": "member"
}
```

**Validation:**
- `email`: Valid email format
- `role`: One of `owner`, `admin`, `member`, `viewer`

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "organization_id": "org-uuid",
    "user_id": "user-uuid",
    "role": "member",
    "joined_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### Remove Member

Requires `owner` or `admin` role.

```http
DELETE /api/v1/organizations/:id/members/:userId
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Member removed"
  }
}
```

### Update Member Role

Requires `owner` role.

```http
PUT /api/v1/organizations/:id/members/:userId/role
Authorization: Bearer <token>
Content-Type: application/json

{
  "role": "admin"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "role": "admin"
  }
}
```

---

## Users

All user endpoints require authentication.

### Get Profile

```http
GET /api/v1/users/profile
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatar": null,
    "role": "user",
    "email_verified": true,
    "settings": {},
    "status": "active",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### Update Profile

```http
PUT /api/v1/users/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "avatar": "https://example.com/avatar.png"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Updated Name",
    "avatar": "https://example.com/avatar.png",
    "role": "user",
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### Change Password

```http
PUT /api/v1/users/password
Authorization: Bearer <token>
Content-Type: application/json

{
  "oldPassword": "currentPassword",
  "newPassword": "newSecurePassword123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Password updated"
  }
}
```

### Delete Account

Soft deletes the user account.

```http
DELETE /api/v1/users/account
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Account deleted"
  }
}
```

---

## Providers

All provider endpoints require authentication.

### List Providers

```http
GET /api/v1/providers
Authorization: Bearer <token>

# Optional: filter by organization
GET /api/v1/providers?organization_id=uuid
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "GenX Router",
      "type": "genx",
      "base_url": "https://api.genxrouter.com/v1",
      "enabled": true,
      "priority": 10,
      "health_status": "healthy",
      "last_health_check": "2024-01-15T10:30:00.000Z",
      "usage_stats": {
        "total_requests": 1500
      },
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

### Create Provider

```http
POST /api/v1/providers
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "GenX Router",
  "type": "genx",
  "api_key": "your-api-key",
  "base_url": "https://api.genxrouter.com/v1",
  "organization_id": "uuid",
  "enabled": true,
  "priority": 10
}
```

**Validation:**
- `name`: 1-100 characters
- `type`: One of `genx`, `together`, `deepinfra`, `openai`, `custom`
- `api_key`: Non-empty string
- `base_url`: Valid URL
- `priority`: Integer

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "GenX Router",
    "type": "genx",
    "enabled": true,
    "priority": 10
  }
}
```

### Update Provider

```http
PUT /api/v1/providers/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "priority": 20
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Updated Name",
    "priority": 20
  }
}
```

### Delete Provider

```http
DELETE /api/v1/providers/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Provider deleted"
  }
}
```

### Test Provider Connection

```http
POST /api/v1/providers/:id/test
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "healthy": true,
    "latency": 150,
    "models": ["gpt-4o", "gpt-4o-mini", "claude-3-opus"]
  }
}
```

### Toggle Provider

Enable or disable a provider.

```http
PUT /api/v1/providers/:id/toggle
Authorization: Bearer <token>
Content-Type: application/json

{
  "enabled": false
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "enabled": false
  }
}
```

### Get Provider Models

```http
GET /api/v1/providers/:id/models
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "claude-3-opus",
    "claude-3-sonnet"
  ]
}
```

### Provider Health Check

Check health of all providers.

```http
GET /api/v1/providers/health
Authorization: Bearer <token>
```

**Response (200):**
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
      "status": "healthy",
      "latency": 200,
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

---

## Onboarding

The onboarding endpoints are used for initial setup. These endpoints are unauthenticated.

### Get Onboarding Status

```http
GET /api/v1/onboarding/status
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "isComplete": false,
    "adminCreated": false,
    "organizationCreated": false,
    "providersConfigured": false
  }
}
```

### Create Admin Account

First step of onboarding.

```http
POST /api/v1/onboarding/admin
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "adminPassword123",
  "name": "Admin User"
}
```

**Validation:**
- `email`: Valid email format
- `password`: 8-100 characters
- `name`: 1-255 characters

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "admin@example.com",
    "name": "Admin User",
    "role": "admin"
  }
}
```

### Configure Application

```http
POST /api/v1/onboarding/configure
Content-Type: application/json

{
  "app_url": "https://marketing.amarktai.co.za",
  "ssl_enabled": true,
  "trusted_domains": ["marketing.amarktai.co.za"]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "App configured"
  }
}
```

### Configure Providers

```http
POST /api/v1/onboarding/providers
Content-Type: application/json

{
  "providers": [
    {
      "name": "GenX Router",
      "type": "genx",
      "api_key": "your-genx-api-key",
      "base_url": "https://api.genxrouter.com/v1",
      "enabled": true,
      "priority": 10
    },
    {
      "name": "Together AI",
      "type": "together",
      "api_key": "your-together-api-key",
      "base_url": "https://api.together.xyz/v1",
      "enabled": true,
      "priority": 5
    }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Providers configured"
  }
}
```

### Test Providers

Test all configured providers.

```http
POST /api/v1/onboarding/test-providers
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "name": "GenX Router",
      "healthy": true,
      "latency": 150
    },
    {
      "name": "Together AI",
      "healthy": true,
      "latency": 200
    }
  ]
}
```

### Create Organization

```http
POST /api/v1/onboarding/organization
Content-Type: application/json

{
  "name": "My Company",
  "slug": "my-company"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My Company",
    "slug": "my-company"
  }
}
```

### Complete Onboarding

```http
POST /api/v1/onboarding/complete
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Onboarding completed"
  }
}
```

---

## Campaigns

All campaign endpoints require authentication.

### List Campaigns

```http
GET /api/v1/campaigns
Authorization: Bearer <token>

# With pagination and filters
GET /api/v1/campaigns?page=1&limit=20&sort=created_at&order=desc&search=summer&organization_id=uuid
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `sort` | string | created_at | Sort field |
| `order` | string | desc | Sort order (asc/desc) |
| `search` | string | - | Search term |
| `organization_id` | uuid | - | Filter by organization |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "organization_id": "uuid",
      "project_id": null,
      "name": "Summer Sale Campaign",
      "description": "Promotional campaign for summer sale",
      "type": "email",
      "status": "draft",
      "config": {},
      "schedule": {},
      "metrics": {},
      "created_by": "uuid",
      "started_at": null,
      "completed_at": null,
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### Create Campaign

```http
POST /api/v1/campaigns
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Summer Sale Campaign",
  "description": "Promotional campaign for summer sale",
  "type": "email",
  "project_id": "uuid",
  "organization_id": "uuid",
  "config": {
    "subject": "Summer Sale - 50% Off!",
    "template": "promotional"
  },
  "schedule": {
    "start_date": "2024-06-01T00:00:00Z",
    "end_date": "2024-06-30T23:59:59Z",
    "frequency": "daily"
  }
}
```

**Validation:**
- `name`: 1-255 characters
- `type`: One of `email`, `social`, `ads`, `content`, `sms`
- `organization_id`: Required

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Summer Sale Campaign",
    "type": "email",
    "status": "draft"
  }
}
```

### Get Campaign

```http
GET /api/v1/campaigns/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "organization_id": "uuid",
    "name": "Summer Sale Campaign",
    "description": "Promotional campaign for summer sale",
    "type": "email",
    "status": "draft",
    "config": {},
    "schedule": {},
    "metrics": {},
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

### Update Campaign

```http
PUT /api/v1/campaigns/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Campaign Name",
  "status": "active",
  "config": {
    "subject": "Updated Subject"
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Updated Campaign Name",
    "status": "active"
  }
}
```

### Delete Campaign

Soft deletes the campaign.

```http
DELETE /api/v1/campaigns/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Campaign deleted"
  }
}
```

---

## Content

All content endpoints require authentication.

### List Content

```http
GET /api/v1/content
Authorization: Bearer <token>

# With filters
GET /api/v1/content?page=1&limit=20&type=blog&organization_id=uuid&search=marketing
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `sort` | string | created_at | Sort field |
| `order` | string | desc | Sort order (asc/desc) |
| `search` | string | - | Search term |
| `organization_id` | uuid | - | Filter by organization |
| `type` | string | - | Filter by content type |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "organization_id": "uuid",
      "campaign_id": null,
      "project_id": null,
      "title": "10 Marketing Tips for 2024",
      "body": "Marketing is evolving...",
      "type": "blog",
      "format": "markdown",
      "platform": null,
      "status": "draft",
      "metadata": {},
      "ai_generated": true,
      "ai_model": "gpt-4o",
      "ai_prompt": "Write a blog post about marketing tips",
      "published_at": null,
      "created_by": "uuid",
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### Create Content

```http
POST /api/v1/content
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "10 Marketing Tips for 2024",
  "body": "Marketing is evolving...",
  "type": "blog",
  "format": "markdown",
  "campaign_id": "uuid",
  "organization_id": "uuid",
  "metadata": {
    "tags": ["marketing", "tips"],
    "author": "AI Assistant"
  }
}
```

**Validation:**
- `type`: One of `blog`, `social`, `email`, `ad`, `video`, `image`
- `organization_id`: Required

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "10 Marketing Tips for 2024",
    "type": "blog",
    "status": "draft"
  }
}
```

### Get Content

```http
GET /api/v1/content/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "10 Marketing Tips for 2024",
    "body": "Marketing is evolving...",
    "type": "blog",
    "status": "draft"
  }
}
```

### Update Content

```http
PUT /api/v1/content/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "body": "Updated content...",
  "status": "published"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Updated Title",
    "status": "published"
  }
}
```

### Delete Content

Soft deletes the content.

```http
DELETE /api/v1/content/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Content deleted"
  }
}
```

---

## Agents

All agent endpoints require authentication.

### List Agents

```http
GET /api/v1/agents
Authorization: Bearer <token>

# With filters
GET /api/v1/agents?page=1&limit=20&type=content&organization_id=uuid
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max 100) |
| `sort` | string | created_at | Sort field |
| `order` | string | desc | Sort order (asc/desc) |
| `search` | string | - | Search term |
| `organization_id` | uuid | - | Filter by organization |
| `type` | string | - | Filter by agent type |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "organization_id": "uuid",
      "name": "Content Writer",
      "description": "AI agent for writing blog posts",
      "type": "content",
      "config": {},
      "system_prompt": "You are a professional content writer...",
      "model": "gpt-4o",
      "provider": "genx",
      "status": "active",
      "capabilities": ["write", "edit", "research"],
      "created_by": "uuid",
      "created_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1,
    "totalPages": 1
  }
}
```

### Create Agent

```http
POST /api/v1/agents
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Content Writer",
  "description": "AI agent for writing blog posts",
  "type": "content",
  "organization_id": "uuid",
  "system_prompt": "You are a professional content writer specializing in marketing content.",
  "model": "gpt-4o",
  "provider": "genx",
  "config": {
    "temperature": 0.7,
    "max_tokens": 2000
  },
  "capabilities": ["write", "edit", "research"]
}
```

**Validation:**
- `name`: 1-255 characters
- `type`: One of `content`, `analytics`, `social`, `email`, `research`, `custom`
- `organization_id`: Required

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Content Writer",
    "type": "content",
    "status": "active"
  }
}
```

### Get Agent

```http
GET /api/v1/agents/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Content Writer",
    "description": "AI agent for writing blog posts",
    "type": "content",
    "model": "gpt-4o",
    "status": "active"
  }
}
```

### Update Agent

```http
PUT /api/v1/agents/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Agent Name",
  "model": "gpt-4o-mini",
  "status": "inactive"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Updated Agent Name",
    "model": "gpt-4o-mini",
    "status": "inactive"
  }
}
```

### Delete Agent

Soft deletes the agent.

```http
DELETE /api/v1/agents/:id
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Agent deleted"
  }
}
```

### Execute Agent

Create a task to execute an agent.

```http
POST /api/v1/agents/:id/execute
Authorization: Bearer <token>
Content-Type: application/json

{
  "input": {
    "prompt": "Write a blog post about AI marketing",
    "style": "professional",
    "length": "1000 words"
  },
  "campaign_id": "uuid"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "task-uuid",
    "organization_id": "org-uuid",
    "agent_id": "agent-uuid",
    "campaign_id": "campaign-uuid",
    "name": "Execute Content Writer",
    "type": "content",
    "status": "pending",
    "input": {
      "prompt": "Write a blog post about AI marketing",
      "style": "professional",
      "length": "1000 words"
    },
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Authentication required |
| `INVALID_TOKEN` | 401 | Invalid or expired token |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `BAD_REQUEST` | 400 | Invalid request data |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `CONFLICT` | 409 | Resource already exists |
| `INTERNAL_ERROR` | 500 | Server error |
| `MISSING_TOKEN` | 400 | Required token not provided |
| `MISSING_EMAIL` | 400 | Email not provided |
| `NO_ADMIN` | 400 | Admin account required |
| `AGENT_INACTIVE` | 400 | Agent is not active |

---

## Pagination

All list endpoints support pagination:

**Request:**
```http
GET /api/v1/campaigns?page=2&limit=10
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 10,
    "total": 45,
    "totalPages": 5
  }
}
```

**Pagination Parameters:**
| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| `page` | number | 1 | - | Page number |
| `limit` | number | 20 | 100 | Items per page |
| `sort` | string | created_at | - | Sort field |
| `order` | string | desc | - | Sort direction |
| `search` | string | - | - | Search query |
