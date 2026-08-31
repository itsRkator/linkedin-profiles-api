# LinkedIn Profiles API

Monorepo containing two production-ready REST API implementations that fetch LinkedIn profile data via direct backend HTTP calls to the LinkedIn Voyager API, normalize the response into structured JSON, and cache results in a database.

**Author:** Rohitash Kator  
**License:** ISC  
**Node.js:** 24+ (see `.nvmrc` in each module)

Both implementations expose the same HTTP interface and share the same layered architecture, LinkedIn integration, security controls, and test strategy. The only meaningful difference is the persistence layer.

| Module                           | Database       | ORM      | Migrations                             |
| -------------------------------- | -------------- | -------- | -------------------------------------- |
| [`postgres-api/`](postgres-api/) | PostgreSQL 14+ | TypeORM  | TypeORM migrations (`npm run migrate`) |
| [`mongo-api/`](mongo-api/)       | MongoDB 7+     | Mongoose | Schema/index creation at startup       |

**No browser automation is used.** All LinkedIn communication happens through direct HTTP requests via [`undici`](https://undici.nodejs.org/) with HTTP/2 and a Chrome-aligned TLS cipher suite. No Playwright, Puppeteer, Selenium, WebDriver, or headless browsers.

---

## Table of contents

1. [Project overview](#1-project-overview)
2. [Feature list](#2-feature-list)
3. [Repository structure](#3-repository-structure)
4. [Architecture and request flow](#4-architecture-and-request-flow)
5. [API endpoints](#5-api-endpoints)
6. [Choosing a variant](#6-choosing-a-variant)
7. [Prerequisites](#7-prerequisites)
8. [Quick start](#8-quick-start)
9. [Docker Compose](#9-docker-compose)
10. [Database](#10-database)
11. [Development commands](#11-development-commands)
12. [CI pipeline](#12-ci-pipeline)
13. [Deployment](#13-deployment)
14. [LinkedIn direct-HTTP integration](#14-linkedin-direct-http-integration)
15. [Security measures](#15-security-measures)
16. [Known limitations](#16-known-limitations)
17. [Ethical and legal constraints](#17-ethical-and-legal-constraints)
18. [Module documentation](#18-module-documentation)

---

## 1. Project overview

Each module is a standalone Express 5 + TypeScript service that:

- Accepts a LinkedIn profile URL (`/in/{publicIdentifier}`)
- Validates and normalizes the URL with host allowlisting and SSRF protection
- Checks a configurable TTL cache in the database
- Fetches fresh data from LinkedIn's Voyager API when needed
- Parses LinkedIn's `application/vnd.linkedin.normalized+json+2.1` response into a stable `NormalizedProfile` schema
- Persists successful fetches and audit metadata
- Returns structured JSON with appropriate HTTP status codes

Layered architecture separates routing, validation (Zod), business logic, persistence, and the LinkedIn integration behind a `LinkedInProfileProvider` interface (`VoyagerLinkedInProvider`).

---

## 2. Feature list

Shared across both modules:

- `POST /v1/profiles` — fetch and cache a profile by LinkedIn URL
- `GET /v1/profiles/:publicIdentifier` — retrieve a stored profile
- `GET /health` — service and database health check
- LinkedIn URL validation, normalization, and host allowlisting (`linkedin.com`, `www.linkedin.com`)
- SSRF protection via DNS resolution checks against private IP ranges
- Configurable cache TTL (default 24 hours)
- Forced refresh via `refresh: true`
- Stale cache preserved (not overwritten) when upstream fetch fails
- Serial LinkedIn request throttling with jitter (default 8 s minimum + 0–3 s jitter)
- API-level rate limiting (default 20 requests per 60 s window)
- Structured Winston logs with request IDs and secret redaction
- Graceful shutdown with database disconnect on SIGTERM/SIGINT
- Helmet security headers and configurable CORS
- TypeScript strict mode
- Unit and integration tests with mocked LinkedIn provider (no live LinkedIn traffic required)
- Dockerfile, Docker Compose, Render blueprint (`render.yaml`), and GitHub Actions CI

---

## 3. Repository structure

```
linkedin-profiles-api/
├── .github/workflows/ci.yml     # Matrix CI for both modules
├── .gitignore
├── postgres-api/                # PostgreSQL + TypeORM variant
│   ├── src/
│   │   ├── app.ts               # Express factory (Helmet, CORS, rate limit, middleware)
│   │   ├── server.ts            # Bootstrap, graceful shutdown
│   │   ├── config/index.ts      # Environment-driven configuration
│   │   ├── controllers/         # HTTP handlers
│   │   ├── db/
│   │   │   ├── data-source.ts   # TypeORM DataSource
│   │   │   ├── entities/        # Profile, ProfileFetch
│   │   │   └── migrations/      # Schema migrations
│   │   ├── middleware/          # requestId, requestLogger, errorHandler
│   │   ├── repositories/        # TypeORM data access
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── profile.service.ts
│   │   │   └── linkedin/        # auth, client, endpoints, parser, provider, throttle, types
│   │   ├── tests/               # unit + integration (mocked)
│   │   ├── utils/               # hash, logger, ssrf, urlValidator
│   │   └── validators/
│   ├── scripts/capture-raw.ts   # Diagnostic: save raw Voyager response to /tmp/
│   ├── docker-compose.yml
│   ├── docker-entrypoint.sh     # Runs migrations before start
│   ├── Dockerfile
│   ├── render.yaml
│   └── README.md
└── mongo-api/                   # MongoDB + Mongoose variant
    ├── src/                     # Same layered layout (db/models/ instead of entities/migrations)
    ├── scripts/capture-raw.ts
    ├── docker-compose.yml
    ├── Dockerfile
    ├── render.yaml
    └── README.md
```

Postman collections exist in each module (`LinkedIn_Profile_API.postman_collection.json`) but are excluded from git by root `.gitignore`.

---

## 4. Architecture and request flow

```
Client
  │
  ▼
Express (Helmet → CORS → RateLimit → JSON parser → RequestId → Logger)
  │
  ▼
Route → Controller → Validator (Zod)
  │
  ▼
ProfileService
  ├── validateAndParseLinkedInUrl()
  ├── assertNotSSRF()
  ├── ProfileRepository.findByPublicIdentifier()
  │     └── valid cache and refresh=false → return cached profile
  │
  └── LinkedInProfileProvider.fetchProfile()
        ├── buildLinkedInHeaders()
        ├── linkedInThrottle.throttle()
        ├── undici GET → Voyager endpoint
        ├── parseLinkedInProfile()
        └── ProfileRepository.upsertProfile()
  │
  ▼
JSON response
```

### Design patterns

| Pattern              | Location                                              |
| -------------------- | ----------------------------------------------------- |
| Layered architecture | routes → controllers → services → repositories        |
| Strategy             | `LinkedInProfileProvider` / `VoyagerLinkedInProvider` |
| Repository           | `profile.repository.ts`                               |
| Factory              | `createApp()` in `app.ts`                             |
| Middleware chain     | request ID, logging, error handling                   |

---

## 5. API endpoints

Both modules expose identical routes.

### `GET /health`

Returns `200` when the database is reachable, `503` when degraded.

```json
{
  "status": "healthy",
  "timestamp": "2026-08-31T10:00:00.000Z",
  "services": {
    "database": { "status": "up" },
    "api": { "status": "up" }
  }
}
```

### `POST /v1/profiles`

**Request:**

```json
{
  "linkedinUrl": "https://www.linkedin.com/in/example-profile/",
  "refresh": false
}
```

| Field         | Type    | Required | Description                                    |
| ------------- | ------- | -------- | ---------------------------------------------- |
| `linkedinUrl` | string  | Yes      | Full LinkedIn profile URL (`/in/{identifier}`) |
| `refresh`     | boolean | No       | Bypass cache (default `false`)                 |

**Status codes:**

| Code  | Condition                                |
| ----- | ---------------------------------------- |
| `200` | Cache hit, or existing profile refreshed |
| `201` | First-time fetch stored                  |
| `400` | Validation, invalid URL, or SSRF block   |
| `401` | LinkedIn auth failure                    |
| `403` | Profile access denied                    |
| `404` | Profile not found on LinkedIn            |
| `429` | Rate limit (API or LinkedIn)             |
| `502` | Unusable LinkedIn response               |
| `503` | Database unreachable (`/health` only)    |

### `GET /v1/profiles/:publicIdentifier`

Returns the latest stored profile. `metadata.cacheHit` is always `true`.

| Code  | Condition                 |
| ----- | ------------------------- |
| `200` | Profile found             |
| `400` | Invalid identifier format |
| `404` | No stored profile         |

### Error format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "requestId": "uuid",
    "details": []
  }
}
```

`details` appears only on `VALIDATION_ERROR`.

| Status | Code                     | Cause                               |
| ------ | ------------------------ | ----------------------------------- |
| 400    | `VALIDATION_ERROR`       | Invalid request body                |
| 400    | `INVALID_LINKEDIN_URL`   | URL fails validation                |
| 400    | `INVALID_IDENTIFIER`     | Path param fails validation         |
| 400    | `SSRF_PROTECTION`        | URL blocked by SSRF check           |
| 401    | `LINKEDIN_AUTH_FAILURE`  | LinkedIn session expired            |
| 403    | `LINKEDIN_ACCESS_DENIED` | Profile is private                  |
| 404    | `PROFILE_NOT_FOUND`      | Profile not found                   |
| 404    | `NOT_FOUND`              | Unknown route                       |
| 429    | `RATE_LIMIT_EXCEEDED`    | Rate limit hit                      |
| 500    | `INTERNAL_SERVER_ERROR`  | Unhandled server error              |
| 502    | `UPSTREAM_ERROR`         | LinkedIn returned unusable response |

### Response schema (`data`)

Normalized profile fields returned when available from upstream:

- `publicIdentifier`, `linkedinUrl`
- `name` (`first`, `last`, `full`)
- `headline`, `location` (`city`, `region`, `country`, `displayName`)
- `about`, `profileImage` (`url`, `width`, `height`)
- `experience[]`, `education[]`, `skills[]`, `certifications[]`, `languages[]`
- `metadata` (`fetchedAt`, `source: "linkedin-direct-http"`, `cacheHit`, `partial`)

Unavailable scalar fields return `null`. Unavailable collections return `[]`. `metadata.partial` is `true` when core fields are missing.

When a fresh fetch fails but a prior successful record exists, the database record is **not** overwritten. The API still returns the error to the caller.

### Curl examples

```bash
curl http://localhost:3000/health

curl -X POST http://localhost:3000/v1/profiles \
  -H "Content-Type: application/json" \
  -d '{"linkedinUrl": "https://www.linkedin.com/in/example-profile/"}'

curl -X POST http://localhost:3000/v1/profiles \
  -H "Content-Type: application/json" \
  -d '{"linkedinUrl": "https://www.linkedin.com/in/example-profile/", "refresh": true}'

curl http://localhost:3000/v1/profiles/example-profile
```

---

## 6. Choosing a variant

| Choose `postgres-api` if…                                            | Choose `mongo-api` if…                               |
| -------------------------------------------------------------------- | ---------------------------------------------------- |
| You want SQL, JSONB, and explicit TypeORM migrations                 | You prefer MongoDB / Mongoose with schema-at-startup |
| You deploy on Render with managed PostgreSQL (blueprint includes DB) | You use MongoDB Atlas or self-hosted MongoDB         |
| You need `migrate:generate` / `migrate:revert` workflow              | You want zero migration step for local dev           |

Both modules share the same LinkedIn client, parser, validation, and API contract.

---

## 7. Prerequisites

- **Node.js** 24+ and **npm** 9+
- Valid LinkedIn session cookies (`li_at`, `JSESSIONID`) — copy from browser DevTools → Application → Cookies → `linkedin.com`
- **postgres-api:** PostgreSQL 14+ (local, Docker, or Render managed)
- **mongo-api:** MongoDB 7+ (local, Docker, or Atlas)

---

## 8. Quick start

### postgres-api

```bash
cd postgres-api
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL and LinkedIn cookies

createdb linkedin_profile_api   # or use Docker Compose
npm run migrate
npm run dev
```

API: `http://localhost:3000`

### mongo-api

```bash
cd mongo-api
npm install
cp .env.example .env
# Edit .env — set MONGODB_URI and LinkedIn cookies

npm run dev
```

API: `http://localhost:3000`

---

## 9. Docker Compose

### postgres-api

Postgres runs on an internal network only (port 5432 is not exposed to the host). Migrations run automatically via `docker-entrypoint.sh` before the server starts.

```bash
cd postgres-api
cp .env.example .env
# Set LINKEDIN_LI_AT and LINKEDIN_JSESSIONID

docker compose up --build
curl http://localhost:3000/health
```

`DATABASE_URL` is overridden to `postgresql://postgres:postgres@postgres:5432/linkedin_profile_api` inside the container.

### mongo-api

```bash
cd mongo-api
cp .env.example .env
# Set LINKEDIN_LI_AT and LINKEDIN_JSESSIONID

docker compose up --build
curl http://localhost:3000/health
```

`MONGODB_URI` is overridden to `mongodb://mongo:27017/linkedin_profile_api` inside the container.

---

## 10. Database

### postgres-api (PostgreSQL + TypeORM)

**Tables:**

| Table             | Purpose                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `profiles`        | Normalized profile JSONB, cache expiry, content hash, source status |
| `profile_fetches` | Audit log of fetch outcomes (no secrets or raw upstream payloads)   |

**Indexes:** unique on `public_identifier`; indexed on `cache_expires_at`, `fetched_at`.

**Migration commands:**

```bash
npm run migrate              # Run pending migrations (development)
npm run migrate:revert       # Rollback last migration
npm run migrate:generate     # Generate migration from entity changes
npm run migrate:show         # Show migration status
npm run migrate:prod         # Run migrations against compiled dist/ (production)
```

### mongo-api (MongoDB + Mongoose)

**Collections:**

| Collection        | Purpose                                                |
| ----------------- | ------------------------------------------------------ |
| `profiles`        | Same fields as postgres variant (profileData as Mixed) |
| `profile_fetches` | Audit log                                              |

Indexes are defined in `src/db/models/` and created at startup via `createIndexes()`. No SQL migrations.

---

## 11. Development commands

Run from within the chosen module directory:

```bash
npm run dev            # Start with hot reload (tsx --watch)
npm test               # Jest test suite (--runInBand)
npm run test:coverage  # Tests with coverage report
npm run lint           # ESLint
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier
npm run typecheck      # tsc --noEmit
npm run build          # Compile to dist/
npm start              # Run compiled output (node dist/server.js)
```

**Diagnostic script** (requires live LinkedIn credentials):

```bash
npx tsx scripts/capture-raw.ts <publicIdentifier>
# Saves raw JSON to /tmp/linkedin_raw_<identifier>.json
```

---

## 12. CI pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on push to `main`/`develop` and pull requests to `main`.

Matrix strategy runs independently for `postgres-api` and `mongo-api`:

| Step      | Command                         |
| --------- | ------------------------------- |
| Install   | `npm ci`                        |
| Lint      | `npm run lint`                  |
| Typecheck | `npm run typecheck`             |
| Test      | `npm test -- --passWithNoTests` |
| Build     | `npm run build`                 |

Environment: Node.js 24, `NODE_ENV=test`. A PostgreSQL 16 service container is provisioned for the workflow. Tests mock the database and LinkedIn provider, so no live LinkedIn credentials are required in CI.

---

## 13. Deployment

Each module includes a `render.yaml` blueprint:

| Module         | Render service name             | Database                                                                                 |
| -------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| `postgres-api` | `linkedin-profile-api-postgres` | Managed PostgreSQL (`linkedin-profile-api-db`); `preDeployCommand: npm run migrate:prod` |
| `mongo-api`    | `linkedin-profile-api-mongo`    | External MongoDB Atlas (`MONGODB_URI` set manually — Render has no managed MongoDB)      |

Both blueprints use `rootDir` pointing to the module subdirectory, `buildCommand: npm ci --include=dev && npm run build`, and `healthCheckPath: /health`.

For VPS deployment:

```bash
npm ci && npm run build
# postgres-api only:
npm run migrate:prod
pm2 start dist/server.js --name linkedin-api
```

Place Nginx or another reverse proxy in front for TLS termination.

---

## 14. LinkedIn direct-HTTP integration

### Voyager endpoint

```
GET https://www.linkedin.com/voyager/api/identity/dash/profiles
  ?q=memberIdentity
  &memberIdentity={publicIdentifier}
  &decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-86
```

The `FullProfileWithEntities-86` decoration returns profile, experience, education, skills, certifications, and languages in one response.

`getSkillsEndpoint()` in `endpoints.ts` exists for a separate skills call but is **not used** — skills are parsed from the main response.

### Authentication headers

```
Cookie: li_at=<value>; JSESSIONID="ajax:<value>"
Csrf-Token: ajax:<value>
X-RestLi-Protocol-Version: 2.0.0
Accept: application/vnd.linkedin.normalized+json+2.1
```

Optional session cookies (`bcookie`, `bscookie`, `lidc`, `__cf_bm`, etc.) improve session stability.

### HTTP client behavior

- **undici** with HTTP/2 (`allowH2: true`)
- Chrome-compatible TLS cipher suite ordering
- Manual decompression (gzip, deflate, brotli)
- Configurable timeout (default 25 s), retry (default 0), and serial throttle (default 8 s + 0–3 s jitter)
- Retries on HTTP 5xx and network errors only — no retry on 401, 403, 404, or 429
- Login page detection via `isLoginPage()` in `endpoints.ts`

### Parser

LinkedIn normalized JSON stores entities in `included[]`. The profile is found by `$type` suffix `.identity.profile.Profile`. Dates use `dateRange.start` / `dateRange.end`. Location resolves via `geoLocation['*geo']` URN reference.

### Environment variables (shared)

See `.env.example` in each module. Key variables:

| Variable                  | Required (prod)    | Default                                          | Description                        |
| ------------------------- | ------------------ | ------------------------------------------------ | ---------------------------------- |
| `PORT`                    | No                 | `3000`                                           | HTTP port                          |
| `NODE_ENV`                | No                 | `development`                                    | Environment                        |
| `DATABASE_URL`            | Yes (postgres-api) | local postgres URL                               | PostgreSQL connection string       |
| `MONGODB_URI`             | Yes (mongo-api)    | `mongodb://localhost:27017/linkedin_profile_api` | MongoDB connection string          |
| `LINKEDIN_LI_AT`          | Yes                | —                                                | `li_at` session cookie             |
| `LINKEDIN_JSESSIONID`     | Yes                | —                                                | `JSESSIONID` cookie                |
| `LINKEDIN_MIN_DELAY_MS`   | No                 | `8000`                                           | Minimum gap between LinkedIn calls |
| `LINKEDIN_MAX_JITTER_MS`  | No                 | `3000`                                           | Random jitter on throttle delay    |
| `LINKEDIN_TIMEOUT_MS`     | No                 | `25000`                                          | Request timeout                    |
| `LINKEDIN_RETRY_MAX`      | No                 | `0`                                              | Retries on 5xx / network errors    |
| `PROFILE_CACHE_TTL_HOURS` | No                 | `24`                                             | Cache TTL                          |
| `RATE_LIMIT_WINDOW_MS`    | No                 | `60000`                                          | Rate limit window                  |
| `RATE_LIMIT_MAX_REQUESTS` | No                 | `20`                                             | Max requests per window            |
| `CORS_ALLOWED_ORIGIN`     | No                 | `*`                                              | Allowed CORS origin                |

---

## 15. Security measures

| Measure               | Implementation                                                                       |
| --------------------- | ------------------------------------------------------------------------------------ |
| Input validation      | Zod on request bodies and path params                                                |
| URL allowlisting      | `linkedin.com` / `www.linkedin.com` only                                             |
| SSRF protection       | DNS checked against private IP ranges                                                |
| Secure headers        | Helmet                                                                               |
| CORS                  | Configurable origin                                                                  |
| Rate limiting         | `express-rate-limit`                                                                 |
| Secret redaction      | Winston redacts cookies and tokens                                                   |
| Credentials           | Environment variables only                                                           |
| Parameterized queries | TypeORM / Mongoose ODM                                                               |
| Graceful shutdown     | SIGTERM/SIGINT closes database connection                                            |
| Audit logging         | `profile_fetches` stores outcome metadata only — no secrets or raw upstream payloads |

---

## 16. Known limitations

1. Session cookies expire or are invalidated by LinkedIn anti-bot systems.
2. LinkedIn enforces undocumented rate limits; excessive use may trigger 429 or session invalidation.
3. Privacy settings may restrict visible fields (`metadata.partial: true`).
4. Voyager endpoint paths and decoration IDs can change without notice.
5. Visible data depends on the authenticated account's connection to the target profile.
6. Contact info and recommendations are not returned.
7. CAPTCHA or email challenges invalidate the session (returns 401).
8. A failed refresh returns an error even when stale cache exists in the database — the cache is preserved but not served as a fallback response.

---

## 17. Ethical and legal constraints

Use must comply with [LinkedIn's User Agreement](https://www.linkedin.com/legal/user-agreement). Do not use this API for mass scraping or unauthorized contact databases. Credentials must not be committed to version control.

This tool only accesses data the authenticated session is permitted to view.

---

## 18. Module documentation

For variant-specific setup, environment variables, deployment steps, and extended API examples, see:

- **[postgres-api/README.md](postgres-api/README.md)** — PostgreSQL + TypeORM implementation
- **[mongo-api/README.md](mongo-api/README.md)** — MongoDB + Mongoose implementation
