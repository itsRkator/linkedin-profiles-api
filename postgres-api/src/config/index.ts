import 'dotenv/config';

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  nodeEnv: process.env['NODE_ENV'] ?? 'development',

  database: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/linkedin_profile_api',
  },

  linkedin: {
    liAt: process.env['LINKEDIN_LI_AT'] ?? '',
    jsessionId: process.env['LINKEDIN_JSESSIONID'] ?? '',
    bcookie: process.env['LINKEDIN_BCOOKIE'] ?? '',
    bscookie: process.env['LINKEDIN_BSCOOKIE'] ?? '',
    lidc: process.env['LINKEDIN_LIDC'] ?? '',
    liRm: process.env['LINKEDIN_LI_RM'] ?? '',
    lang: process.env['LINKEDIN_LANG'] ?? 'v=2&lang=en-us',
    liTheme: process.env['LINKEDIN_LI_THEME'] ?? '',
    liThemeSet: process.env['LINKEDIN_LI_THEME_SET'] ?? '',
    sduiVer: process.env['LINKEDIN_SDUI_VER'] ?? '',
    fid: process.env['LINKEDIN_FID'] ?? '',
    aamUuid: process.env['LINKEDIN_AAM_UUID'] ?? '',
    gcl_au: process.env['LINKEDIN_GCL_AU'] ?? '',
    cfBm: process.env['LINKEDIN_CF_BM'] ?? '',
    userAgent:
      process.env['LINKEDIN_USER_AGENT'] ??
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    requestTimeoutMs: parseInt(process.env['LINKEDIN_TIMEOUT_MS'] ?? '25000', 10),
    retryMaxAttempts: parseInt(process.env['LINKEDIN_RETRY_MAX'] ?? '0', 10),
    retryDelayMs: parseInt(process.env['LINKEDIN_RETRY_DELAY_MS'] ?? '0', 10),
    minDelayMs: parseInt(process.env['LINKEDIN_MIN_DELAY_MS'] ?? '8000', 10),
    maxJitterMs: parseInt(process.env['LINKEDIN_MAX_JITTER_MS'] ?? '3000', 10),
  },

  cache: {
    ttlHours: parseInt(process.env['PROFILE_CACHE_TTL_HOURS'] ?? '24', 10),
  },

  rateLimit: {
    windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10),
    maxRequests: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] ?? '20', 10),
  },

  cors: {
    allowedOrigin: process.env['CORS_ALLOWED_ORIGIN'] ?? '*',
  },
} as const;

export function validateConfig(): void {
  if (config.nodeEnv === 'production') {
    requireEnv('DATABASE_URL');
    requireEnv('LINKEDIN_LI_AT');
    requireEnv('LINKEDIN_JSESSIONID');
  }
}
