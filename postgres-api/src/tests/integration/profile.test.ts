import request from 'supertest';
import { createApp } from '../../app.js';
import * as repo from '../../repositories/profile.repository.js';
import * as ssrfModule from '../../utils/ssrf.js';
import * as db from '../../db/index.js';
import { NormalizedProfile } from '../../services/linkedin/types.js';

jest.mock('../../repositories/profile.repository.js');
jest.mock('../../services/linkedin/provider.js', () => ({
  linkedInProvider: {
    fetchProfile: jest.fn(),
  },
}));
jest.mock('../../utils/ssrf.js');
jest.mock('../../db/index.js');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const mockLinkedInProvider = require('../../services/linkedin/provider.js').linkedInProvider as {
  fetchProfile: jest.Mock;
};
const mockRepo = repo as jest.Mocked<typeof repo>;
const mockSsrf = ssrfModule as jest.Mocked<typeof ssrfModule>;
const mockDb = db as jest.Mocked<typeof db>;

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

const app = createApp();

beforeEach(() => {
  jest.clearAllMocks();
  mockSsrf.assertNotSSRF.mockResolvedValue(undefined);
  mockRepo.recordProfileFetch.mockResolvedValue(undefined);
  mockDb.checkDatabaseHealth.mockResolvedValue(true);
});

