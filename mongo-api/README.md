# LinkedIn Profile API

REST API that accepts a LinkedIn profile URL, fetches data from the Voyager API via direct HTTP, normalizes it, and caches results in MongoDB.

---

## 1. Project overview

The service exposes three endpoints: health check, profile fetch by URL, and profile retrieval by stored identifier. LinkedIn communication uses `undici` with HTTP/2 — no browser automation.

Layered architecture separates routing, validation, business logic, persistence, and the LinkedIn integration behind a `LinkedInProfileProvider` interface.

---

## 2. Feature list

- `POST /v1/profiles` — fetch and cache a profile by LinkedIn URL
- `GET /v1/profiles/:publicIdentifier` — retrieve a stored profile
- `GET /health` — service and MongoDB health check
- LinkedIn URL validation, normalization, and host allowlisting
- SSRF protection via DNS resolution checks
- MongoDB caching with configurable TTL
- Forced refresh via `refresh: true`
- Stale cache preserved (not overwritten) when upstream fetch fails
- Serial LinkedIn request throttling with jitter
- API-level rate limiting
- Structured logs with request IDs and secret redaction
- Graceful shutdown with MongoDB disconnect
- Zod request validation
- Helmet security headers and configurable CORS
- TypeScript strict mode
- Unit and integration tests with mocked LinkedIn provider
- Docker Compose, Render blueprint, GitHub Actions CI

---

## 3. Architecture and request flow

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

| Pattern | Location |
|---|---|
| Layered architecture | routes → controllers → services → repositories |
| Strategy | `LinkedInProfileProvider` / `VoyagerLinkedInProvider` |
| Repository | `profile.repository.ts` |
| Factory | `createApp()` in `app.ts` |
| Middleware chain | request ID, logging, error handling |

---

## 4. Repository structure

```
src/
├── app.ts
├── server.ts
├── config/index.ts
├── controllers/
│   ├── health.controller.ts
│   └── profile.controller.ts
├── db/
│   ├── index.ts
│   └── models/
│       ├── Profile.model.ts
│       └── ProfileFetch.model.ts
├── middleware/
│   ├── errorHandler.ts
│   ├── requestId.ts
│   └── requestLogger.ts
├── repositories/profile.repository.ts
├── routes/
│   ├── health.route.ts
│   ├── index.ts
│   └── profile.route.ts
├── services/
│   ├── linkedin/
│   │   ├── auth.ts
│   │   ├── client.ts
│   │   ├── endpoints.ts
│   │   ├── parser.ts
│   │   ├── provider.ts
│   │   ├── throttle.ts
│   │   └── types.ts
│   └── profile.service.ts
├── tests/
│   ├── fixtures/linkedinProfile.fixture.ts
│   ├── integration/
│   └── unit/
├── utils/
│   ├── hash.ts
│   ├── logger.ts
│   ├── ssrf.ts
│   └── urlValidator.ts
└── validators/profile.validator.ts

scripts/capture-raw.ts
```

---

## 5. Prerequisites

- Node.js 24+
- MongoDB 7+ (local or Atlas)
- npm 9+
- Valid LinkedIn session cookies (`li_at`, `JSESSIONID`)

---

## 6. Environment variables

Copy `.env.example` to `.env`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | HTTP port |
| `NODE_ENV` | No | `development` | `development`, `test`, or `production` |
| `MONGODB_URI` | Yes (prod) | `mongodb://localhost:27017/linkedin_profile_api` | MongoDB connection string |
| `LINKEDIN_LI_AT` | Yes | — | `li_at` session cookie |
| `LINKEDIN_JSESSIONID` | Yes | — | `JSESSIONID` cookie |
| `LINKEDIN_BCOOKIE` | No | — | Session cookie |
| `LINKEDIN_BSCOOKIE` | No | — | Session cookie |
| `LINKEDIN_LIDC` | No | — | Session cookie |
| `LINKEDIN_LI_RM` | No | — | Session cookie |
| `LINKEDIN_LANG` | No | `v=2&lang=en-us` | Session cookie |
| `LINKEDIN_LI_THEME` | No | — | Session cookie |
| `LINKEDIN_LI_THEME_SET` | No | — | Session cookie |
| `LINKEDIN_SDUI_VER` | No | — | Session cookie |
| `LINKEDIN_FID` | No | — | Session cookie |
| `LINKEDIN_AAM_UUID` | No | — | Session cookie |
| `LINKEDIN_GCL_AU` | No | — | Session cookie |
| `LINKEDIN_CF_BM` | No | — | Cloudflare bot-management cookie |
| `LINKEDIN_USER_AGENT` | No | Chrome 120 UA | User-Agent header |
| `LINKEDIN_TIMEOUT_MS` | No | `25000` | undici headers/body timeout |
| `LINKEDIN_RETRY_MAX` | No | `0` | Retries on 5xx / network errors |
| `LINKEDIN_RETRY_DELAY_MS` | No | `0` | Exponential backoff base delay |
| `LINKEDIN_MIN_DELAY_MS` | No | `8000` | Minimum gap between LinkedIn calls |
| `LINKEDIN_MAX_JITTER_MS` | No | `3000` | Random jitter on throttle delay |
| `PROFILE_CACHE_TTL_HOURS` | No | `24` | Cache TTL |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | No | `20` | Max requests per window |
| `CORS_ALLOWED_ORIGIN` | No | `*` | Allowed CORS origin |

