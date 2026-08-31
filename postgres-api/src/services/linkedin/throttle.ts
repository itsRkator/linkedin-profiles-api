/**
 * LinkedIn request throttle.
 *
 * LinkedIn's anti-bot system invalidates session tokens when requests arrive
 * too rapidly from a non-browser client. This module enforces:
 *
 *  1. **Serial execution** — only one LinkedIn API call runs at a time.
 *  2. **Minimum inter-request delay** — configurable via LINKEDIN_MIN_DELAY_MS
 *     (default 8 s). Requests that arrive while another is in-flight are queued
 *     and released only after the minimum delay has elapsed.
 *  3. **Random jitter** — up to LINKEDIN_MAX_JITTER_MS (default 3 s) of
 *     additional random wait is added so request timing is not perfectly
 *     periodic, which triggers LinkedIn's bot-detection heuristics.
 */
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
