export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly body: string, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export interface RetryOpts {
  attempts?: number;
  baseMs?: number;
  capMs?: number;
  shouldRetry?: (err: unknown) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 4;
  const baseMs = opts.baseMs ?? 1000;
  const capMs = opts.capMs ?? 30_000;
  const shouldRetry = opts.shouldRetry ?? defaultShouldRetry;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !shouldRetry(err)) throw err;
      await sleep(Math.min(capMs, baseMs * 2 ** i));
    }
  }
  throw lastErr;
}

function defaultShouldRetry(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.status === 429 || (err.status >= 500 && err.status < 600);
  }
  return err instanceof TypeError;
}
