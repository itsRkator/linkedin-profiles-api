import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { ProfileModel } from './models/Profile.model.js';
import { ProfileFetchModel } from './models/ProfileFetch.model.js';

export async function initializeDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  await mongoose.connect(config.database.uri);
  await ProfileModel.createIndexes();
  await ProfileFetchModel.createIndexes();

  logger.info('MongoDB connected', { host: mongoose.connection.host });
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState !== 1) return false;
    await mongoose.connection.db?.admin().ping();
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}
