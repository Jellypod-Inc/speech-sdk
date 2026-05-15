import { ApiError, MissingApiKeyError } from "./errors.js";

// Sent as X-User-Agent — User-Agent is a forbidden header name in browser fetch.
export const SDK_USER_AGENT = "jellypod-speech-sdk";

export function resolveApiKey(
  stored: string | undefined,
  envVar: string,
  providerName: string
): string {
  const raw =
    stored ??
    (typeof process === "undefined" ? undefined : process.env?.[envVar]);
  const key = raw?.trim();
  if (!key) {
    throw new MissingApiKeyError({ providerName, envVar });
  }
  return key;
}

function truncate(body: string): string {
  return body.length > 200 ? `${body.slice(0, 200)}…` : body;
}

function parseErrorJson(body: string | undefined): {
  message?: string;
  code?: string;
} {
  if (!body) {
    return {};
  }
  try {
    const json = JSON.parse(body);
    const candidates = [
      json.error,
      json.error?.message,
      json.message,
      json.detail,
    ];
    const message =
      candidates.find((c: unknown): c is string => typeof c === "string") ??
      truncate(body);
    const code = typeof json.code === "string" ? json.code : undefined;
    return { message, code };
  } catch {
    return { message: truncate(body) };
  }
}

// 501 is terminal — gateway uses it for "capability will never work" (e.g. timestamps_unsupported).
// 429 retry honors Retry-After in retry-options.ts (RFC 7231 §7.1.3).
export function isRetriableApiError(error: ApiError): boolean {
  if (error.statusCode === 429) {
    return true;
  }
  return error.statusCode >= 500 && error.statusCode !== 501;
}

const RETRY_AFTER_SECONDS_RE = /^\d+(\.\d+)?$/;

// RFC 7231 §7.1.3: Retry-After is either delay-seconds (non-negative integer) or HTTP-date.
// Returns ms; undefined when missing/unparsable; clamped at 0 lower bound.
export function parseRetryAfter(
  headerValue: string | null
): number | undefined {
  if (!headerValue) {
    return;
  }
  const trimmed = headerValue.trim();
  if (trimmed === "") {
    return;
  }
  if (RETRY_AFTER_SECONDS_RE.test(trimmed)) {
    return Math.max(0, Math.round(Number(trimmed) * 1000));
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) {
    return;
  }
  return Math.max(0, dateMs - Date.now());
}

export async function handleErrorResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const responseBody = await response.text().catch(() => undefined);
  const { message: detail, code } = parseErrorJson(responseBody);
  const message = detail
    ? `API error ${response.status}: ${detail}`
    : `API error ${response.status}`;
  const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));

  throw new ApiError(message, {
    statusCode: response.status,
    responseBody,
    code,
    ...(retryAfterMs != null && { retryAfterMs }),
  });
}
