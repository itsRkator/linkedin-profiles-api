import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import {
  ProfileNotFoundError,
  LinkedInAuthenticationError,
  LinkedInAccessError,
  LinkedInRateLimitServiceError,
  LinkedInUpstreamError,
} from '../services/profile.service.js';
import { LinkedInUrlError } from '../utils/urlValidator.js';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.requestId;

  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        requestId,
        details: err.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      },
    };
    res.status(400).json(response);
    return;
  }

  if (err instanceof LinkedInUrlError) {
    res.status(400).json({
      error: {
        code: 'INVALID_LINKEDIN_URL',
        message: err.message,
        requestId,
      },
    });
    return;
  }

  if (err instanceof LinkedInAuthenticationError) {
    res.status(err.statusCode).json({
      error: {
        code: 'LINKEDIN_AUTH_FAILURE',
        message: err.message,
        requestId,
      },
    });
    return;
  }

  if (err instanceof LinkedInAccessError) {
    res.status(err.statusCode).json({
      error: {
        code: 'LINKEDIN_ACCESS_DENIED',
        message: err.message,
        requestId,
      },
    });
    return;
  }

  if (err instanceof ProfileNotFoundError) {
    res.status(404).json({
      error: {
        code: 'PROFILE_NOT_FOUND',
        message: err.message,
        requestId,
      },
    });
    return;
  }

  if (err instanceof LinkedInRateLimitServiceError) {
    res.status(err.statusCode).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: err.message,
        requestId,
      },
    });
    return;
  }

  if (err instanceof LinkedInUpstreamError) {
    res.status(err.statusCode).json({
      error: {
        code: 'UPSTREAM_ERROR',
        message: err.message,
        requestId,
      },
    });
    return;
  }

  if (err instanceof Error && err.message.includes('SSRF')) {
    res.status(400).json({
      error: {
        code: 'SSRF_PROTECTION',
        message: 'URL not allowed for security reasons',
        requestId,
      },
    });
    return;
  }

  logger.error('Unhandled error', {
    requestId,
    error: err instanceof Error ? err.message : 'Unknown error',
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  });
}
