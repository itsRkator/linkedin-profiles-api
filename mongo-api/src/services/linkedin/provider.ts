import { fetchFromLinkedIn, classifyFetchError } from './client.js';
import { getProfileEndpoint } from './endpoints.js';
import { parseLinkedInProfile } from './parser.js';
import { FetchResult } from './types.js';
import { logger } from '../../utils/logger.js';

export interface LinkedInProfileProvider {
  fetchProfile(publicIdentifier: string, normalizedUrl: string): Promise<FetchResult>;
}

export class VoyagerLinkedInProvider implements LinkedInProfileProvider {
  async fetchProfile(publicIdentifier: string, normalizedUrl: string): Promise<FetchResult> {
    const startTime = Date.now();

    try {
      const endpoint = getProfileEndpoint(publicIdentifier);

      logger.info('Fetching LinkedIn profile', { publicIdentifier });

      const rawResponse = await fetchFromLinkedIn(endpoint, publicIdentifier);
      const durationMs = Date.now() - startTime;

      logger.info('LinkedIn profile fetched successfully', { publicIdentifier, durationMs });

      logger.debug('LinkedIn raw response keys', {
        publicIdentifier,
        topLevelKeys: rawResponse && typeof rawResponse === 'object'
          ? Object.keys(rawResponse as object).slice(0, 10)
          : typeof rawResponse,
      });

      const profile = parseLinkedInProfile(rawResponse, publicIdentifier, normalizedUrl);

      return {
        profile,
        outcome: 'success',
        durationMs,
        httpStatus: 200,
        errorCategory: null,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const classification = classifyFetchError(err);

      logger.warn('LinkedIn profile fetch failed', {
        publicIdentifier,
        outcome: classification.outcome,
        errorCategory: classification.errorCategory,
        durationMs,
      });

      return {
        profile: null,
        durationMs,
        ...classification,
      };
    }
  }
}

export const linkedInProvider: LinkedInProfileProvider = new VoyagerLinkedInProvider();
