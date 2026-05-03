import { z } from "zod";

export const DEFAULT_MAX_CONCURRENCY = 6;

const MAX_CONCURRENCY_SCHEMA = z.number().finite().int().positive();

export function resolveMaxConcurrency(value: number | undefined): number {
  if (value == null) {
    return DEFAULT_MAX_CONCURRENCY;
  }
  const parsed = MAX_CONCURRENCY_SCHEMA.safeParse(value);
  if (!parsed.success) {
    throw new Error("maxConcurrency must be a positive integer.");
  }
  return parsed.data;
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number, signal: AbortSignal) => Promise<R>,
  options?: { signal?: AbortSignal }
): Promise<R[]> {
  const controller = new AbortController();
  const userSignal = options?.signal;
  let userAbortListener: (() => void) | undefined;
  if (userSignal) {
    if (userSignal.aborted) {
      controller.abort(userSignal.reason);
    } else {
      userAbortListener = () => controller.abort(userSignal.reason);
      userSignal.addEventListener("abort", userAbortListener, { once: true });
    }
  }

  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(concurrency, 1), items.length) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) {
          return;
        }
        // Reject (don't return clean) so Promise.all surfaces the abort instead of resolving with a sparse results array.
        if (controller.signal.aborted) {
          throw controller.signal.reason ?? new Error("Aborted");
        }
        try {
          results[i] = await worker(items[i], i, controller.signal);
        } catch (err) {
          // Abort siblings so their in-flight provider calls cancel instead of running to completion with discarded results.
          controller.abort(err);
          throw err;
        }
      }
    }
  );

  try {
    await Promise.all(runners);
  } finally {
    if (userSignal && userAbortListener) {
      userSignal.removeEventListener("abort", userAbortListener);
    }
  }
  return results;
}
