import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class LinkedInThrottle {
  private lastCallTime = 0;
  private pendingPromise: Promise<void> = Promise.resolve();

  async throttle<T>(fn: () => Promise<T>): Promise<T> {
    const scheduled = this.pendingPromise.then(async () => {
      const now = Date.now();
      const minDelay = config.linkedin.minDelayMs;
      const jitter = Math.floor(Math.random() * config.linkedin.maxJitterMs);
      const elapsed = now - this.lastCallTime;
      const waitTime = Math.max(0, minDelay + jitter - elapsed);

      if (waitTime > 0) {
        logger.debug('LinkedIn throttle: pacing request', { waitMs: waitTime });
        await sleep(waitTime);
      }

      this.lastCallTime = Date.now();
    });

    this.pendingPromise = scheduled.catch(() => undefined);

    await scheduled;
    return fn();
  }
}

export const linkedInThrottle = new LinkedInThrottle();
