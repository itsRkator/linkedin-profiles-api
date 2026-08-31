import { ProfileModel, type ProfileDocument } from '../db/models/Profile.model.js';
import { ProfileFetchModel } from '../db/models/ProfileFetch.model.js';
import { NormalizedProfile, FetchOutcome } from '../services/linkedin/types.js';
import { computeContentHash } from '../utils/hash.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface StoredProfile {
  id: string;
  publicIdentifier: string;
  linkedinUrl: string;
  profileData: NormalizedProfile;
  contentHash: string;
  sourceStatus: string;
  fetchedAt: Date;
  cacheExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileFetchRecord {
  publicIdentifier: string;
  outcome: FetchOutcome;
  durationMs: number | null;
  errorCategory: string | null;
  httpStatus: number | null;
  isCacheHit: boolean;
}

function toStoredProfile(doc: ProfileDocument): StoredProfile {
  return {
    id: doc._id.toString(),
    publicIdentifier: doc.publicIdentifier,
    linkedinUrl: doc.linkedinUrl,
    profileData: doc.profileData,
    contentHash: doc.contentHash,
    sourceStatus: doc.sourceStatus,
    fetchedAt: doc.fetchedAt,
    cacheExpiresAt: doc.cacheExpiresAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export async function findByPublicIdentifier(
  publicIdentifier: string,
): Promise<StoredProfile | null> {
  const doc = await ProfileModel.findOne({ publicIdentifier }).exec();
  return doc ? toStoredProfile(doc) : null;
}

export function isProfileCacheValid(stored: StoredProfile): boolean {
  return stored.cacheExpiresAt > new Date() && stored.sourceStatus === 'success';
}

export async function upsertProfile(profile: NormalizedProfile): Promise<StoredProfile> {
  const hash = computeContentHash(profile);
  const ttlMs = config.cache.ttlHours * 60 * 60 * 1000;
  const cacheExpiresAt = new Date(Date.now() + ttlMs);
  const now = new Date();

  const doc = await ProfileModel.findOneAndUpdate(
    { publicIdentifier: profile.publicIdentifier },
    {
      publicIdentifier: profile.publicIdentifier,
      linkedinUrl: profile.linkedinUrl,
      profileData: profile,
      contentHash: hash,
      sourceStatus: 'success',
      fetchedAt: now,
      cacheExpiresAt,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).exec();

  if (!doc) {
    throw new Error(`Failed to upsert profile: ${profile.publicIdentifier}`);
  }

  logger.debug('Profile upserted', { publicIdentifier: profile.publicIdentifier });
  return toStoredProfile(doc);
}

export async function recordProfileFetch(record: ProfileFetchRecord): Promise<void> {
  try {
    await ProfileFetchModel.create({
      publicIdentifier: record.publicIdentifier,
      outcome: record.outcome,
      durationMs: record.durationMs,
      errorCategory: record.errorCategory,
      httpStatus: record.httpStatus,
      isCacheHit: record.isCacheHit,
      fetchedAt: new Date(),
    });
  } catch (err) {
    logger.warn('Failed to record profile fetch audit log', {
      publicIdentifier: record.publicIdentifier,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }
}

export async function getLatestProfile(publicIdentifier: string): Promise<StoredProfile | null> {
  const doc = await ProfileModel.findOne({ publicIdentifier }).sort({ fetchedAt: -1 }).exec();
  return doc ? toStoredProfile(doc) : null;
}
