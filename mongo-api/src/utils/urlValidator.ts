import { URL } from 'url';

const ALLOWED_HOSTS = ['www.linkedin.com', 'linkedin.com'];
const PROFILE_PATH_PATTERN = /^\/in\/([a-zA-Z0-9\-_%]+)\/?$/;

export interface ParsedLinkedInUrl {
  publicIdentifier: string;
  normalizedUrl: string;
}

export function validateAndParseLinkedInUrl(rawUrl: string): ParsedLinkedInUrl {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new LinkedInUrlError('LinkedIn URL is required');
  }

  const trimmed = rawUrl.trim();

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new LinkedInUrlError(`Invalid URL format: ${trimmed}`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new LinkedInUrlError('LinkedIn URL must use HTTP or HTTPS protocol');
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.includes(host)) {
    throw new LinkedInUrlError(
      `URL host "${host}" is not allowed. Only linkedin.com profiles are supported`,
    );
  }

  const pathname = parsed.pathname.replace(/\/+$/, '') + (parsed.pathname.endsWith('/') ? '/' : '');
  const match = pathname.match(PROFILE_PATH_PATTERN) ?? parsed.pathname.match(PROFILE_PATH_PATTERN);
  if (!match || !match[1]) {
    throw new LinkedInUrlError(
      `URL path "${parsed.pathname}" does not match expected pattern /in/{publicIdentifier}`,
    );
  }

  const rawIdentifier = decodeURIComponent(match[1]);
  const publicIdentifier = rawIdentifier.toLowerCase().replace(/\/$/, '');

  if (publicIdentifier.length < 3 || publicIdentifier.length > 100) {
    throw new LinkedInUrlError(
      `Public identifier "${publicIdentifier}" has invalid length (must be 3-100 characters)`,
    );
  }

  const normalizedUrl = `https://www.linkedin.com/in/${publicIdentifier}/`;

  return { publicIdentifier, normalizedUrl };
}

export class LinkedInUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LinkedInUrlError';
  }
}
