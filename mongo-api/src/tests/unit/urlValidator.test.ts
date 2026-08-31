import {
  validateAndParseLinkedInUrl,
  LinkedInUrlError,
} from '../../utils/urlValidator.js';

describe('validateAndParseLinkedInUrl', () => {
  describe('valid URLs', () => {
    test('normalizes a standard https linkedin URL', () => {
      const result = validateAndParseLinkedInUrl('https://www.linkedin.com/in/john-doe/');
      expect(result.publicIdentifier).toBe('john-doe');
      expect(result.normalizedUrl).toBe('https://www.linkedin.com/in/john-doe/');
    });

    test('handles URL without trailing slash', () => {
      const result = validateAndParseLinkedInUrl('https://www.linkedin.com/in/john-doe');
      expect(result.publicIdentifier).toBe('john-doe');
      expect(result.normalizedUrl).toBe('https://www.linkedin.com/in/john-doe/');
    });

    test('normalizes root linkedin.com (no www) to canonical form', () => {
      const result = validateAndParseLinkedInUrl('https://linkedin.com/in/jane-smith/');
      expect(result.publicIdentifier).toBe('jane-smith');
      expect(result.normalizedUrl).toBe('https://www.linkedin.com/in/jane-smith/');
    });

    test('accepts http protocol', () => {
      const result = validateAndParseLinkedInUrl('http://www.linkedin.com/in/test-user/');
      expect(result.publicIdentifier).toBe('test-user');
    });

    test('handles numeric identifiers', () => {
      const result = validateAndParseLinkedInUrl('https://www.linkedin.com/in/user123/');
      expect(result.publicIdentifier).toBe('user123');
    });

    test('handles identifiers with hyphens', () => {
      const result = validateAndParseLinkedInUrl('https://www.linkedin.com/in/first-last-name/');
      expect(result.publicIdentifier).toBe('first-last-name');
    });

    test('lowercases the public identifier', () => {
      const result = validateAndParseLinkedInUrl('https://www.linkedin.com/in/JohnDoe/');
      expect(result.publicIdentifier).toBe('johndoe');
    });
  });

  describe('invalid URLs', () => {
    test('throws on empty string', () => {
      expect(() => validateAndParseLinkedInUrl('')).toThrow(LinkedInUrlError);
    });

    test('throws on non-LinkedIn domain', () => {
      expect(() =>
        validateAndParseLinkedInUrl('https://example.com/in/someone/'),
      ).toThrow(LinkedInUrlError);
    });

    test('throws on wrong subdomain', () => {
      expect(() =>
        validateAndParseLinkedInUrl('https://api.linkedin.com/in/someone/'),
      ).toThrow(LinkedInUrlError);
    });

    test('throws on non-profile path', () => {
      expect(() =>
        validateAndParseLinkedInUrl('https://www.linkedin.com/jobs/view/123/'),
      ).toThrow(LinkedInUrlError);
    });

    test('throws on company page URL', () => {
      expect(() =>
        validateAndParseLinkedInUrl('https://www.linkedin.com/company/some-company/'),
      ).toThrow(LinkedInUrlError);
    });

    test('throws on invalid URL format', () => {
      expect(() => validateAndParseLinkedInUrl('not-a-url')).toThrow(LinkedInUrlError);
    });

    test('throws on ftp protocol', () => {
      expect(() =>
        validateAndParseLinkedInUrl('ftp://www.linkedin.com/in/someone/'),
      ).toThrow(LinkedInUrlError);
    });

    test('throws on URL with only /in/ path', () => {
      expect(() =>
        validateAndParseLinkedInUrl('https://www.linkedin.com/in/'),
      ).toThrow(LinkedInUrlError);
    });

    test('throws on SSRF-like URL with linkedin hostname embedded', () => {
      expect(() =>
        validateAndParseLinkedInUrl('https://evil.com/in/someone/'),
      ).toThrow(LinkedInUrlError);
    });
  });

  describe('host allowlisting', () => {
    const allowedHosts = ['www.linkedin.com', 'linkedin.com'];

    test.each(allowedHosts)('accepts host: %s', (host) => {
      expect(() =>
        validateAndParseLinkedInUrl(`https://${host}/in/testuser/`),
      ).not.toThrow();
    });

    const disallowedHosts = [
      'evil.com',
      'linkedin.com.evil.com',
      'fake-linkedin.com',
      'localhost',
      '127.0.0.1',
      '192.168.1.1',
      '10.0.0.1',
    ];

    test.each(disallowedHosts)('rejects host: %s', (host) => {
      expect(() =>
        validateAndParseLinkedInUrl(`https://${host}/in/testuser/`),
      ).toThrow(LinkedInUrlError);
    });
  });

  describe('canonical identifier extraction', () => {
    test('extracts the correct identifier from various URL formats', () => {
      const cases = [
        ['https://www.linkedin.com/in/johndoe/', 'johndoe'],
        ['https://www.linkedin.com/in/john-doe-1234/', 'john-doe-1234'],
        ['https://linkedin.com/in/user_test/', 'user_test'],
      ];

      for (const [url, expected] of cases) {
        const result = validateAndParseLinkedInUrl(url as string);
        expect(result.publicIdentifier).toBe(expected);
      }
    });
  });

  describe('SSRF-resistant validation', () => {
    test('rejects IP address as host', () => {
      expect(() =>
        validateAndParseLinkedInUrl('https://192.168.1.1/in/someone/'),
      ).toThrow(LinkedInUrlError);
    });

    test('rejects localhost', () => {
      expect(() =>
        validateAndParseLinkedInUrl('https://localhost/in/someone/'),
      ).toThrow(LinkedInUrlError);
    });
  });
});
