import {
  type ApiError,
  MissingApiKeyError,
  type ProviderErrorStage,
  SpeechSdkProviderError,
} from "./errors.js";

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

export function truncate(body: string): string {
  return body.length > 200 ? `${body.slice(0, 200)}…` : body;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringProperty(value: unknown, property: string): string | undefined {
  if (!isRecord(value)) {
    return;
  }
  const candidate = value[property];
  return typeof candidate === "string" ? candidate : undefined;
}

interface ParsedErrorBody {
  readonly code?: string;
  readonly details?: unknown;
  readonly message?: string;
  readonly messages: readonly string[];
  readonly providerCodes: readonly string[];
  readonly requestId?: string;
}

function nestedRecord(value: unknown, property: string): unknown {
  return isRecord(value) ? value[property] : undefined;
}

function errorBodyCandidates(json: unknown): readonly unknown[] {
  const error = nestedRecord(json, "error");
  const detail = nestedRecord(json, "detail");
  const details = nestedRecord(json, "details");
  return [
    json,
    error,
    detail,
    nestedRecord(error, "detail"),
    details,
    nestedRecord(details, "detail"),
    nestedRecord(details, "error"),
  ];
}

const GOOGLE_REQUEST_INFO_TYPE = "type.googleapis.com/google.rpc.RequestInfo";

function requestIdFromGoogleRequestInfo(error: unknown): string | undefined {
  const details = nestedRecord(error, "details");
  if (!Array.isArray(details)) {
    return;
  }

  for (const detail of details) {
    if (stringProperty(detail, "@type") !== GOOGLE_REQUEST_INFO_TYPE) {
      continue;
    }
    const requestId =
      stringProperty(detail, "requestId") ??
      stringProperty(detail, "request_id");
    if (requestId) {
      return requestId;
    }
  }
  return;
}

function parseErrorBody(body: string | undefined): ParsedErrorBody {
  if (!body) {
    return { messages: [], providerCodes: [] };
  }
  try {
    const json: unknown = JSON.parse(body);
    const error = isRecord(json) ? json.error : undefined;
    const detail = nestedRecord(json, "detail");
    const errorDetail = nestedRecord(error, "detail");
    const details = nestedRecord(json, "details");
    const messageCandidates = [
      typeof error === "string" ? error : undefined,
      stringProperty(error, "message"),
      stringProperty(json, "message"),
      stringProperty(json, "detail"),
      stringProperty(detail, "message"),
      stringProperty(errorDetail, "message"),
      stringProperty(details, "message"),
      stringProperty(nestedRecord(details, "detail"), "message"),
      stringProperty(nestedRecord(details, "error"), "message"),
    ];
    const messages = messageCandidates.filter(
      (candidate): candidate is string => typeof candidate === "string"
    );
    const message = messages[0] ?? truncate(body);
    const providerCodes = errorBodyCandidates(json)
      .map((candidate) => stringProperty(candidate, "code"))
      .filter((candidate): candidate is string => candidate !== undefined);
    const code =
      stringProperty(json, "code") ??
      stringProperty(error, "code") ??
      stringProperty(error, "status") ??
      stringProperty(json, "status") ??
      providerCodes[0];
    const requestId =
      stringProperty(json, "requestId") ??
      stringProperty(json, "request_id") ??
      stringProperty(error, "requestId") ??
      stringProperty(error, "request_id") ??
      requestIdFromGoogleRequestInfo(error);
    return {
      message,
      messages,
      code,
      providerCodes,
      details: json,
      requestId,
    };
  } catch {
    return {
      message: truncate(body),
      messages: [body],
      providerCodes: [],
      details: body,
    };
  }
}

const ELEVENLABS_CONTENT_POLICY_CODE = "content_policy";
const ELEVENLABS_TOS_MESSAGE = "may violate our terms of service";

function isElevenLabsContentPolicyError(
  status: number,
  provider: string,
  parsed: ParsedErrorBody
): boolean {
  if (provider !== "elevenlabs") {
    return false;
  }
  const isForbidden = parsed.providerCodes.some(
    (code) => code.toLowerCase() === "forbidden"
  );
  const mentionsTermsOfService = parsed.messages.some((message) =>
    message.toLowerCase().includes(ELEVENLABS_TOS_MESSAGE)
  );
  return (status === 403 && isForbidden) || mentionsTermsOfService;
}

// 501 is terminal — it signals "capability will never work" (e.g. timestamps_unsupported).
// 429 retry honors Retry-After in retry-options.ts (RFC 7231 §7.1.3).
export function isRetriableApiError(error: ApiError): boolean {
  if (error instanceof SpeechSdkProviderError) {
    return error.retryable;
  }
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

export interface ProviderErrorContext {
  readonly model?: string;
  readonly provider: string;
  readonly stage?: ProviderErrorStage;
}

const REQUEST_ID_HEADERS = [
  "request-id",
  "x-request-id",
  "x-goog-request-id",
  "x-amzn-requestid",
] as const;

function responseRequestId(response: Response): string | undefined {
  for (const header of REQUEST_ID_HEADERS) {
    const value = response.headers.get(header);
    if (value) {
      return value;
    }
  }
  return;
}

export async function handleErrorResponse(
  response: Response,
  context: ProviderErrorContext
): Promise<void> {
  if (response.ok) {
    return;
  }
  const rawResponse = await response.text().catch(() => undefined);
  const parsed = parseErrorBody(rawResponse);
  const isContentPolicyError = isElevenLabsContentPolicyError(
    response.status,
    context.provider,
    parsed
  );
  const message = parsed.message
    ? `API error ${response.status}: ${parsed.message}`
    : `API error ${response.status}`;
  const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
  const retryable =
    !isContentPolicyError &&
    (response.status === 429 ||
      (response.status >= 500 && response.status !== 501));

  throw new SpeechSdkProviderError(message, {
    status: response.status,
    provider: context.provider,
    model: context.model,
    code: isContentPolicyError ? ELEVENLABS_CONTENT_POLICY_CODE : parsed.code,
    details: parsed.details,
    rawResponse,
    requestId: responseRequestId(response) ?? parsed.requestId,
    retryable,
    stage: context.stage,
    ...(retryAfterMs != null && { retryAfterMs }),
  });
}
