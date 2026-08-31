import {
  fetchProfile,
  ProfileNotFoundError,
  LinkedInAuthenticationError,
  LinkedInAccessError,
  LinkedInRateLimitServiceError,
  LinkedInUpstreamError,
} from '../../services/profile.service.js';
import * as repo from '../../repositories/profile.repository.js';
import * as ssrfModule from '../../utils/ssrf.js';
import { NormalizedProfile } from '../../services/linkedin/types.js';

jest.mock('../../repositories/profile.repository.js');
jest.mock('../../services/linkedin/provider.js', () => ({
  linkedInProvider: {
    fetchProfile: jest.fn(),
  },
}));
jest.mock('../../utils/ssrf.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockLinkedInProvider = require('../../services/linkedin/provider.js').linkedInProvider as {
  fetchProfile: jest.Mock;
};
const mockRepo = repo as jest.Mocked<typeof repo>;
const mockSsrf = ssrfModule as jest.Mocked<typeof ssrfModule>;

function buildMockProfile(override: Partial<NormalizedProfile> = {}): NormalizedProfile {
  return {
    publicIdentifier: 'test-user',
    linkedinUrl: 'https://www.linkedin.com/in/test-user/',
    name: { first: 'Test', last: 'User', full: 'Test User' },
    headline: 'Engineer',
    location: { city: 'SF', region: 'CA', country: 'US', displayName: 'SF, CA, US' },
    about: 'About text',
    profileImage: null,
    experience: [],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
    metadata: {
      fetchedAt: new Date().toISOString(),
      source: 'linkedin-direct-http',
      cacheHit: false,
      partial: false,
    },
    ...override,
  };
}

function buildMockStoredProfile(profile: NormalizedProfile) {
  const now = new Date();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return {
    id: 'mock-uuid',
    publicIdentifier: profile.publicIdentifier,
    linkedinUrl: profile.linkedinUrl,
    profileData: profile,
    contentHash: 'mock-hash',
    sourceStatus: 'success',
    fetchedAt: now,
    cacheExpiresAt: expires,
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSsrf.assertNotSSRF.mockResolvedValue(undefined);
  mockRepo.recordProfileFetch.mockResolvedValue(undefined);
});

describe('fetchProfile - cache behavior', () => {
  test('returns cached profile when cache is valid and refresh is false', async () => {
    const profile = buildMockProfile();
    const stored = buildMockStoredProfile(profile);

    mockRepo.findByPublicIdentifier.mockResolvedValue(stored);
    mockRepo.isProfileCacheValid.mockReturnValue(true);

    const result = await fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

    expect(result.data.metadata.cacheHit).toBe(true);
    expect(mockLinkedInProvider.fetchProfile).not.toHaveBeenCalled();
  });

  test('fetches fresh profile when refresh is true even if cache is valid', async () => {
    const profile = buildMockProfile();
    const stored = buildMockStoredProfile(profile);

    mockRepo.findByPublicIdentifier.mockResolvedValue(stored);
    mockRepo.isProfileCacheValid.mockReturnValue(true);

    const freshProfile = buildMockProfile();
    const freshStored = buildMockStoredProfile(freshProfile);
    mockLinkedInProvider.fetchProfile.mockResolvedValue({
      profile: freshProfile,
      outcome: 'success',
      durationMs: 500,
      httpStatus: 200,
      errorCategory: null,
    });
    mockRepo.upsertProfile.mockResolvedValue(freshStored);

    const result = await fetchProfile({
      linkedinUrl: 'https://www.linkedin.com/in/test-user/',
      refresh: true,
    });

    expect(mockLinkedInProvider.fetchProfile).toHaveBeenCalled();
    expect(result.data.metadata.cacheHit).toBe(false);
  });

  test('fetches from LinkedIn when no cached record exists', async () => {
    mockRepo.findByPublicIdentifier.mockResolvedValue(null);

    const freshProfile = buildMockProfile();
    const freshStored = buildMockStoredProfile(freshProfile);
    mockLinkedInProvider.fetchProfile.mockResolvedValue({
      profile: freshProfile,
      outcome: 'success',
      durationMs: 500,
      httpStatus: 200,
      errorCategory: null,
    });
    mockRepo.upsertProfile.mockResolvedValue(freshStored);

    await fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

    expect(mockLinkedInProvider.fetchProfile).toHaveBeenCalled();
  });

  test('fetches from LinkedIn when cache is expired', async () => {
    const profile = buildMockProfile();
    const stored = buildMockStoredProfile(profile);
    stored.cacheExpiresAt = new Date(Date.now() - 1000);

    mockRepo.findByPublicIdentifier.mockResolvedValue(stored);
    mockRepo.isProfileCacheValid.mockReturnValue(false);

    const freshProfile = buildMockProfile();
    const freshStored = buildMockStoredProfile(freshProfile);
    mockLinkedInProvider.fetchProfile.mockResolvedValue({
      profile: freshProfile,
      outcome: 'success',
      durationMs: 300,
      httpStatus: 200,
      errorCategory: null,
    });
    mockRepo.upsertProfile.mockResolvedValue(freshStored);

    await fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

    expect(mockLinkedInProvider.fetchProfile).toHaveBeenCalled();
  });

  test('does not overwrite good cache when retrieval fails', async () => {
    const profile = buildMockProfile();
    const stored = buildMockStoredProfile(profile);

    mockRepo.findByPublicIdentifier.mockResolvedValue(stored);
    mockRepo.isProfileCacheValid.mockReturnValue(false);

    mockLinkedInProvider.fetchProfile.mockResolvedValue({
      profile: null,
      outcome: 'error',
      durationMs: 300,
      httpStatus: 500,
      errorCategory: 'unexpected_error',
    });

    await expect(
      fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' }),
    ).rejects.toThrow(LinkedInUpstreamError);

    expect(mockRepo.upsertProfile).not.toHaveBeenCalled();
  });
});