Obtain LinkedIn cookies from DevTools → Application → Cookies → `linkedin.com`.

---

## 7. Local setup

```bash
git clone <repo-url>
cd linkedin-profile-api
npm install
cp .env.example .env
# Edit .env with LinkedIn cookies and MongoDB URI

npm run dev
```

API: `http://localhost:3000`

---

## 8. Docker Compose setup

```bash
cp .env.example .env
# Set LINKEDIN_LI_AT and LINKEDIN_JSESSIONID

docker compose up --build
curl http://localhost:3000/health
```

Starts MongoDB 7 and the API. `MONGODB_URI` is overridden to `mongodb://mongo:27017/linkedin_profile_api` inside the container.

---

## 9. Database

MongoDB with Mongoose. No SQL migrations — schemas and indexes are defined in `src/db/models/` and created at startup.

### `profiles` collection

| Field | Type | Description |
|---|---|---|
| `publicIdentifier` | string | Unique canonical identifier |
| `linkedinUrl` | string | Normalized profile URL |
| `profileData` | object | Normalized profile JSON |
| `contentHash` | string | SHA-256 of profile data |
| `sourceStatus` | string | Fetch outcome (`success`) |
| `fetchedAt` | date | Last successful fetch time |
| `cacheExpiresAt` | date | Cache expiry |
| `createdAt` / `updatedAt` | date | Mongoose timestamps |

Indexes: unique on `publicIdentifier`, indexed on `fetchedAt` and `cacheExpiresAt`.

### `profile_fetches` collection

Audit log: `publicIdentifier`, `outcome`, `durationMs`, `errorCategory`, `httpStatus`, `isCacheHit`, `fetchedAt`. No secrets or raw upstream payloads.

---

## 10. API documentation

### `GET /health`

Returns `200` when MongoDB is reachable, `503` when degraded.

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

---

### `POST /v1/profiles`

**Request:**

```json
{
  "linkedinUrl": "https://www.linkedin.com/in/example-profile/",
  "refresh": false
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `linkedinUrl` | string | Yes | Full LinkedIn profile URL (`/in/{identifier}`) |
| `refresh` | boolean | No | Bypass cache (default `false`) |

**Status codes:**

| Code | Condition |
|---|---|
| `200` | Cache hit, or existing profile refreshed |
| `201` | First-time fetch stored |
| `400` | Validation, invalid URL, or SSRF block |
| `401` | LinkedIn auth failure |
| `403` | Profile access denied |
| `404` | Profile not found on LinkedIn |
| `429` | Rate limit (API or LinkedIn) |
| `502` | Unusable LinkedIn response |

**Response schema:**

```json
{
  "data": {
    "publicIdentifier": "example-profile",
    "linkedinUrl": "https://www.linkedin.com/in/example-profile/",
    "name": { "first": "Example", "last": "Person", "full": "Example Person" },
    "headline": "Software Engineer",
    "location": {
      "city": "Bengaluru",
      "region": "Karnataka",
      "country": "India",
      "displayName": "Bengaluru, Karnataka, India"
    },
    "about": "Profile summary",
    "profileImage": { "url": "https://example.invalid/image.jpg", "width": 400, "height": 400 },
    "experience": [{
      "company": "Acme",
      "companyLinkedinUrl": null,
      "title": "Backend Engineer",
      "employmentType": "Full-time",
      "location": "Bengaluru, India",
      "description": null,
      "startDate": { "year": 2023, "month": 4 },
      "endDate": null,
      "isCurrent": true,
      "companyLogoUrl": null
    }],
    "education": [{
      "school": "Example University",
      "degree": "B.Tech",
      "fieldOfStudy": "Computer Science",
      "startDate": { "year": 2018, "month": null },
      "endDate": { "year": 2022, "month": null },
      "description": null,
      "schoolLogoUrl": null
    }],
    "skills": ["Node.js", "TypeScript"],
    "certifications": [{
      "name": "AWS Certified Developer",
      "issuingOrganization": "Amazon Web Services",
      "issueDate": { "year": 2024, "month": 2 },
      "expirationDate": null,
      "credentialId": null,
      "credentialUrl": null
    }],
    "languages": [{ "name": "English", "proficiency": "Native or bilingual" }],
    "metadata": {
      "fetchedAt": "2026-08-31T10:00:00.000Z",
      "source": "linkedin-direct-http",
      "cacheHit": false,
      "partial": false
    }
  }
}
```

Unavailable scalar fields return `null`. Unavailable collections return `[]`. `metadata.partial` is `true` when core fields are missing.

When a fresh fetch fails but a prior successful record exists, the database record is not overwritten. The API still returns the error to the caller.

---

### `GET /v1/profiles/:publicIdentifier`

Returns the latest stored profile. Response body matches the `data` object above. `metadata.cacheHit` is always `true`.

| Code | Condition |
|---|---|
| `200` | Profile found |
| `400` | Invalid identifier format |
| `404` | No stored profile |

---

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

| Status | Code | Cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid request body |
| 400 | `INVALID_LINKEDIN_URL` | URL fails validation |
| 400 | `INVALID_IDENTIFIER` | Path param fails validation |
| 400 | `SSRF_PROTECTION` | URL blocked by SSRF check |
| 401 | `LINKEDIN_AUTH_FAILURE` | LinkedIn session expired |
| 403 | `LINKEDIN_ACCESS_DENIED` | Profile is private |
| 404 | `PROFILE_NOT_FOUND` | Profile not found |
| 404 | `NOT_FOUND` | Unknown route |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit hit |
| 500 | `INTERNAL_SERVER_ERROR` | Unhandled server error |
| 502 | `UPSTREAM_ERROR` | LinkedIn returned unusable response |
| 503 | — | MongoDB unreachable (health only) |

---

## 11. Curl examples

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

Postman collection: `LinkedIn_Profile_API.postman_collection.json`

Diagnostic script:

```bash
npx tsx scripts/capture-raw.ts example-profile
```

---

## 12. Test, lint, format, and typecheck commands

```bash
npm test
npm run test:coverage
npm run lint
npm run lint:fix
npm run format
npm run typecheck
npm run build
npm start
npm run dev
```

Tests use mocked LinkedIn provider and sanitized fixtures — no live LinkedIn traffic required.

---

## 13. Deployment steps for HTTPS

### Render

`render.yaml` is included. Provision MongoDB Atlas and set `MONGODB_URI` plus LinkedIn credentials in the dashboard.

### Railway

Add MongoDB plugin, deploy from GitHub, set environment variables, run `npm start`.

### VPS

```bash
npm ci && npm run build
pm2 start dist/server.js --name linkedin-api
```

Place Nginx or another reverse proxy in front for TLS termination.

---

## 14. Direct HTTP integration approach

### Endpoint

```
GET https://www.linkedin.com/voyager/api/identity/dash/profiles
  ?q=memberIdentity
  &memberIdentity={publicIdentifier}
  &decorationId=com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-86
