import { AppError } from './errors.js';

/**
 * Fixed-window counter per key. In memory, so it only holds for a single API instance.
 * shortcut: not shared across instances, move to Postgres/Redis if the API ever scales out.
 */
export class AttemptLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  hit(key: string): void {
    const t = this.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= t) {
      this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
      if (this.hits.size > 10_000) this.sweep(t);
      return;
    }
    entry.count += 1;
    if (entry.count > this.max) {
      throw new AppError('RATE_LIMITED', {
        retryAfterSeconds: Math.ceil((entry.resetAt - t) / 1000),
      });
    }
  }

  private sweep(t: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
  }
}
