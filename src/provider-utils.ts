import { ApiError, MissingApiKeyError } from "./errors.js";

// Identifies traffic originating from this SDK so providers can bucket
// usage by integration. Sent as `X-User-Agent` because `User-Agent` is
// a forbidden header name in browser fetch. Callers may override via
// options.headers.
export const SDK_USER_AGENT = "jellypod-speech-sdk";

/**
 * Split a `"provider/model"` spec into its parts. Spec with no slash is
 * treated as a bare provider name (caller falls back to `defaultModel`).
 */
export function parseProviderModelSpec(spec: string): {
  providerName: string;
  modelId: string | undefined;
} {
  const slashIndex = spec.indexOf("/");
  if (slashIndex === -1) {
    return { providerName: spec, modelId: undefined };
  }
  return {
    providerName: spec.slice(0, slashIndex),
    modelId: spec.slice(slashIndex + 1) || undefined,
  };
}

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

/**
 * Parse an error response body and extract the human-readable message + the
 * RFC 7807 `code` extension (if present). Handles both `application/json` and
 * `application/problem+json` shapes — both parse identically as JSON. Returns
 * a truncated raw body as the message for non-JSON payloads so callers still
 * get something useful to display.
 */
function parseErrorJson(body: string | undefined): {
  message?: string;
  code?: string;
} {
  if (!body) {
    return {};
  }
  try {
    const json = JSON.parse(body);
    let message: string | undefined;
    // Common error response shapes, in priority order.
    if (typeof json.error === "string") {
      message = json.error;
    } else if (typeof json.error?.message === "string") {
      message = json.error.message;
    } else if (typeof json.message === "string") {
      message = json.message;
    } else if (typeof json.detail === "string") {
      message = json.detail;
    } else {
      message = body.length > 200 ? `${body.slice(0, 200)}…` : body;
    }
    const code = typeof json.code === "string" ? json.code : undefined;
    return { message, code };
  } catch {
    // Not JSON — use raw text, truncated.
    const message = body.length > 200 ? `${body.slice(0, 200)}…` : body;
    return { message };
  }
}

/**
 * Classify an `ApiError` as retriable or terminal for `p-retry`. 4xx errors
 * are terminal (client bugs / auth issues never fix themselves on retry). 501
 * Not Implemented is terminal too: the gateway uses it to signal "this
 * capability will never work on this model" (e.g. `timestamps: "on"` on
 * `conversation`), with `code: "timestamps_unsupported"`. Every other 5xx is
 * assumed transient.
 */
export function isRetriableApiError(error: ApiError): boolean {
  if (error.statusCode < 500) {
    return false;
  }
  if (error.statusCode === 501) {
    return false;
  }
  return true;
}

export async function handleErrorResponse(
  response: Response,
  model: string
): Promise<void> {
  if (!response.ok) {
    const responseBody = await response.text().catch(() => undefined);
    const { message: detail, code } = parseErrorJson(responseBody);
    const message = detail
      ? `${model} API error ${response.status}: ${detail}`
      : `${model} API error ${response.status}`;

    throw new ApiError(message, {
      statusCode: response.status,
      model,
      responseBody,
      code,
    });
  }
}