describe('POST /v1/profiles', () => {
  describe('request validation', () => {
    test('returns 400 for missing linkedinUrl', async () => {
      const response = await request(app).post('/v1/profiles').send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('returns 400 for non-URL linkedinUrl', async () => {
      const response = await request(app).post('/v1/profiles').send({ linkedinUrl: 'not-a-url' });

      expect(response.status).toBe(400);
    });

    test('returns 400 for non-LinkedIn URL', async () => {
      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://example.com/in/someone/' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_LINKEDIN_URL');
    });

    test('returns 400 for non-profile LinkedIn URL', async () => {
      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://www.linkedin.com/company/somecompany/' });

      expect(response.status).toBe(400);
    });

    test('returns 400 for empty linkedinUrl', async () => {
      const response = await request(app).post('/v1/profiles').send({ linkedinUrl: '' });

      expect(response.status).toBe(400);
    });

    test('accepts valid request body', async () => {
      const profile = buildMockProfile();
      const stored = buildMockStoredProfile(profile);
      mockRepo.findByPublicIdentifier.mockResolvedValue(stored);
      mockRepo.isProfileCacheValid.mockReturnValue(true);

      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://www.linkedin.com/in/test-user/', refresh: false });

      expect(response.status).toBe(200);
    });
  });

  describe('cache behavior', () => {
    test('returns 200 with cached profile on cache hit', async () => {
      const profile = buildMockProfile();
      const stored = buildMockStoredProfile(profile);
      mockRepo.findByPublicIdentifier.mockResolvedValue(stored);
      mockRepo.isProfileCacheValid.mockReturnValue(true);

      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

      expect(response.status).toBe(200);
      expect(response.body.data.metadata.cacheHit).toBe(true);
    });

    test('fetches fresh on cache miss and returns 201', async () => {
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

      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

      expect(response.status).toBe(201);
    });
  });

  describe('response schema', () => {
    test('returns correct response schema', async () => {
      const profile = buildMockProfile();
      const stored = buildMockStoredProfile(profile);
      mockRepo.findByPublicIdentifier.mockResolvedValue(stored);
      mockRepo.isProfileCacheValid.mockReturnValue(true);

      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('publicIdentifier');
      expect(response.body.data).toHaveProperty('linkedinUrl');
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data.name).toHaveProperty('first');
      expect(response.body.data.name).toHaveProperty('last');
      expect(response.body.data.name).toHaveProperty('full');
      expect(response.body.data).toHaveProperty('headline');
      expect(response.body.data).toHaveProperty('location');
      expect(response.body.data).toHaveProperty('about');
      expect(response.body.data).toHaveProperty('experience');
      expect(response.body.data).toHaveProperty('education');
      expect(response.body.data).toHaveProperty('skills');
      expect(response.body.data).toHaveProperty('certifications');
      expect(response.body.data).toHaveProperty('languages');
      expect(response.body.data).toHaveProperty('metadata');
      expect(response.body.data.metadata).toHaveProperty('fetchedAt');
      expect(response.body.data.metadata).toHaveProperty('source');
      expect(response.body.data.metadata).toHaveProperty('cacheHit');
      expect(response.body.data.metadata).toHaveProperty('partial');
    });
  });

  describe('LinkedIn error responses', () => {
    beforeEach(() => {
      mockRepo.findByPublicIdentifier.mockResolvedValue(null);
    });

    test('returns 401 on auth failure', async () => {
      mockLinkedInProvider.fetchProfile.mockResolvedValue({
        profile: null,
        outcome: 'auth_failure',
        durationMs: 100,
        httpStatus: 401,
        errorCategory: 'auth_failure',
      });

      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('LINKEDIN_AUTH_FAILURE');
    });

    test('returns 403 on forbidden', async () => {
      mockLinkedInProvider.fetchProfile.mockResolvedValue({
        profile: null,
        outcome: 'forbidden',
        durationMs: 100,
        httpStatus: 403,
        errorCategory: 'forbidden',
      });

      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('LINKEDIN_ACCESS_DENIED');
    });

    test('returns 404 on profile not found', async () => {
      mockLinkedInProvider.fetchProfile.mockResolvedValue({
        profile: null,
        outcome: 'not_found',
        durationMs: 100,
        httpStatus: 404,
        errorCategory: 'not_found',
      });

      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('PROFILE_NOT_FOUND');
    });

    test('returns 429 on rate limit', async () => {
      mockLinkedInProvider.fetchProfile.mockResolvedValue({
        profile: null,
        outcome: 'rate_limited',
        durationMs: 100,
        httpStatus: 429,
        errorCategory: 'rate_limited',
      });

      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

      expect(response.status).toBe(429);
    });

    test('returns 502 on bad upstream response', async () => {
      mockLinkedInProvider.fetchProfile.mockResolvedValue({
        profile: null,
        outcome: 'bad_response',
        durationMs: 100,
        httpStatus: null,
        errorCategory: 'bad_response',
      });

      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

      expect(response.status).toBe(502);
    });

    test('returns 502 on timeout', async () => {
      mockLinkedInProvider.fetchProfile.mockResolvedValue({
        profile: null,
        outcome: 'timeout',
        durationMs: 15000,
        httpStatus: null,
        errorCategory: 'timeout',
      });

      const response = await request(app)
        .post('/v1/profiles')
        .send({ linkedinUrl: 'https://www.linkedin.com/in/test-user/' });

      expect(response.status).toBe(502);
    });
  });
});

describe('GET /v1/profiles/:publicIdentifier', () => {
  test('returns stored profile by identifier', async () => {
    const profile = buildMockProfile();
    const stored = buildMockStoredProfile(profile);
    mockRepo.getLatestProfile.mockResolvedValue(stored);

    const response = await request(app).get('/v1/profiles/test-user');

    expect(response.status).toBe(200);
    expect(response.body.data.publicIdentifier).toBe('test-user');
  });

  test('returns 404 when profile not found in DB', async () => {
    mockRepo.getLatestProfile.mockResolvedValue(null);

    const response = await request(app).get('/v1/profiles/unknown-user');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('PROFILE_NOT_FOUND');
  });

  test('returns 400 for too-short identifier', async () => {
    const response = await request(app).get('/v1/profiles/ab');

    expect(response.status).toBe(400);
  });
});

describe('404 for unknown routes', () => {
  test('returns 404 for unknown endpoint', async () => {
    const response = await request(app).get('/unknown-endpoint');

    expect(response.status).toBe(404);
  });
});

describe('Security headers', () => {
  test('returns security headers from helmet', async () => {
    mockDb.checkDatabaseHealth.mockResolvedValue(true);
    const response = await request(app).get('/health');

    expect(response.headers['x-content-type-options']).toBeDefined();
  });
});
