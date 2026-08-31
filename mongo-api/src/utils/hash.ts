import crypto from 'crypto';

export function computeContentHash(data: unknown): string {
  const json = JSON.stringify(data, Object.keys(data as object).sort());
  return crypto.createHash('sha256').update(json).digest('hex');
}
