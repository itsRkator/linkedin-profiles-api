import { Request, Response, NextFunction } from 'express';
import { fetchProfileSchema, publicIdentifierSchema } from '../validators/profile.validator.js';
import { fetchProfile, getStoredProfile } from '../services/profile.service.js';
import { logger } from '../utils/logger.js';

export async function createOrFetchProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const input = fetchProfileSchema.parse(req.body);

    logger.info('POST /v1/profiles request', {
      requestId: req.requestId,
      refresh: input.refresh,
    });

    const result = await fetchProfile({
      linkedinUrl: input.linkedinUrl,
      refresh: input.refresh,
    });

    res.status(result.statusCode).json({ data: result.data });
  } catch (err) {
    next(err);
  }
}

export async function getProfileByIdentifier(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = publicIdentifierSchema.safeParse(req.params['publicIdentifier']);
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'INVALID_IDENTIFIER',
          message: parsed.error.issues[0]?.message ?? 'Invalid publicIdentifier',
          requestId: req.requestId,
        },
      });
      return;
    }
    const publicIdentifier = parsed.data;

    logger.info('GET /v1/profiles/:publicIdentifier', {
      requestId: req.requestId,
      publicIdentifier,
    });

    const profile = await getStoredProfile(publicIdentifier);

    res.status(200).json({ data: profile });
  } catch (err) {
    next(err);
  }
}
