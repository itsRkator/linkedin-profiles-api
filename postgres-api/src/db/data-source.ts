import 'dotenv/config';
import 'reflect-metadata';
import path from 'path';
import { DataSource } from 'typeorm';
import { Profile } from './entities/Profile.entity.js';
import { ProfileFetch } from './entities/ProfileFetch.entity.js';

const isCompiled = __filename.endsWith('.js');
const migrationsGlob = isCompiled
  ? path.join(__dirname, 'migrations/*.js')
  : path.join(__dirname, 'migrations/*.ts');

const databaseUrl = process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/linkedin_profile_api';
const useRenderSsl =
  process.env['NODE_ENV'] === 'production' &&
  (databaseUrl.includes('render.com') || process.env['DATABASE_SSL'] === 'true');

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [Profile, ProfileFetch],
  migrations: [migrationsGlob],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: process.env['NODE_ENV'] === 'development',
  ssl: useRenderSsl ? { rejectUnauthorized: false } : false,
});
