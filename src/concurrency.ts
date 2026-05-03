export const DEFAULT_MAX_CONCURRENCY = 6;

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
        if (controller.signal.aborted) {
          return;
        }
        const i = next++;
        if (i >= items.length) {
          return;
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
