/**
 * LinkedIn HTTP client — built on undici instead of Axios.
 *
 * WHY undici?
 * LinkedIn's Akamai Bot Manager fingerprints every TLS connection. Two key
 * signals it uses to distinguish real browsers from bots are:
 *
 *  1. ALPN negotiation — Chrome always advertises "h2" (HTTP/2) in its TLS
 *     ClientHello. Node.js + Axios negotiates HTTP/1.1 only; LinkedIn sees
 *     "ALPN: false" and immediately flags the request as non-browser.
 *
 *  2. TLS cipher suite ordering — Chrome presents a specific ordered list of
 *     cipher suites in its ClientHello (the JA3 fingerprint). Node.js + OpenSSL
 *     presents a different list. Akamai whitelists known browser JA3 hashes.
 *
 * undici solves both:
 *  • allowH2: true   → sends the h2 ALPN token in the TLS ClientHello
 *  • custom ciphers  → reorders OpenSSL's cipher list to match Chrome 120
 *  • connection reuse → persistent HTTP/2 session, just like a browser tab
 *
 * With these changes the TLS handshake and connection look indistinguishable
 * from Chrome, and LinkedIn's bot detection no longer flags the session.
 */
import zlib from 'zlib';
import { promisify } from 'util';
import { Agent, request as undiciRequest, errors as undiciErrors } from 'undici';
import type { Dispatcher } from 'undici';
import { config } from '../../config/index.js';
import { buildLinkedInHeaders, hasLinkedInCredentials } from './auth.js';
import { isLoginPage } from './endpoints.js';
import { linkedInThrottle } from './throttle.js';
import { logger } from '../../utils/logger.js';
import { FetchResult } from './types.js';

const CHROME_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA',
].join(':');

function createLinkedInAgent(): Agent {
  return new Agent({
    allowH2: true,
    connect: {
      ciphers: CHROME_CIPHERS,
      honorCipherOrder: false,
      minVersion: 'TLSv1.2',
      ALPNProtocols: ['h2', 'http/1.1'],
    },
    connections: 2,
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 300_000,
  });
}

let _agent: Agent | null = null;

function getAgent(): Agent {
  if (!_agent) _agent = createLinkedInAgent();
  return _agent;
}

const gunzipAsync = promisify(zlib.gunzip);
const inflateAsync = promisify(zlib.inflate);
const brotliAsync = promisify(zlib.brotliDecompress);

async function decompressBody(buffer: Buffer, contentEncoding: string): Promise<Buffer> {
  const enc = contentEncoding.toLowerCase();
  if (enc.includes('br')) return brotliAsync(buffer);
  if (enc.includes('gzip')) return gunzipAsync(buffer);
  if (enc.includes('deflate')) return inflateAsync(buffer);
  return buffer;
}

