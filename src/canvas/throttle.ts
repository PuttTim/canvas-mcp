/**
 * Canvas throttles per access token with a leaky bucket (default capacity ~700
 * units, replenished continuously). Each response reports
 * `X-Rate-Limit-Remaining` and `X-Request-Cost`. Parallel requests pay an
 * upfront penalty that is refunded when they finish, so bursts drain the bucket
 * faster than their real cost.
 *
 * Strategy (borrowed from canvas-cli): slow down as the bucket empties.
 *   remaining > 50%  → no delay
 *   20% … 50%        → short delay
 *   < 20%            → serialise with a long delay
 *
 * The store is an interface so Workers can back it with a Durable Object
 * (isolates don't share memory) while stdio/Node use the in-memory version.
 */
export interface ThrottleStore {
  /** Wait for permission to issue a request. */
  acquire(): Promise<void>;
  /** Record the outcome of a request. */
  release(info: { remaining?: number | undefined; cost?: number | undefined }): Promise<void>;
}

export interface MemoryThrottleOptions {
  /** Assumed bucket capacity. Canvas default is 700. */
  capacity?: number;
  /** Max in-flight requests. */
  concurrency?: number;
  /** Delays (ms) for the warn / critical tiers. */
  warnDelayMs?: number;
  criticalDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class MemoryThrottleStore implements ThrottleStore {
  private remaining: number;
  private readonly capacity: number;
  private readonly concurrency: number;
  private readonly warnDelayMs: number;
  private readonly criticalDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private inflight = 0;
  private waiters: Array<() => void> = [];

  constructor(opts: MemoryThrottleOptions = {}) {
    this.capacity = opts.capacity ?? 700;
    this.remaining = this.capacity;
    this.concurrency = opts.concurrency ?? 4;
    this.warnDelayMs = opts.warnDelayMs ?? 250;
    this.criticalDelayMs = opts.criticalDelayMs ?? 1000;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  get snapshot() {
    return { remaining: this.remaining, capacity: this.capacity, inflight: this.inflight };
  }

  private delayFor(remaining: number): number {
    const frac = remaining / this.capacity;
    if (frac > 0.5) return 0;
    if (frac > 0.2) return this.warnDelayMs;
    return this.criticalDelayMs;
  }

  async acquire(): Promise<void> {
    const limit = this.remaining / this.capacity <= 0.2 ? 1 : this.concurrency;
    if (this.inflight >= limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.inflight++;
    const delay = this.delayFor(this.remaining);
    if (delay > 0) await this.sleep(delay);
  }

  async release(info: {
    remaining?: number | undefined;
    cost?: number | undefined;
  }): Promise<void> {
    this.inflight = Math.max(0, this.inflight - 1);
    if (typeof info.remaining === "number" && Number.isFinite(info.remaining)) {
      this.remaining = info.remaining;
    } else if (typeof info.cost === "number" && Number.isFinite(info.cost)) {
      this.remaining = Math.max(0, this.remaining - info.cost);
    }
    const next = this.waiters.shift();
    if (next) next();
  }
}

/** No-op store for tests or trusted low-volume contexts. */
export class NoopThrottleStore implements ThrottleStore {
  async acquire(): Promise<void> {}
  async release(): Promise<void> {}
}
