import { describe, expect, it } from "vitest";
import { MemoryThrottleStore } from "../../src/canvas/throttle.ts";

describe("MemoryThrottleStore", () => {
  it("adds delay as the bucket drains", async () => {
    const sleeps: number[] = [];
    const t = new MemoryThrottleStore({ capacity: 100, sleep: async (ms) => void sleeps.push(ms) });
    await t.acquire();
    await t.release({ remaining: 80 });
    await t.acquire();
    await t.release({ remaining: 40 });
    await t.acquire();
    await t.release({ remaining: 10 });
    await t.acquire();
    await t.release({ cost: 5 });
    expect(sleeps).toEqual([250, 1000]);
    expect(t.snapshot.remaining).toBe(5);
  });
  it("limits concurrency", async () => {
    const t = new MemoryThrottleStore({ capacity: 100, concurrency: 1 });
    await t.acquire();
    let second = false;
    const p = t.acquire().then(() => {
      second = true;
    });
    await Promise.resolve();
    expect(second).toBe(false);
    await t.release({});
    await p;
    expect(second).toBe(true);
  });
});
