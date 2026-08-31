import { Request, Response, NextFunction } from 'express';
import { checkDatabaseHealth } from '../db/index.js';

export async function healthCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const dbHealthy = await checkDatabaseHealth();

    const status = dbHealthy ? 200 : 503;
    res.status(status).json({
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbHealthy ? 'up' : 'down',
        },
        api: {
          status: 'up',
        },
      },
    });
  } catch (err) {
    next(err);
  }
}
