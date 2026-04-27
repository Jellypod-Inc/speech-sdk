import { ApiError, MissingApiKeyError } from "./errors.js";

// Sent as X-User-Agent — User-Agent is a forbidden header name in browser fetch.
export const SDK_USER_AGENT = "jellypod-speech-sdk";

export function resolveApiKey(
  stored: string | undefined,
  envVar: string,
  providerName: string
): string {
  const key =
    stored ??
    (typeof process === "undefined" ? undefined : process.env?.[envVar]);
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
export function isRetriableApiError(error: ApiError): boolean {
  return error.statusCode >= 500 && error.statusCode !== 501;
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

  throw new ApiError(message, {
    statusCode: response.status,
    responseBody,
    code,
  });
}