```

The `FullProfileWithEntities-86` decoration returns profile, experience, education, skills, certifications, and languages in one response.

`getSkillsEndpoint()` in `endpoints.ts` exists for a separate skills call but is not used — skills are parsed from the main response.

### Authentication

```
Cookie: li_at=<value>; JSESSIONID="ajax:<value>"
Csrf-Token: ajax:<value>
X-RestLi-Protocol-Version: 2.0.0
Accept: application/vnd.linkedin.normalized+json+2.1
```

### HTTP client (`undici`)

- HTTP/2 with Chrome-aligned TLS cipher ordering
- Persistent connection pool
- Manual decompression (gzip, deflate, br)
- Configurable timeout, retry, and serial throttle

### Retry policy

Retries on HTTP 5xx and network errors only. No retry on 401, 403, 404, or 429.

### Parser assumptions

LinkedIn normalized JSON stores entities in `included[]`. The profile is found by `$type` suffix `.identity.profile.Profile`. Dates use `dateRange.start` / `dateRange.end`. Location resolves via `geoLocation['*geo']` URN reference.

### Unsupported / uncertain fields

- Contact info (email, phone) — separate endpoint, connection required
- Recommendations — not fetched
- Exact LinkedIn rate-limit thresholds — not published

---

## 15. Security measures

| Measure | Implementation |
|---|---|
| Input validation | Zod on request bodies and path params |
| URL allowlisting | `linkedin.com` / `www.linkedin.com` only |
| SSRF protection | DNS checked against private IP ranges |
| Secure headers | Helmet |
| CORS | Configurable origin |
| Rate limiting | `express-rate-limit` |
| Secret redaction | Winston redacts cookies and tokens |
| Credentials | Environment variables only |
| Parameterized queries | Mongoose ODM |
| Graceful shutdown | SIGTERM/SIGINT closes MongoDB |

---

## 16. Known limitations

1. Session cookies expire or are invalidated by LinkedIn anti-bot systems.
2. LinkedIn enforces undocumented rate limits; excessive use may trigger 429 or session invalidation.
3. Privacy settings may restrict visible fields (`metadata.partial: true`).
4. Voyager endpoint paths and decoration IDs can change without notice.
5. Visible data depends on the authenticated account's connection to the target profile.
6. Contact info and recommendations are not returned.
7. CAPTCHA or email challenges invalidate the session (returns 401).
8. A failed refresh returns an error even when stale cache exists in the database.

---

## 17. Ethical and legal constraints

Use must comply with [LinkedIn's User Agreement](https://www.linkedin.com/legal/user-agreement). Do not use this API for mass scraping or unauthorized contact databases. Credentials must not be committed to version control.

This tool only accesses data the authenticated session is permitted to view.

---

## 18. No browser automation

No Playwright, Puppeteer, Selenium, WebDriver, or headless browsers. All LinkedIn requests are direct backend HTTP calls via `undici`.
