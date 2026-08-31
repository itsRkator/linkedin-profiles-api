import { jest } from '@jest/globals';

jest.mock('../../db/index.js');
jest.mock('../../services/linkedin/provider.js', () => ({
  linkedInProvider: {
    fetchProfile: jest.fn(),
  },
}));

import request from 'supertest';
import { createApp } from '../../app.js';
import * as db from '../../db/index.js';

const mockDb = db as jest.Mocked<typeof db>;

describe('GET /health', () => {
  const app = createApp();

  test('returns 200 with healthy status when database is up', async () => {
    mockDb.checkDatabaseHealth.mockResolvedValue(true);

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.services.database.status).toBe('up');
    expect(response.body.services.api.status).toBe('up');
    expect(response.body.timestamp).toBeDefined();
  });

  test('returns 503 with degraded status when database is down', async () => {
    mockDb.checkDatabaseHealth.mockResolvedValue(false);

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.services.database.status).toBe('down');
  });

  test('returns X-Request-Id header', async () => {
    mockDb.checkDatabaseHealth.mockResolvedValue(true);

    const response = await request(app).get('/health');

    expect(response.headers['x-request-id']).toBeDefined();
  });

  test('echoes back provided X-Request-Id header', async () => {
    mockDb.checkDatabaseHealth.mockResolvedValue(true);
    const customId = 'test-request-id-12345';

    const response = await request(app).get('/health').set('X-Request-Id', customId);

    expect(response.headers['x-request-id']).toBe(customId);
  });
});
