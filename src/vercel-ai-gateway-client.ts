import { z } from "zod";
import { base64ToUint8Array, uint8ArrayToBase64 } from "./audio-utils.js";
import { MissingApiKeyError, type ProviderErrorStage } from "./errors.js";
import { handleErrorResponse, SDK_USER_AGENT } from "./provider-utils.js";

const DEFAULT_BASE_URL = "https://ai-gateway.vercel.sh/v4/ai";
const PROTOCOL_VERSION = "0.0.1";
const MODEL_SPECIFICATION_VERSION = "4";

export type VercelAIGatewayApiKey = string | (() => string | Promise<string>);

export interface VercelAIGatewayClientConfig {
  /**
   * Gateway API key, or a function returning one (e.g. Vercel's `getVercelOidcToken`, whose tokens rotate).
   * Defaults to `AI_GATEWAY_API_KEY`, then `VERCEL_OIDC_TOKEN`.
   */
  apiKey?: VercelAIGatewayApiKey;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
  /** Gateway routing order per speech-sdk provider id, e.g. `{ google: ["vertex", "google"] }`. */
  order?: Readonly<Record<string, readonly string[]>>;
}

export interface VercelAIGatewaySpeechRequest {
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  instructions?: string;
  /** Gateway model id, e.g. `google/gemini-3.8-flash-tts`. */
  model: string;
  outputFormat?: string;
  /** speech-sdk provider id, used to pick the routing order. */
  provider: string;
  providerOptions?: Record<string, unknown>;
  text: string;
  voice?: string;
}

export interface VercelAIGatewayTranscriptionRequest {
  abortSignal?: AbortSignal;
  audio: Uint8Array;
  mediaType: string;
  model: string;
  provider: string;
  providerOptions?: Record<string, unknown>;
}

const speechResponseSchema = z.object({
  audio: z.string(),
  providerMetadata: z.record(z.string(), z.unknown()).optional(),
});

const transcriptionResponseSchema = z.object({
  text: z.string().default(""),
  language: z.string().optional(),
  durationInSeconds: z.number().optional(),
  providerMetadata: z.record(z.string(), z.unknown()).optional(),
});

export type VercelAIGatewayTranscription = z.infer<
  typeof transcriptionResponseSchema
>;

/**
 * Sends speech and transcription requests through Vercel AI Gateway instead of a provider's own API.
 * Pass it to a provider factory as `client`; the provider still owns its models and request shape.
 */
export class VercelAIGatewayClient {
  readonly id = "vercel-ai-gateway";

  private readonly apiKey: VercelAIGatewayApiKey | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly order: Readonly<Record<string, readonly string[]>>;

  constructor(config: VercelAIGatewayClientConfig = {}) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? DEFAULT_BASE_URL;
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.order = config.order ?? {};
  }

  async speech(request: VercelAIGatewaySpeechRequest): Promise<{
    audio: Uint8Array;
    providerMetadata?: Record<string, unknown>;
  }> {
    const json = await this.post(
      "speech-model",
      request,
      "synthesis",
      {
        text: request.text,
        ...(request.voice && { voice: request.voice }),
        ...(request.instructions && { instructions: request.instructions }),
        ...(request.outputFormat && { outputFormat: request.outputFormat }),
        providerOptions: this.providerOptions(request),
      },
      request.headers
    );
    const { audio, providerMetadata } = speechResponseSchema.parse(json);
    return {
      audio: base64ToUint8Array(audio),
      ...(providerMetadata && { providerMetadata }),
    };
  }

  async transcription(
    request: VercelAIGatewayTranscriptionRequest
  ): Promise<VercelAIGatewayTranscription> {
    const json = await this.post(
      "transcription-model",
      request,
      "transcription",
      {
        audio: uint8ArrayToBase64(request.audio),
        mediaType: request.mediaType,
        providerOptions: this.providerOptions(request),
      }
    );
    return transcriptionResponseSchema.parse(json);
  }

  private providerOptions(request: {
    provider: string;
    providerOptions?: Record<string, unknown>;
  }): Record<string, unknown> {
    const order = this.order[request.provider];
    return {
      ...request.providerOptions,
      ...(order && { gateway: { order } }),
    };
  }

  private async post(
    endpoint: "speech-model" | "transcription-model",
    request: { provider: string; model: string; abortSignal?: AbortSignal },
    stage: ProviderErrorStage,
    body: Record<string, unknown>,
    headers?: Record<string, string>
  ): Promise<unknown> {
    const specificationHeader =
      endpoint === "speech-model"
        ? "ai-speech-model-specification-version"
        : "ai-transcription-model-specification-version";
    const response = await this.fetchFn(`${this.baseURL}/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this.resolveApiKey()}`,
        "Content-Type": "application/json",
        "ai-gateway-protocol-version": PROTOCOL_VERSION,
        [specificationHeader]: MODEL_SPECIFICATION_VERSION,
        "ai-model-id": request.model,
        "X-User-Agent": SDK_USER_AGENT,
        ...headers,
      },
      body: JSON.stringify(body),
      signal: request.abortSignal,
    });
    await handleErrorResponse(response, {
      provider: request.provider,
      model: request.model,
      stage,
    });
    return await response.json();
  }

  private async resolveApiKey(): Promise<string> {
    const configured =
      typeof this.apiKey === "function" ? await this.apiKey() : this.apiKey;
    const env = typeof process === "undefined" ? undefined : process.env;
    const key = configured || env?.AI_GATEWAY_API_KEY || env?.VERCEL_OIDC_TOKEN;
    if (!key) {
      throw new MissingApiKeyError({
        providerName: "Vercel AI Gateway",
        envVar: "AI_GATEWAY_API_KEY",
      });
    }
    return key;
  }
}

export function createVercelAIGatewayClient(
  config: VercelAIGatewayClientConfig = {}
): VercelAIGatewayClient {
  return new VercelAIGatewayClient(config);
}