export class LinkedInAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'LinkedInAuthError'; }
}
export class LinkedInNotFoundError extends Error {
  constructor(message: string) { super(message); this.name = 'LinkedInNotFoundError'; }
}
export class LinkedInForbiddenError extends Error {
  constructor(message: string) { super(message); this.name = 'LinkedInForbiddenError'; }
}
export class LinkedInRateLimitError extends Error {
  constructor(message: string) { super(message); this.name = 'LinkedInRateLimitError'; }
}
export class LinkedInBadResponseError extends Error {
  constructor(message: string) { super(message); this.name = 'LinkedInBadResponseError'; }
}
export class LinkedInTimeoutError extends Error {
  constructor(message: string) { super(message); this.name = 'LinkedInTimeoutError'; }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function getSetCookieString(headers: Dispatcher.ResponseData['headers']): string {
  const sc = headers['set-cookie'];
  if (!sc) return '';
  if (Array.isArray(sc)) return sc.join(' ');
  return String(sc);
}

function getHeader(headers: Dispatcher.ResponseData['headers'], name: string): string {
  const val = headers[name];
  if (!val) return '';
  return Array.isArray(val) ? val.join(', ') : String(val);
}

export async function fetchFromLinkedIn(url: string, profileIdentifier = ''): Promise<unknown> {
  if (!hasLinkedInCredentials()) {
    throw new LinkedInAuthError('LinkedIn credentials not configured');
  }

  return linkedInThrottle.throttle(async () => {
    const headers = {
      ...buildLinkedInHeaders(profileIdentifier),
      'Accept-Encoding': 'gzip, deflate, br',
    };

    const maxAttempts = config.linkedin.retryMaxAttempts + 1;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startTime = Date.now();
      try {
        logger.debug(`LinkedIn API request attempt ${attempt}/${maxAttempts}`, {
          url: url.substring(0, 100),
          profileIdentifier,
        });

        const response = await undiciRequest(url, {
          method: 'GET',
          headers,
          dispatcher: getAgent(),
        });

        const duration = Date.now() - startTime;
        logger.debug('LinkedIn API response', { status: response.statusCode, durationMs: duration });

        if (response.statusCode === 401) {
          await response.body.dump();
          throw new LinkedInAuthError('LinkedIn authentication failed: invalid or expired session');
        }

        if (response.statusCode === 302) {
          const setCookies = getSetCookieString(response.headers);
          await response.body.dump();

          if (setCookies.includes('li_at=delete me')) {
            throw new LinkedInAuthError('LinkedIn session expired: credentials need to be refreshed');
          }

          const location = getHeader(response.headers, 'location');
          if (location.startsWith('https://www.linkedin.com')) {
            logger.debug('Following benign LinkedIn 302 redirect', { location: location.substring(0, 100) });
            const redirectResponse = await undiciRequest(location, {
              method: 'GET',
              headers,
              dispatcher: getAgent(),
            });
            Object.assign(response, redirectResponse);
          } else {
            throw new LinkedInBadResponseError(`Unexpected LinkedIn redirect to: ${location}`);
          }
        }

        if (response.statusCode === 403) {
          await response.body.dump();
          throw new LinkedInForbiddenError('LinkedIn access denied: profile is private or forbidden');
        }

        if (response.statusCode === 404) {
          await response.body.dump();
          throw new LinkedInNotFoundError('LinkedIn profile not found');
        }

        if (response.statusCode === 429) {
          await response.body.dump();
          throw new LinkedInRateLimitError('LinkedIn rate limit exceeded');
        }

        if (response.statusCode >= 500) {
          await response.body.dump();
          const err = new Error(`LinkedIn upstream error: HTTP ${response.statusCode}`);
          if (attempt < maxAttempts) {
            lastError = err;
            const delay = config.linkedin.retryDelayMs * 2 ** (attempt - 1);
            logger.warn(`LinkedIn transient error, retrying in ${delay}ms`, { attempt, status: response.statusCode });
            await sleep(delay);
            continue;
          }
          throw err;
        }

        const rawBuffer = Buffer.from(await response.body.arrayBuffer());
        const contentEncoding = getHeader(response.headers, 'content-encoding');
        const bodyBuffer = await decompressBody(rawBuffer, contentEncoding);
        const bodyText = bodyBuffer.toString('utf8');

        const contentType = getHeader(response.headers, 'content-type');
        if (!contentType.includes('json') && !contentType.includes('javascript')) {
          if (isLoginPage(bodyText)) {
            throw new LinkedInAuthError('LinkedIn redirected to login page: session expired');
          }
          throw new LinkedInBadResponseError(`Unexpected content-type from LinkedIn: ${contentType}`);
        }

        if (response.statusCode === 200) {
          if (isLoginPage(bodyText)) {
            throw new LinkedInAuthError('LinkedIn returned login page: session expired');
          }
          try {
            return JSON.parse(bodyText);
          } catch {
            throw new LinkedInBadResponseError('LinkedIn returned unparseable JSON');
          }
        }

        throw new LinkedInBadResponseError(`Unexpected HTTP status: ${response.statusCode}`);
      } catch (err) {
        if (
          err instanceof LinkedInAuthError ||
          err instanceof LinkedInForbiddenError ||
          err instanceof LinkedInNotFoundError ||
          err instanceof LinkedInRateLimitError
        ) {
          throw err;
        }

        if (err instanceof undiciErrors.ConnectTimeoutError || err instanceof undiciErrors.HeadersTimeoutError || err instanceof undiciErrors.BodyTimeoutError) {
          throw new LinkedInTimeoutError(`LinkedIn request timed out after ${config.linkedin.requestTimeoutMs}ms`);
        }

        if (attempt < maxAttempts) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const delay = config.linkedin.retryDelayMs * 2 ** (attempt - 1);
          logger.warn(`LinkedIn error, retrying in ${delay}ms`, { attempt, error: lastError.message });
          await sleep(delay);
          continue;
        }

        throw err;
      }
    }

    throw lastError ?? new Error('LinkedIn fetch failed after retries');
  });
}

export function classifyFetchError(err: unknown): Omit<FetchResult, 'profile' | 'durationMs'> {
  if (err instanceof LinkedInAuthError) return { outcome: 'auth_failure', httpStatus: 401, errorCategory: 'auth_failure' };
  if (err instanceof LinkedInForbiddenError) return { outcome: 'forbidden', httpStatus: 403, errorCategory: 'forbidden' };
  if (err instanceof LinkedInNotFoundError) return { outcome: 'not_found', httpStatus: 404, errorCategory: 'not_found' };
  if (err instanceof LinkedInRateLimitError) return { outcome: 'rate_limited', httpStatus: 429, errorCategory: 'rate_limited' };
  if (err instanceof LinkedInTimeoutError) return { outcome: 'timeout', httpStatus: null, errorCategory: 'timeout' };
  if (err instanceof LinkedInBadResponseError) return { outcome: 'bad_response', httpStatus: null, errorCategory: 'bad_response' };
  return { outcome: 'error', httpStatus: null, errorCategory: 'unexpected_error' };
}
