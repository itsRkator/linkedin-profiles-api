import 'reflect-metadata';
import 'dotenv/config';
import { createApp } from './app.js';
import { config, validateConfig } from './config/index.js';
import { initializeDatabase, closeDatabase } from './db/index.js';
import { logger } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  validateConfig();

  await initializeDatabase();

  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(`LinkedIn Profile API started`, {
      port: config.port,
      nodeEnv: config.nodeEnv,
    });
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, initiating graceful shutdown`);
    server.close(async () => {
      logger.info('HTTP server closed');
      await closeDatabase();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { reason });
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

bootstrap().catch((err: unknown) => {
  process.stderr.write(`Fatal startup error: ${String(err)}\n`);
  process.exit(1);
});
