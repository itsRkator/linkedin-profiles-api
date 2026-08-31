# LinkedIn Profiles API

REST API that fetches LinkedIn profile data via direct HTTP requests, normalizes the response into structured JSON, and caches results in PostgreSQL.

No browser automation is used. All LinkedIn communication happens through backend HTTP calls to the Voyager API.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service and database health check |
| `POST` | `/v1/profiles` | Fetch and cache a profile by LinkedIn URL |
| `GET` | `/v1/profiles/:publicIdentifier` | Return a previously stored profile |

A Postman collection is included: `LinkedIn_Profile_API.postman_collection.json`.

## Architecture

```
Client
  → Express (Helmet, CORS, rate limit, request ID, logger)
  → Controller (Zod validation)
  → ProfileService
      → URL validation + SSRF check
      → Cache lookup (PostgreSQL via TypeORM)
      → LinkedInProfileProvider
          → throttle (serial, paced requests)
          → client (undici, HTTP/2, Chrome TLS fingerprint)
          → parser (normalized JSON → NormalizedProfile)
      → ProfileRepository.upsertProfile()
  → JSON response
```

### Layer responsibilities

| Layer | Role |
|-------|------|
| `controllers/` | HTTP request/response handling |
| `services/profile.service.ts` | Orchestration: cache, fetch, error mapping |
| `services/linkedin/provider.ts` | Provider interface; wraps fetch + parse |
| `services/linkedin/client.ts` | undici HTTP client with retry and decompression |
| `services/linkedin/parser.ts` | Maps Voyager `normalized+json` to `NormalizedProfile` |
| `services/linkedin/throttle.ts` | Serial request queue with configurable delay + jitter |
| `repositories/profile.repository.ts` | TypeORM data access |
| `db/entities/` | TypeORM entity definitions |
| `db/migrations/` | Schema migrations |

## Repository structure

```
src/
├── app.ts
├── server.ts
├── config/index.ts
├── controllers/
├── db/
│   ├── data-source.ts
│   ├── index.ts
│   ├── entities/
│   │   ├── Profile.entity.ts
│   │   └── ProfileFetch.entity.ts
│   └── migrations/
│       ├── 1725100000000-CreateProfiles.ts
│       └── 1725100000001-CreateProfileFetches.ts
├── middleware/
├── repositories/profile.repository.ts
├── routes/
├── services/
│   ├── profile.service.ts
│   └── linkedin/
│       ├── auth.ts
│       ├── client.ts
│       ├── endpoints.ts
│       ├── parser.ts
│       ├── provider.ts
│       ├── throttle.ts
│       └── types.ts
├── tests/
├── utils/
└── validators/
scripts/capture-raw.ts          # Diagnostic: save raw Voyager response to /tmp/
docker-compose.yml
Dockerfile
render.yaml
```

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm 9+

## Environment variables

See `.env.example` for the full list. Key variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes (prod) | `postgresql://localhost:5432/linkedin_profile_api` | PostgreSQL connection string |
| `LINKEDIN_LI_AT` | Yes | — | LinkedIn session cookie |
| `LINKEDIN_JSESSIONID` | Yes | — | LinkedIn CSRF cookie (include `ajax:` prefix if shown in browser) |
| `LINKEDIN_BCOOKIE` | No | — | Session stability cookie |
| `LINKEDIN_BSCOOKIE` | No | — | Session stability cookie |
| `LINKEDIN_LIDC` | No | — | Datacenter routing cookie |
| `LINKEDIN_LI_RM` | No | — | Remember-me cookie |
| `LINKEDIN_CF_BM` | No | — | Cloudflare bot management cookie |
| `LINKEDIN_MIN_DELAY_MS` | No | `8000` | Minimum gap between LinkedIn API calls |
| `LINKEDIN_MAX_JITTER_MS` | No | `3000` | Random jitter added to the delay |
| `LINKEDIN_TIMEOUT_MS` | No | `25000` | Request timeout (ms) |
| `LINKEDIN_RETRY_MAX` | No | `0` | Retry attempts for transient 5xx errors |
| `LINKEDIN_RETRY_DELAY_MS` | No | `0` | Base delay for exponential backoff |
| `PROFILE_CACHE_TTL_HOURS` | No | `24` | Cache duration |
| `RATE_LIMIT_MAX_REQUESTS` | No | `20` | API rate limit per window |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window (ms) |
| `CORS_ALLOWED_ORIGIN` | No | `*` | Allowed CORS origin |

## Local setup

```bash
git clone <repo-url>
cd linkedin-profiles-api
npm install
cp .env.example .env
# Edit .env — set DATABASE_URL and LinkedIn cookies

createdb linkedin_profile_api
npm run migrate
npm run dev
```

Verify:

```bash
curl http://localhost:3000/health
```

## Docker Compose

Postgres runs on an internal network only (port 5432 is not exposed to the host).

```bash
cp .env.example .env
# Set LINKEDIN_LI_AT and LINKEDIN_JSESSIONID in .env

docker compose up --build
docker compose exec api npm run migrate:prod
curl http://localhost:3000/health
```

The API service overrides `DATABASE_URL` to reach Postgres via the internal hostname `postgres`.

## Database migrations

Migrations are managed by TypeORM.

