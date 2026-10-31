import { describe, expect, it, vi } from "vitest";
import { SlackApiError } from "../src/lib/slackApi";
import {
  OperationAbortedError,
  RateLimiter,
  RetryExhaustedError,
} from "../src/lib/rateLimiter";

describe("RateLimiter", () => {
  it("paces every operation through one schedule", async () => {
    let now = 0;
    const waits: number[] = [];
    const limiter = new RateLimiter({
      minIntervalMs: 1000,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });

    await limiter.execute(async () => "first");
    await limiter.execute(async () => "second");
    expect(waits).toEqual([1000]);
  });

  it("honors Retry-After and retries only within the finite bound", async () => {
    let now = 0;
    const operation = vi.fn(async () => {
      if (operation.mock.calls.length === 1) {
        throw new SlackApiError("limited", {
          code: "ratelimited",
          retryable: true,
          retryAfterMs: 3000,
        });
      }
      return "ok";
    });
    const limiter = new RateLimiter({
      minIntervalMs: 0,
      maxAttempts: 3,
      now: () => now,
      sleep: async (ms) => { now += ms; },
    });

    await expect(limiter.execute(operation)).resolves.toBe("ok");
    expect(now).toBe(3000);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("halts after retry exhaustion", async () => {
    const operation = vi.fn(async () => {
      throw new SlackApiError("network", { code: "network_error", retryable: true });
    });
    const limiter = new RateLimiter({
      minIntervalMs: 0,
      maxAttempts: 2,
      sleep: async () => {},
    });

    await expect(limiter.execute(operation)).rejects.toBeInstanceOf(RetryExhaustedError);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("propagates cancellation before another request starts", async () => {
    const operation = vi.fn(async () => "unexpected");
    const abort = new AbortController();
    abort.abort();
    const limiter = new RateLimiter({ minIntervalMs: 0 });

    await expect(limiter.execute(operation, abort.signal)).rejects.toBeInstanceOf(OperationAbortedError);
    expect(operation).not.toHaveBeenCalled();
  });
});
