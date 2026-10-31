import { SlackApiError } from "./slackApi";

export interface RateLimiterOptions {
  minIntervalMs?: number;
  maxAttempts?: number;
  maxElapsedMs?: number;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export class OperationAbortedError extends Error {
  constructor() {
    super("The operation was stopped.");
    this.name = "OperationAbortedError";
  }
}

export class RetryExhaustedError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(`Slack request retries were exhausted (${code}).`);
    this.name = "RetryExhaustedError";
    this.code = code;
  }
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new OperationAbortedError());
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new OperationAbortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export class RateLimiter {
  private readonly minIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly maxElapsedMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  private nextAllowedMs = 0;

  constructor(options: RateLimiterOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 1100;
    this.maxAttempts = options.maxAttempts ?? 4;
    this.maxElapsedMs = options.maxElapsedMs ?? 60_000;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? defaultSleep;
  }

  private assertActive(signal?: AbortSignal): void {
    if (signal?.aborted) throw new OperationAbortedError();
  }

  private reserve(): number {
    const current = this.now();
    const waitMs = Math.max(0, this.nextAllowedMs - current);
    this.nextAllowedMs = Math.max(current, this.nextAllowedMs) + this.minIntervalMs;
    return waitMs;
  }

  private penalize(retryAfterMs: number): void {
    this.nextAllowedMs = Math.max(this.nextAllowedMs, this.now() + retryAfterMs);
  }

  async execute<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    const startedAt = this.now();
    let attempts = 0;

    for (;;) {
      this.assertActive(signal);
      const waitMs = this.reserve();
      if (waitMs > 0) await this.sleep(waitMs, signal);
      this.assertActive(signal);

      try {
        return await operation();
      } catch (error) {
        this.assertActive(signal);
        if (!(error instanceof SlackApiError) || !error.retryable) throw error;

        attempts += 1;
        const retryDelayMs = error.retryAfterMs ?? 1000;
        const elapsedMs = this.now() - startedAt;
        if (attempts >= this.maxAttempts || elapsedMs + retryDelayMs > this.maxElapsedMs) {
          throw new RetryExhaustedError(error.code);
        }
        this.penalize(retryDelayMs);
      }
    }
  }
}
