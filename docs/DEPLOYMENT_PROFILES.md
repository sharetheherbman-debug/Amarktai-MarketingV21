# Deployment profiles

AmarktAI Marketing has **one canonical engine** and multiple deployment profiles. A profile changes branding, host integration and authentication mode; it does not fork the Marketing application code, database model, scheduler, workers, GenX integration or governance system.

## 1. EquiProfile connected deployment

Purpose: EquiProfile Management customers use Marketing as a connected EquiProfile product.

Canonical public endpoints:

- Marketing: `https://marketing.equiprofile.online`
- Host application: `https://equiprofile.online`
- Return target: `https://equiprofile.online/dashboard`

Required public deployment values:

```dotenv
NEXT_PUBLIC_MARKETING_PUBLIC_URL=https://marketing.equiprofile.online
NEXT_PUBLIC_MARKETING_HOST_APPLICATION_NAME=EquiProfile
NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY=true
NEXT_PUBLIC_MARKETING_HOST_RETURN_URL=https://equiprofile.online/dashboard
NEXT_PUBLIC_AMARKTAI_NETWORK_URL=https://amarktai.co.za
```

Required server-side host identity:

```dotenv
HOST_APP_ID=equiprofile
HOST_APP_NAME=EquiProfile
HOST_APP_URL=https://equiprofile.online
```

The host connector key and application connector signing secret remain server-side and are never copied into browser configuration.

Behavioral contract:

- normal users enter through the signed host Application Connector;
- local Marketing `/login`, `/register`, password recovery and other parallel authentication surfaces are not the EquiProfile entry path;
- the resulting Marketing session remains organization-scoped;
- return/exit goes to the configured EquiProfile host URL;
- the generic standalone authentication capability remains in the engine for other profiles.

## 2. AmarktAI standalone deployment

Purpose: AmarktAI operates the same canonical engine as its own branded Marketing product.

Canonical public endpoint:

- `https://marketing.amarktai.co.za`

Typical public deployment values:

```dotenv
NEXT_PUBLIC_MARKETING_PUBLIC_URL=https://marketing.amarktai.co.za
NEXT_PUBLIC_MARKETING_BRAND_NAME=AmarktAI Marketing
NEXT_PUBLIC_MARKETING_HOST_APPLICATION_NAME=AmarktAI
NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY=false
NEXT_PUBLIC_MARKETING_HOST_RETURN_URL=https://amarktai.co.za
NEXT_PUBLIC_AMARKTAI_NETWORK_URL=https://amarktai.co.za
```

Standalone mode may expose the engine's own permitted sign-in flow. It still uses the same tenant isolation, GenX-only provider boundary, approvals, credit governance, scheduler, workers and Emergency Stop as every other deployment.

## 3. Reusable white-label deployment

Purpose: a future customer or AmarktAI-hosted product uses the canonical Marketing engine with customer-specific branding and host metadata.

Required principles:

- unique `COMPOSE_PROJECT_NAME`, database, Redis and durable Studio storage per isolated deployment unless an explicitly designed multi-tenant deployment is being used;
- customer-specific domain, brand name, logo, support address and colors;
- stable `HOST_APP_ID`, host URL and independent connector secret;
- explicit choice of authentication mode;
- embedded deployments must provide an HTTPS host return URL on the configured host origin;
- no EquiProfile or AmarktAI product data is hard-coded into generic engine logic.

For a connected white-label host use:

```dotenv
NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY=true
```

For a standalone white-label product use:

```dotenv
NEXT_PUBLIC_MARKETING_EMBEDDED_SSO_ONLY=false
```

## Repository/source-of-truth rule

The application implementation lives in `sharetheherbman-debug/Amarktai-MarketingV21`.

`sharetheherbman-debug/Equiprofile-Marketing` is the EquiProfile Core/Management/Academy/Shop host repository and contains only the Core-side Marketing connector, not a second Marketing engine.

Historical repositories or branches containing earlier Marketing implementations must not be deployed as parallel engines. AmarktAI and future white-label products are deployment profiles of this canonical engine, not copied application forks.
