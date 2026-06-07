import type { Options as PRetryOptions } from "p-retry";
import { ApiError, VoiceResolutionError } from "./errors.js";
import { isRetriableApiError } from "./provider-utils.js";

// Cap server-supplied Retry-After at 60s. A misbehaving upstream sending Retry-After: 86400
// shouldn't hang the SDK; failing fast is better than blocking the caller for hours.
const RETRY_AFTER_MAX_MS = 60_000;
// Added on top of Retry-After so a thundering herd of parallel callers don't all wake at the exact same instant.
const RETRY_AFTER_JITTER_MS = 250;

export function buildRetryOptions(args: {
  maxRetries: number;
  abortSignal: AbortSignal | undefined;
}): PRetryOptions {
  return {
    retries: args.maxRetries,
    signal: args.abortSignal,
    randomize: true,
    shouldRetry: ({ error }) => {
      if (error instanceof VoiceResolutionError) {
        return false;
      }
      return !(error instanceof ApiError) || isRetriableApiError(error);
    },
    onFailedAttempt: async ({ error, retryDelay }) => {
      if (
        !(error instanceof ApiError) ||
        error.retryAfterMs == null ||
        !isRetriableApiError(error)
      ) {
        return;
      }
      // p-retry will sleep retryDelay on its own after onFailedAttempt resolves;
      // subtract it so total wait ≈ Retry-After (+ jitter), not Retry-After + retryDelay.
      const target =
        Math.min(error.retryAfterMs, RETRY_AFTER_MAX_MS) +
        Math.floor(Math.random() * RETRY_AFTER_JITTER_MS);
      const wait = Math.max(0, target - retryDelay);
      if (wait > 0) {
        await sleep(wait, args.abortSignal);
      }
    },
  };
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
