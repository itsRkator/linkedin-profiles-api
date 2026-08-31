import { redactSensitive } from '../../utils/logger.js';

describe('redactSensitive', () => {
  test('redacts li_at keys', () => {
    const input = { li_at: 'secret-token-value', username: 'johndoe' };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(result['li_at']).toBe('[REDACTED]');
    expect(result['username']).toBe('johndoe');
  });

  test('redacts JSESSIONID keys', () => {
    const input = { JSESSIONID: 'session-id-value' };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(result['JSESSIONID']).toBe('[REDACTED]');
  });

  test('redacts cookie headers', () => {
    const input = { headers: { cookie: 'li_at=secret; path=/' } };
    const result = redactSensitive(input) as Record<string, unknown>;
    const headers = result['headers'] as Record<string, unknown>;
    expect(headers['cookie']).toBe('[REDACTED]');
  });

  test('redacts csrf-token headers', () => {
    const input = { 'csrf-token': 'ajax:something' };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(result['csrf-token']).toBe('[REDACTED]');
  });

  test('does not redact non-sensitive fields', () => {
    const input = { publicIdentifier: 'john-doe', status: 'success' };
    const result = redactSensitive(input) as Record<string, unknown>;
    expect(result['publicIdentifier']).toBe('john-doe');
    expect(result['status']).toBe('success');
  });

  test('handles nested objects', () => {
    const input = {
      request: {
        headers: {
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json',
        },
      },
    };
    const result = redactSensitive(input) as Record<string, unknown>;
    const req = result['request'] as Record<string, unknown>;
    const headers = req['headers'] as Record<string, unknown>;
    expect(headers['Authorization']).toBe('[REDACTED]');
    expect(headers['Content-Type']).toBe('application/json');
  });

  test('handles arrays', () => {
    const input = [{ token: 'secret' }, { name: 'public' }];
    const result = redactSensitive(input) as Array<Record<string, unknown>>;
    expect(result[0]?.['token']).toBe('[REDACTED]');
    expect(result[1]?.['name']).toBe('public');
  });

  test('handles null and undefined values safely', () => {
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive(undefined)).toBeUndefined();
  });

  test('handles primitive values safely', () => {
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(true)).toBe(true);
  });
});
