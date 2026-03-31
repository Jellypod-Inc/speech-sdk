export interface RetryOptions {
  maxRetries: number;
  abortSignal?: AbortSignal;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) return true;

  if (
    error != null &&
    typeof error === 'object' &&
    'statusCode' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  ) {
    const statusCode = (error as { statusCode: number }).statusCode;
    return statusCode >= 500;
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxRetries, abortSignal } = options;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !isRetryableError(error)) {
        throw error;
      }

      if (abortSignal?.aborted) {
        throw error;
      }

      const delay = Math.pow(2, attempt) * 100;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
