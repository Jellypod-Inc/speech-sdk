import { ApiError, MissingApiKeyError } from "./errors.js";

// Sent as X-User-Agent — User-Agent is a forbidden header name in browser fetch.
export const SDK_USER_AGENT = "jellypod-speech-sdk";

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
    const message = body.length > 200 ? `${body.slice(0, 200)}…` : body;
    return { message };
  }
}

// 501 is terminal — gateway uses it for "capability will never work" (e.g. timestamps_unsupported).
export function isRetriableApiError(error: ApiError): boolean {
  if (error.statusCode < 500) {
    return false;
  }
  if (error.statusCode === 501) {
    return false;
  }
  return true;
}

export async function handleErrorResponse(response: Response): Promise<void> {
  if (!response.ok) {
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
}
