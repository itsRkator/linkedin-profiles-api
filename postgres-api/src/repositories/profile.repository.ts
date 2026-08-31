import { AppDataSource } from '../db/index.js';
import { Profile } from '../db/entities/Profile.entity.js';
import { ProfileFetch } from '../db/entities/ProfileFetch.entity.js';
import { NormalizedProfile, FetchOutcome } from '../services/linkedin/types.js';
import { computeContentHash } from '../utils/hash.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export type { Profile as StoredProfile };

export interface ProfileFetchRecord {
  publicIdentifier: string;
  outcome: FetchOutcome;
  durationMs: number | null;
  errorCategory: string | null;
  httpStatus: number | null;
  isCacheHit: boolean;
}

export async function findByPublicIdentifier(publicIdentifier: string): Promise<Profile | null> {
  return AppDataSource.getRepository(Profile).findOne({
    where: { publicIdentifier },
  });
}

export function isProfileCacheValid(stored: Profile): boolean {
  return stored.cacheExpiresAt > new Date() && stored.sourceStatus === 'success';
}

export async function upsertProfile(profile: NormalizedProfile): Promise<Profile> {
  const repo = AppDataSource.getRepository(Profile);
  const hash = computeContentHash(profile);
  const ttlMs = config.cache.ttlHours * 60 * 60 * 1000;
  const cacheExpiresAt = new Date(Date.now() + ttlMs);
  const now = new Date();

  await repo.upsert(
    {
      publicIdentifier: profile.publicIdentifier,
      linkedinUrl: profile.linkedinUrl,
      profileData: profile,
      contentHash: hash,
      sourceStatus: 'success',
      fetchedAt: now,
      cacheExpiresAt,
    },
    {
      conflictPaths: ['publicIdentifier'],
      skipUpdateIfNoValuesChanged: false,
    },
  );

  const saved = await repo.findOneOrFail({ where: { publicIdentifier: profile.publicIdentifier } });

  logger.debug('Profile upserted', { publicIdentifier: profile.publicIdentifier });
  return saved;
}

export async function recordProfileFetch(record: ProfileFetchRecord): Promise<void> {
  try {
    const repo = AppDataSource.getRepository(ProfileFetch);
    const entry = repo.create({
      publicIdentifier: record.publicIdentifier,
      outcome: record.outcome,
      durationMs: record.durationMs,
      errorCategory: record.errorCategory,
      httpStatus: record.httpStatus,
      isCacheHit: record.isCacheHit,
      fetchedAt: new Date(),
    });
    await repo.save(entry);
  } catch (err) {
    logger.warn('Failed to record profile fetch audit log', {
      publicIdentifier: record.publicIdentifier,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

export async function getLatestProfile(publicIdentifier: string): Promise<Profile | null> {
  return AppDataSource.getRepository(Profile).findOne({
    where: { publicIdentifier },
    order: { fetchedAt: 'DESC' },
  });
}
