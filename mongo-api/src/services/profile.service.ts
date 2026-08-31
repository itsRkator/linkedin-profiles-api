import { validateAndParseLinkedInUrl } from '../utils/urlValidator.js';
import { assertNotSSRF } from '../utils/ssrf.js';
import {
  findByPublicIdentifier,
  isProfileCacheValid,
  upsertProfile,
  recordProfileFetch,
  getLatestProfile,
  StoredProfile,
} from '../repositories/profile.repository.js';
import { linkedInProvider } from './linkedin/provider.js';
import { NormalizedProfile } from './linkedin/types.js';
import { logger } from '../utils/logger.js';

export interface FetchProfileRequest {
  linkedinUrl: string;
  refresh?: boolean;
}

export interface FetchProfileResponse {
  data: NormalizedProfile;
  statusCode: number;
}

export class ProfileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileNotFoundError';
  }
}

export class LinkedInAuthenticationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'LinkedInAuthenticationError';
    this.statusCode = statusCode;
  }
}

export class LinkedInAccessError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = 'LinkedInAccessError';
    this.statusCode = statusCode;
  }
}

export class LinkedInRateLimitServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 429) {
    super(message);
    this.name = 'LinkedInRateLimitServiceError';
    this.statusCode = statusCode;
  }
}

export class LinkedInUpstreamError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'LinkedInUpstreamError';
    this.statusCode = statusCode;
  }
}

function storedToProfile(stored: StoredProfile, cacheHit: boolean): NormalizedProfile {
  const profile = stored.profileData;
  return {
    ...profile,
    metadata: {
      ...profile.metadata,
      cacheHit,
      fetchedAt: stored.fetchedAt.toISOString(),
    },
  };
}

export async function fetchProfile(request: FetchProfileRequest): Promise<FetchProfileResponse> {
  const { linkedinUrl, refresh = false } = request;

  const { publicIdentifier, normalizedUrl } = validateAndParseLinkedInUrl(linkedinUrl);

  await assertNotSSRF(normalizedUrl);

  const existing = await findByPublicIdentifier(publicIdentifier);

  if (existing && !refresh) {
    const isValid = isProfileCacheValid(existing);
    if (isValid) {
      logger.info('Returning cached profile', { publicIdentifier });

      await recordProfileFetch({
        publicIdentifier,
        outcome: 'success',
        durationMs: null,
        errorCategory: null,
        httpStatus: 200,
        isCacheHit: true,
      });

      return {
        data: storedToProfile(existing, true),
        statusCode: 200,
      };
    }
  }

  logger.info('Fetching fresh profile from LinkedIn', { publicIdentifier, refresh });

  const fetchResult = await linkedInProvider.fetchProfile(publicIdentifier, normalizedUrl);

  await recordProfileFetch({
    publicIdentifier,
    outcome: fetchResult.outcome,
    durationMs: fetchResult.durationMs,
    errorCategory: fetchResult.errorCategory,
    httpStatus: fetchResult.httpStatus,
    isCacheHit: false,
  });

  if (fetchResult.outcome !== 'success' || !fetchResult.profile) {
    if (existing?.sourceStatus === 'success') {
      logger.warn('LinkedIn fetch failed; stale cache preserved', {
        publicIdentifier,
        outcome: fetchResult.outcome,
      });

      switch (fetchResult.outcome) {
        case 'auth_failure':
          throw new LinkedInAuthenticationError(
            'LinkedIn authentication failed. Please update your session credentials.',
          );
        case 'not_found':
          throw new ProfileNotFoundError(`LinkedIn profile "${publicIdentifier}" was not found`);
        case 'forbidden':
          throw new LinkedInAccessError(
            `Access to LinkedIn profile "${publicIdentifier}" is forbidden`,
          );
        case 'rate_limited':
          throw new LinkedInRateLimitServiceError(
            'LinkedIn rate limit reached. Please try again later.',
          );
        default:
          throw new LinkedInUpstreamError(
            `LinkedIn returned an unusable response (${fetchResult.errorCategory ?? 'unknown'})`,
          );
      }
    }

    switch (fetchResult.outcome) {
      case 'auth_failure':
        throw new LinkedInAuthenticationError(
          'LinkedIn authentication failed. Please update your session credentials.',
        );
      case 'not_found':
        throw new ProfileNotFoundError(`LinkedIn profile "${publicIdentifier}" was not found`);
      case 'forbidden':
        throw new LinkedInAccessError(
          `Access to LinkedIn profile "${publicIdentifier}" is forbidden`,
        );
      case 'rate_limited':
        throw new LinkedInRateLimitServiceError(
          'LinkedIn rate limit reached. Please try again later.',
        );
      default:
        throw new LinkedInUpstreamError(
          `LinkedIn returned an unusable response (${fetchResult.errorCategory ?? 'unknown'})`,
        );
    }
  }

  const stored = await upsertProfile(fetchResult.profile);

  logger.info('Profile stored successfully', { publicIdentifier });

  return {
    data: storedToProfile(stored, false),
    statusCode: existing ? 200 : 201,
  };
}

export async function getStoredProfile(publicIdentifier: string): Promise<NormalizedProfile> {
  const stored = await getLatestProfile(publicIdentifier);
  if (!stored) {
    throw new ProfileNotFoundError(
      `No stored profile found for identifier "${publicIdentifier}"`,
    );
  }
  return storedToProfile(stored, true);
}
