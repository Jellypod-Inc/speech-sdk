import { describe, it, expect, vi } from 'vitest';
import { withRetry } from '../retry.js';

describe('withRetry', () => {
  it('returns the result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx ApiError and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(makeApiError(500))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on network error (TypeError) and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 2 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 4xx ApiError', async () => {
    const fn = vi.fn().mockRejectedValue(makeApiError(401));
    await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after all retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(makeApiError(500));
    await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('respects maxRetries: 0', async () => {
    const fn = vi.fn().mockRejectedValue(makeApiError(500));
    await expect(withRetry(fn, { maxRetries: 0 })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('respects abortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn().mockRejectedValue(makeApiError(500));
    await expect(
      withRetry(fn, { maxRetries: 2, abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

function makeApiError(statusCode: number) {
  const error = new Error(`HTTP ${statusCode}`) as Error & {
    statusCode: number;
  };
  error.statusCode = statusCode;
  return error;
}