describe('fetchProfile - LinkedIn error handling', () => {
  beforeEach(() => {
    mockRepo.findByPublicIdentifier.mockResolvedValue(null);
  });

  test('throws LinkedInAuthenticationError on auth_failure', async () => {
    mockLinkedInProvider.fetchProfile.mockResolvedValue({
      profile: null,
      outcome: 'auth_failure',
      durationMs: 100,
      httpStatus: 401,
      errorCategory: 'auth_failure',
    });

    await expect(
      fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' }),
    ).rejects.toThrow(LinkedInAuthenticationError);
  });

  test('throws ProfileNotFoundError on not_found', async () => {
    mockLinkedInProvider.fetchProfile.mockResolvedValue({
      profile: null,
      outcome: 'not_found',
      durationMs: 100,
      httpStatus: 404,
      errorCategory: 'not_found',
    });

    await expect(
      fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' }),
    ).rejects.toThrow(ProfileNotFoundError);
  });

  test('throws LinkedInAccessError on forbidden', async () => {
    mockLinkedInProvider.fetchProfile.mockResolvedValue({
      profile: null,
      outcome: 'forbidden',
      durationMs: 100,
      httpStatus: 403,
      errorCategory: 'forbidden',
    });

    await expect(
      fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' }),
    ).rejects.toThrow(LinkedInAccessError);
  });

  test('throws LinkedInRateLimitServiceError on rate_limited', async () => {
    mockLinkedInProvider.fetchProfile.mockResolvedValue({
      profile: null,
      outcome: 'rate_limited',
      durationMs: 100,
      httpStatus: 429,
      errorCategory: 'rate_limited',
    });

    await expect(
      fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' }),
    ).rejects.toThrow(LinkedInRateLimitServiceError);
  });

  test('throws LinkedInUpstreamError on timeout', async () => {
    mockLinkedInProvider.fetchProfile.mockResolvedValue({
      profile: null,
      outcome: 'timeout',
      durationMs: 15000,
      httpStatus: null,
      errorCategory: 'timeout',
    });

    await expect(
      fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' }),
    ).rejects.toThrow(LinkedInUpstreamError);
  });

  test('throws LinkedInUpstreamError on bad_response', async () => {
    mockLinkedInProvider.fetchProfile.mockResolvedValue({
      profile: null,
      outcome: 'bad_response',
      durationMs: 100,
      httpStatus: null,
      errorCategory: 'bad_response',
    });

    await expect(
      fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' }),
    ).rejects.toThrow(LinkedInUpstreamError);
  });
});

describe('fetchProfile - URL validation', () => {
  test('throws on invalid LinkedIn URL', async () => {
    await expect(
      fetchProfile({ linkedinUrl: 'https://evil.com/in/someone/' }),
    ).rejects.toThrow();
  });

  test('throws on malformed URL', async () => {
    await expect(fetchProfile({ linkedinUrl: 'not-a-url' })).rejects.toThrow();
  });
});

describe('fetchProfile - persistence', () => {
  test('persists successful profile to database', async () => {
    mockRepo.findByPublicIdentifier.mockResolvedValue(null);

    const freshProfile = buildMockProfile();
    const freshStored = buildMockStoredProfile(freshProfile);
    mockLinkedInProvider.fetchProfile.mockResolvedValue({
      profile: freshProfile,
      outcome: 'success',
      durationMs: 500,
      httpStatus: 200,
      errorCategory: null,
    });
    mockRepo.upsertProfile.mockResolvedValue(freshStored);

    await fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

    expect(mockRepo.upsertProfile).toHaveBeenCalledWith(freshProfile);
  });

  test('records fetch audit log for cache hit', async () => {
    const profile = buildMockProfile();
    const stored = buildMockStoredProfile(profile);

    mockRepo.findByPublicIdentifier.mockResolvedValue(stored);
    mockRepo.isProfileCacheValid.mockReturnValue(true);

    await fetchProfile({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

    expect(mockRepo.recordProfileFetch).toHaveBeenCalledWith(
      expect.objectContaining({ isCacheHit: true }),
    );
  });
});
