import { describe, it, expect } from "vitest";
import { HttpError, RateLimiter, withRetry } from "../src/throttle.ts";

describe("RateLimiter", () => {
  it("spaces calls at least minGapMs apart", async () => {
    const limiter = new RateLimiter(50);
    const start = Date.now();
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });
});

describe("withRetry", () => {
  it("returns immediately on success", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
  });

  it("retries 429 then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw new HttpError(429, "", "rate limited");
        return "ok";
      },
      { baseMs: 1, capMs: 5, attempts: 3 },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does not retry non-retryable HTTP errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new HttpError(400, "", "bad request");
        },
        { baseMs: 1, attempts: 3 },
      ),
    ).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(1);
  });

  it("gives up after `attempts` retryable failures", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new HttpError(503, "", "down");
        },
        { baseMs: 1, attempts: 2 },
      ),
    ).rejects.toBeInstanceOf(HttpError);
    expect(calls).toBe(2);
  });
});
