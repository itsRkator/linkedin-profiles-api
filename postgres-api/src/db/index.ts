import 'reflect-metadata';
import { AppDataSource } from './data-source.js';
import { logger } from '../utils/logger.js';

export async function initializeDatabase(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    logger.info('TypeORM DataSource initialized');
  }
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    if (!AppDataSource.isInitialized) return false;
    await AppDataSource.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    logger.info('TypeORM DataSource closed');
  }
}

export { AppDataSource };
