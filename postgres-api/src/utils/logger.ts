import winston from 'winston';
import { config } from '../config/index.js';

const REDACTED = '[REDACTED]';

const sensitiveKeys = [
  'li_at',
  'jsessionid',
  'JSESSIONID',
  'cookie',
  'Cookie',
  'authorization',
  'Authorization',
  'password',
  'token',
  'secret',
  'LINKEDIN_LI_AT',
  'LINKEDIN_JSESSIONID',
  'csrf-token',
  'Csrf-Token',
];

function redactSensitive(obj: unknown, depth = 0): unknown {
  if (depth > 5) return obj;
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    for (const key of sensitiveKeys) {
      if (obj.toLowerCase().includes(key.toLowerCase())) {
        return REDACTED;
      }
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitive(item, depth + 1));
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (sensitiveKeys.some((sk) => k.toLowerCase().includes(sk.toLowerCase()))) {
        result[k] = REDACTED;
      } else {
        result[k] = redactSensitive(v, depth + 1);
      }
    }
    return result;
  }
  return obj;
}

const redactFormat = winston.format((info) => {
  const sanitized = redactSensitive(info) as winston.Logform.TransformableInfo;
  return sanitized;
});

const isTest = config.nodeEnv === 'test';
const isProduction = config.nodeEnv === 'production';

export const logger = winston.createLogger({
  level: isProduction ? 'info' : isTest ? 'warn' : 'debug',
  silent: isTest,
  format: winston.format.combine(
    redactFormat(),
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    isProduction ? winston.format.json() : winston.format.simple(),
  ),
  transports: [new winston.transports.Console()],
});

export { redactSensitive };
