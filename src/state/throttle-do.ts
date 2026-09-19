/**
 * Per-token rate-limit state shared across Worker isolates.
 *
 * One Durable Object per Canvas token fingerprint. The DO never sleeps; it
 * returns how long the caller should wait, so a slow client can't hold the
 * object. Canvas's bucket leaks (refills) continuously, so between calls we
 * model refill at OUTFLOW units per second.
 */
import { DurableObject } from "cloudflare:workers";
import type { ThrottleStore } from "../canvas/throttle.ts";

interface State {
  remaining: number;
  capacity: number;
  inflight: number;
  updatedAt: number;
}

const DEFAULT_CAPACITY = 700;
const OUTFLOW_PER_SEC = 10;
const CONCURRENCY = 4;
const INFLIGHT_STALE_MS = 30_000;
const WARN_DELAY_MS = 250;
const CRITICAL_DELAY_MS = 1000;
const QUEUE_DELAY_MS = 300;

export class ThrottleDurableObject extends DurableObject<unknown> {
  private state: State = {
    remaining: DEFAULT_CAPACITY,
    capacity: DEFAULT_CAPACITY,
    inflight: 0,
    updatedAt: 0,
  };

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<State>("state");
      if (saved) this.state = saved;
    });
  }

  private tick(now: number) {
    const s = this.state;
    if (s.updatedAt > 0) {
      const elapsed = (now - s.updatedAt) / 1000;
      s.remaining = Math.min(s.capacity, s.remaining + elapsed * OUTFLOW_PER_SEC);
      if (now - s.updatedAt > INFLIGHT_STALE_MS) s.inflight = 0;
    }
    s.updatedAt = now;
  }

  private persist() {
    // Fire-and-forget; DO storage writes are coalesced and ordered.
    void this.ctx.storage.put("state", this.state);
  }

  async acquire(): Promise<{ delayMs: number; remaining: number }> {
    const now = Date.now();
    this.tick(now);
    const s = this.state;
    const frac = s.remaining / s.capacity;
    let delayMs = frac > 0.5 ? 0 : frac > 0.2 ? WARN_DELAY_MS : CRITICAL_DELAY_MS;
    const limit = frac <= 0.2 ? 1 : CONCURRENCY;
    if (s.inflight >= limit) delayMs = Math.max(delayMs, QUEUE_DELAY_MS * (s.inflight - limit + 1));
    s.inflight++;
    this.persist();
    return { delayMs, remaining: s.remaining };
  }

  async release(info: {
    remaining?: number | undefined;
    cost?: number | undefined;
  }): Promise<void> {
    const now = Date.now();
    this.tick(now);
    const s = this.state;
    s.inflight = Math.max(0, s.inflight - 1);
    if (typeof info.remaining === "number" && Number.isFinite(info.remaining))
      s.remaining = info.remaining;
    else if (typeof info.cost === "number" && Number.isFinite(info.cost))
      s.remaining = Math.max(0, s.remaining - info.cost);
    this.persist();
  }

  async snapshot(): Promise<State> {
    this.tick(Date.now());
    return { ...this.state };
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class DurableObjectThrottleStore implements ThrottleStore {
  constructor(
    private readonly stub: DurableObjectStub<ThrottleDurableObject>,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {}
  async acquire(): Promise<void> {
    const { delayMs } = await this.stub.acquire();
    if (delayMs > 0) await this.sleep(delayMs);
  }
  async release(info: {
    remaining?: number | undefined;
    cost?: number | undefined;
  }): Promise<void> {
    await this.stub.release(info);
  }
}