```bash
npm run migrate              # Run pending migrations (development)
npm run migrate:revert       # Rollback last migration
npm run migrate:generate     # Generate a new migration from entity changes
npm run migrate:show         # Show migration status
npm run migrate:prod         # Run migrations against compiled dist/ (production)
```

Tables created:

- `profiles` — normalized profile JSONB, cache expiry, content hash
- `profile_fetches` — audit log of fetch outcomes (no sensitive data)

## API reference

### `POST /v1/profiles`

```json
{
  "linkedinUrl": "https://www.linkedin.com/in/example-profile/",
  "refresh": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `linkedinUrl` | string | Yes | Full LinkedIn profile URL |
| `refresh` | boolean | No | Bypass cache and fetch fresh data |

Returns `200` on cache hit or refresh, `201` on first fetch.

### `GET /v1/profiles/:publicIdentifier`

Returns the stored profile for the given slug. Responds with `404` if never fetched.

### Error format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "requestId": "uuid"
  }
}
```

| Status | Code | Cause |
|--------|------|-------|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 400 | `INVALID_LINKEDIN_URL` | URL failed validation |
| 401 | `LINKEDIN_AUTH_FAILURE` | LinkedIn session expired |
| 403 | `LINKEDIN_ACCESS_DENIED` | Profile is private |
| 404 | `PROFILE_NOT_FOUND` | Profile not found |
| 429 | `RATE_LIMIT_EXCEEDED` | API rate limit hit |
| 502 | `UPSTREAM_ERROR` | LinkedIn returned unusable response |
| 503 | — | Database unavailable (`/health` only) |

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

## Development commands

```bash
npm run dev            # Start with hot reload (tsx)
npm test               # Run test suite
npm run test:coverage  # Tests with coverage report
npm run lint           # ESLint
npm run lint:fix       # ESLint with auto-fix
npm run format         # Prettier
npm run typecheck      # tsc --noEmit
npm run build          # Compile to dist/
npm start              # Run compiled output
```

## Deployment (Render)

The `render.yaml` blueprint defines a web service and managed PostgreSQL database.

1. Push source to GitHub (exclude `dist/`, `node_modules/`, `.env`).
2. Render Dashboard → New → Blueprint → connect repo.
3. Set secret env vars: `LINKEDIN_LI_AT`, `LINKEDIN_JSESSIONID`, and session cookies.
4. Deploy. Render runs:
   - Build: `npm ci --include=dev && npm run build`
   - Release: `npm run migrate:prod`
   - Start: `npm start`

`DATABASE_URL` is wired automatically from the Render Postgres instance.

## LinkedIn integration

### Voyager endpoint

```
GET https://www.linkedin.com/voyager/api/identity/dash/profiles
  ?q=memberIdentity
  &memberIdentity={publicIdentifier}
  &decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-86
```

### Authentication

Requests require `li_at` and `JSESSIONID` cookies. The CSRF token is derived from `JSESSIONID` and sent as the `Csrf-Token` header.

Additional browser cookies (`bcookie`, `__cf_bm`, etc.) improve session stability. Copy them from DevTools alongside the required cookies.

### HTTP client

LinkedIn requests use [undici](https://undici.nodejs.org/) with HTTP/2 (`allowH2: true`) and a Chrome-compatible TLS cipher suite order. Responses are manually decompressed (gzip, deflate, brotli).

A serial throttle enforces a minimum delay (default 8 s) plus random jitter (default 0–3 s) between consecutive LinkedIn calls.

### Parser

LinkedIn returns `application/vnd.linkedin.normalized+json+2.1`. Profile data lives in the `included[]` array, referenced by URNs. The parser resolves Geo, Company, School, and EmploymentType entities from this array.

Fields unavailable in the upstream response are stored as `null` (scalars) or `[]` (arrays).

### Diagnostic script

```bash
npx tsx scripts/capture-raw.ts <publicIdentifier>
# Saves raw JSON to /tmp/linkedin_raw_<identifier>.json
```

## Security

| Measure | Implementation |
|---------|----------------|
| Input validation | Zod schemas |
| URL allowlisting | `linkedin.com` / `www.linkedin.com` only |
| SSRF protection | DNS resolution checked against private IP ranges |
| HTTP headers | Helmet |
| CORS | Configurable origin |
| Rate limiting | express-rate-limit |
| Secret redaction | Winston logger strips cookie/token fields |
| Credentials | Environment variables only |

## Cache behavior

- Valid cache (within TTL, `sourceStatus === 'success'`) is returned without calling LinkedIn.
- `refresh: true` forces a fresh fetch regardless of cache state.
- On upstream failure, the API returns an error. It does not serve expired cache as a fallback.
- `contentHash` is stored for change detection but is not used for cache invalidation decisions.

## Known limitations

1. LinkedIn session cookies expire and must be refreshed manually.
2. LinkedIn enforces undocumented rate limits; the throttle reduces but does not eliminate session invalidation risk.
3. Private or restricted profiles may return incomplete data (`metadata.partial: true`).
4. Voyager endpoint paths and decoration IDs can change without notice.
5. Contact info, recommendations, and some high-profile account fields are not available through this endpoint.
6. Some nested fields (`employmentType`, logos) depend on LinkedIn including the referenced entity in `included[]`.

## Legal

Use must comply with [LinkedIn's User Agreement](https://www.linkedin.com/legal/user-agreement). Do not use for mass scraping or unauthorized data collection. Credentials must not be committed to version control.

## License

ISC
