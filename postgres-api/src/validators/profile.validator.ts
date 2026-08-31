import { z } from 'zod';

export const fetchProfileSchema = z.object({
  linkedinUrl: z
    .string()
    .min(1, 'linkedinUrl is required')
    .url('linkedinUrl must be a valid URL'),
  refresh: z.boolean().optional().default(false),
});

export type FetchProfileInput = z.infer<typeof fetchProfileSchema>;

export const publicIdentifierSchema = z
  .string()
  .min(3, 'publicIdentifier must be at least 3 characters')
  .max(100, 'publicIdentifier must be at most 100 characters')
  .regex(/^[a-zA-Z0-9\-_%]+$/, 'publicIdentifier contains invalid characters');
