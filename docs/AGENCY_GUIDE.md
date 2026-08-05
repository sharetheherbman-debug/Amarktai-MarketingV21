# Agency Guide

AmarktAI Marketing - Agency Platform & White Label Guide

## Overview

The Agency Platform enables marketing agencies to manage multiple clients with full white-label capabilities. Each client can have independent branding, custom domains, and a dedicated portal for collaboration.

## Agency Setup

### Creating an Agency

To create an agency, you need an existing organization:

```http
POST /api/v1/agency
{
  "organization_id": "your-org-id",
  "name": "My Marketing Agency",
  "slug": "my-agency",
  "description": "Full-service digital marketing agency",
  "max_clients": 50,
  "max_team_members": 20
}
```

### Agency Roles

| Role | Permissions |
|------|-------------|
| Owner | Full access, manage team, manage clients, billing |
| Admin | Manage team, manage clients, view reports |
| Manager | Assigned clients, create reports, manage campaigns |
| Member | View assigned clients, create content |
| Viewer | Read-only access to assigned clients |

## Client Management

### Adding Clients

```http
POST /api/v1/agency/clients
{
  "organization_id": "agency-org-id",
  "client_organization_id": "client-org-id",
  "relationship_type": "managed",
  "monthly_fee_cents": 50000
}
```

### Client Assignment Types

- **managed**: Full-service management
- **consultant**: Advisory role
- **fulfillment**: Specific task execution

### Client Health Monitoring

The agency dashboard provides:
- Active campaigns per client
- Recent content activity
- Last activity timestamp
- Monthly revenue tracking

## White Label Configuration

### Branding Setup

```http
PUT /api/v1/white-label/config
{
  "organization_id": "org-id",
  "brand_name": "Client Brand",
  "brand_logo": "https://example.com/logo.png",
  "brand_colors": {
    "primary": "#3B82F6",
    "secondary": "#10B981",
    "accent": "#F59E0B"
  },
  "brand_font": "Inter",
  "removed_branding": true,
  "support_email": "support@client.com"
}
```

### Custom Domains

```http
POST /api/v1/white-label/domains
{
  "organization_id": "org-id",
  "domain": "app.client.com",
  "target_cname": "proxy.amarktai.com",
  "is_primary": true
}
```

### Client Portals

Create white-labeled portals for client access:

```http
POST /api/v1/white-label/portals
{
  "agency_id": "agency-id",
  "client_organization_id": "client-org-id",
  "portal_name": "Client Portal",
  "custom_domain": "portal.client.com",
  "branding": {
    "logo": "https://client.com/logo.png",
    "primary_color": "#3B82F6"
  },
  "features": {
    "dashboard": true,
    "campaigns": true,
    "analytics": true,
    "approvals": true
  }
}
```

## Template Library

### Template Categories

| Category | Types |
|----------|-------|
| Campaign | Email sequences, social media plans |
| Workflow | Approval workflows, content pipelines |
| Prompt | Blog prompts, social prompts, ad copy |
| Brand DNA | Voice guidelines, tone templates |
| SEO | Audit checklists, keyword templates |
| CRM | Lead scoring, pipeline templates |
| Onboarding | Client onboarding wizards |

### Using Templates

```http
GET /api/v1/template-library?organization_id=org-id&category=campaign
```

### Creating Custom Templates

```http
POST /api/v1/template-library
{
  "organization_id": "org-id",
  "name": "Custom Email Sequence",
  "category": "campaign",
  "template_type": "campaign_template",
  "template_data": {
    "type": "email",
    "steps": [...]
  },
  "tags": ["email", "onboarding"]
}
```

## Client Reporting

### Generating Reports

Reports are automatically branded for each client:

```http
POST /api/v1/client-reports
{
  "agency_id": "agency-id",
  "client_organization_id": "client-org-id",
  "title": "Monthly Marketing Report",
  "report_type": "monthly",
  "period_start": "2026-07-01",
  "period_end": "2026-07-31"
}
```

### Report Types

- **monthly**: Comprehensive monthly overview
- **weekly**: Quick weekly summary
- **campaign**: Specific campaign performance
- **custom**: Custom date range and metrics

## API Reference

### Agency Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/agency` | Create agency |
| GET | `/api/v1/agency` | Get agency details |
| PUT | `/api/v1/agency` | Update agency |
| GET | `/api/v1/agency/stats` | Agency dashboard stats |
| GET | `/api/v1/agency/client-health` | Client health overview |
| GET | `/api/v1/agency/team` | List team members |
| POST | `/api/v1/agency/team` | Add team member |
| PUT | `/api/v1/agency/team/:id` | Update team member |
| DELETE | `/api/v1/agency/team/:id` | Remove team member |
| GET | `/api/v1/agency/clients` | List client assignments |
| POST | `/api/v1/agency/clients` | Assign client |
| PUT | `/api/v1/agency/clients/:id` | Update assignment |
| DELETE | `/api/v1/agency/clients/:id` | Remove assignment |

### White Label Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/white-label/config` | Get branding config |
| PUT | `/api/v1/white-label/config` | Update branding |
| GET | `/api/v1/white-label/domains` | List custom domains |
| POST | `/api/v1/white-label/domains` | Add domain |
| POST | `/api/v1/white-label/domains/:id/verify` | Verify domain |
| DELETE | `/api/v1/white-label/domains/:id` | Remove domain |
| GET | `/api/v1/white-label/portals` | List portals |
| POST | `/api/v1/white-label/portals` | Create portal |
| PUT | `/api/v1/white-label/portals/:id` | Update portal |
| DELETE | `/api/v1/white-label/portals/:id` | Remove portal |
| GET | `/api/v1/white-label/portals/:id/logs` | Portal access logs |

### Template Library Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/template-library` | List templates |
| GET | `/api/v1/template-library/categories` | Get categories |
| GET | `/api/v1/template-library/:id` | Get template |
| POST | `/api/v1/template-library` | Create template |
| PUT | `/api/v1/template-library/:id` | Update template |
| DELETE | `/api/v1/template-library/:id` | Delete template |
| POST | `/api/v1/template-library/:id/duplicate` | Duplicate template |

## Related Documentation

- [API Documentation](./API.md)
- [Database Schema](./DATABASE.md)
- [Integration Guide](./INTEGRATION_GUIDE.md)
