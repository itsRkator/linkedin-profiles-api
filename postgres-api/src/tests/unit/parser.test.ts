import { parseLinkedInProfile } from '../../services/linkedin/parser.js';
import {
  MOCK_VOYAGER_PROFILE_RESPONSE,
  MOCK_EMPTY_PROFILE_RESPONSE,
  MOCK_MINIMAL_PROFILE_RESPONSE,
} from '../fixtures/linkedinProfile.fixture.js';

const PUBLIC_ID = 'jane-doe';
const NORMALIZED_URL = 'https://www.linkedin.com/in/jane-doe/';

describe('parseLinkedInProfile', () => {
  describe('full profile response', () => {
    let profile: ReturnType<typeof parseLinkedInProfile>;

    beforeEach(() => {
      profile = parseLinkedInProfile(MOCK_VOYAGER_PROFILE_RESPONSE, PUBLIC_ID, NORMALIZED_URL);
    });

    test('parses publicIdentifier correctly', () => {
      expect(profile.publicIdentifier).toBe(PUBLIC_ID);
    });

    test('parses linkedinUrl correctly', () => {
      expect(profile.linkedinUrl).toBe(NORMALIZED_URL);
    });

    test('parses first name', () => {
      expect(profile.name.first).toBe('Jane');
    });

    test('parses last name', () => {
      expect(profile.name.last).toBe('Doe');
    });

    test('combines full name', () => {
      expect(profile.name.full).toBe('Jane Doe');
    });

    test('parses headline', () => {
      expect(profile.headline).toBe('Software Engineer at Test Company');
    });

    test('parses location city', () => {
      expect(profile.location.city).toBe('San Francisco');
    });

    test('parses location region', () => {
      expect(profile.location.region).toBe('California');
    });

    test('parses location country', () => {
      expect(profile.location.country).toBe('United States');
    });

    test('parses about/summary', () => {
      expect(profile.about).toContain('Experienced software engineer');
    });

    test('parses profile image with root URL', () => {
      expect(profile.profileImage).not.toBeNull();
      expect(profile.profileImage?.url).toContain('photo400.jpg');
      expect(profile.profileImage?.width).toBe(400);
      expect(profile.profileImage?.height).toBe(400);
    });

    test('parses experience array', () => {
      expect(profile.experience).toHaveLength(1);
      expect(profile.experience[0]?.company).toBe('Test Company');
      expect(profile.experience[0]?.title).toBe('Backend Engineer');
      expect(profile.experience[0]?.employmentType).toBe('Full-time');
      expect(profile.experience[0]?.companyLinkedinUrl).toBe('https://www.linkedin.com/company/test-company/');
      expect(profile.experience[0]?.companyLogoUrl).toContain('logo200.jpg');
      expect(profile.experience[0]?.isCurrent).toBe(true);
      expect(profile.experience[0]?.startDate?.year).toBe(2021);
      expect(profile.experience[0]?.startDate?.month).toBe(3);
    });

    test('parses education array', () => {
      expect(profile.education).toHaveLength(1);
      expect(profile.education[0]?.school).toBe('State University');
      expect(profile.education[0]?.degree).toBe('B.S.');
      expect(profile.education[0]?.fieldOfStudy).toBe('Computer Science');
      expect(profile.education[0]?.schoolLogoUrl).toContain('school200.jpg');
      expect(profile.education[0]?.startDate?.year).toBe(2015);
      expect(profile.education[0]?.endDate?.year).toBe(2019);
    });

    test('parses skills array', () => {
      expect(profile.skills).toEqual(expect.arrayContaining(['Node.js', 'TypeScript', 'PostgreSQL']));
    });

    test('parses certifications array', () => {
      expect(profile.certifications).toHaveLength(1);
      expect(profile.certifications[0]?.name).toBe('Sample Certification');
      expect(profile.certifications[0]?.issuingOrganization).toBe('Sample Authority');
    });

    test('parses languages array', () => {
      expect(profile.languages).toHaveLength(1);
      expect(profile.languages[0]?.name).toBe('English');
    });

    test('sets correct metadata source', () => {
      expect(profile.metadata.source).toBe('linkedin-direct-http');
    });

    test('sets cacheHit to false', () => {
      expect(profile.metadata.cacheHit).toBe(false);
    });

    test('sets partial to false for full profile', () => {
      expect(profile.metadata.partial).toBe(false);
    });

    test('sets fetchedAt as ISO string', () => {
      expect(profile.metadata.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    test('parses about from multiLocaleSummary when summary is absent', () => {
      const response = {
        ...MOCK_VOYAGER_PROFILE_RESPONSE,
        included: MOCK_VOYAGER_PROFILE_RESPONSE.included.map((item) => {
          if (item.$type?.endsWith('.Profile')) {
            return {
              ...item,
              summary: null,
              multiLocaleSummary: { en_US: 'Locale-only summary text.' },
            };
          }
          return item;
        }),
      };
      const parsed = parseLinkedInProfile(response, PUBLIC_ID, NORMALIZED_URL);
      expect(parsed.about).toBe('Locale-only summary text.');
    });
  });

  describe('empty profile response', () => {
    let profile: ReturnType<typeof parseLinkedInProfile>;

    beforeEach(() => {
      profile = parseLinkedInProfile(MOCK_EMPTY_PROFILE_RESPONSE, PUBLIC_ID, NORMALIZED_URL);
    });

    test('returns empty arrays for collections', () => {
      expect(profile.experience).toEqual([]);
      expect(profile.education).toEqual([]);
      expect(profile.skills).toEqual([]);
      expect(profile.certifications).toEqual([]);
      expect(profile.languages).toEqual([]);
    });

    test('sets partial to true for empty profile', () => {
      expect(profile.metadata.partial).toBe(true);
    });
  });

  describe('minimal profile response', () => {
    let profile: ReturnType<typeof parseLinkedInProfile>;

    beforeEach(() => {
      profile = parseLinkedInProfile(MOCK_MINIMAL_PROFILE_RESPONSE, PUBLIC_ID, NORMALIZED_URL);
    });

    test('parses first name', () => {
      expect(profile.name.first).toBe('John');
    });

    test('sets null for missing last name', () => {
      expect(profile.name.last).toBeNull();
    });

    test('sets null for missing headline', () => {
      expect(profile.headline).toBeNull();
    });

    test('sets null scalars for missing location', () => {
      expect(profile.location.city).toBeNull();
      expect(profile.location.country).toBeNull();
    });
  });

  describe('null/invalid input', () => {
    test('handles null input gracefully', () => {
      const profile = parseLinkedInProfile(null, PUBLIC_ID, NORMALIZED_URL);
      expect(profile.publicIdentifier).toBe(PUBLIC_ID);
      expect(profile.metadata.partial).toBe(true);
    });

    test('handles non-object input gracefully', () => {
      const profile = parseLinkedInProfile('invalid-string', PUBLIC_ID, NORMALIZED_URL);
      expect(profile.publicIdentifier).toBe(PUBLIC_ID);
    });

    test('does not fabricate values - missing fields return null or empty', () => {
      const profile = parseLinkedInProfile({}, PUBLIC_ID, NORMALIZED_URL);
      expect(profile.name.first).toBeNull();
      expect(profile.name.last).toBeNull();
      expect(profile.headline).toBeNull();
      expect(profile.about).toBeNull();
      expect(profile.experience).toEqual([]);
    });
  });
});
