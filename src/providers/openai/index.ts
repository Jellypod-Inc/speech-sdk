import { stripAudioTags } from "../../audio-tags.js";
import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";
import { buildOpenAIInstructionsFromTags } from "./instructions.js";

export interface OpenAISpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class OpenAISpeechProvider implements SpeechProvider<string, string> {
  readonly id = "openai";
  readonly defaultModel = "gpt-4o-mini-tts";

  private static readonly LANGUAGES = [
    "af",
    "ar",
    "bg",
    "bn",
    "bs",
    "ca",
    "cs",
    "cy",
    "da",
    "de",
    "el",
    "en",
    "es",
    "et",
    "fi",
    "fr",
    "gl",
    "gu",
    "he",
    "hi",
    "hr",
    "hu",
    "id",
    "is",
    "it",
    "ja",
    "jv",
    "ka",
    "kk",
    "km",
    "kn",
    "ko",
    "lo",
    "lt",
    "lv",
    "mk",
    "ml",
    "mn",
    "mr",
    "ms",
    "my",
    "ne",
    "nl",
    "no",
    "pa",
    "pl",
    "pt",
    "ro",
    "ru",
    "si",
    "sk",
    "sl",
    "so",
    "sq",
    "sr",
    "su",
    "sv",
    "sw",
    "ta",
    "te",
    "th",
    "tl",
    "tr",
    "uk",
    "ur",
    "vi",
    "zh",
  ] as const;

  readonly models = [
    {
      id: "gpt-4o-mini-tts",
      languages: OpenAISpeechProvider.LANGUAGES,
      releaseDate: "2025-03-20",
      audioTags: true,
      openSource: false,
      inlineVoiceCloning: false,
    },
    {
      id: "tts-1",
      languages: OpenAISpeechProvider.LANGUAGES,
      releaseDate: "2023-11-06",
      audioTags: false,
      openSource: false,
      inlineVoiceCloning: false,
    },
    {
      id: "tts-1-hd",
      languages: OpenAISpeechProvider.LANGUAGES,
      releaseDate: "2023-11-06",
      audioTags: false,
      openSource: false,
      inlineVoiceCloning: false,
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: OpenAISpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.openai.com/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private buildRequestInput(
    modelId: string,
    text: string,
    providerOptions: Record<string, unknown> | undefined
  ): { input: string; instructions: string | undefined } {
    if (modelId !== "gpt-4o-mini-tts") {
      return { input: text, instructions: undefined };
    }

    const { text: cleaned, instructions: derived } =
      buildOpenAIInstructionsFromTags(text);

    const userInstructions = providerOptions?.instructions;
    const userInstructionsStr =
      typeof userInstructions === "string" && userInstructions.length > 0
        ? userInstructions
        : undefined;

    let instructions: string | undefined;
    if (userInstructionsStr && derived) {
      instructions = `${userInstructionsStr}\n\n${derived}`;
    } else if (userInstructionsStr) {
      instructions = userInstructionsStr;
    } else if (derived) {
      instructions = derived;
    }

    return { input: cleaned, instructions };
  }

  processAudioTags(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] } {
    // gpt-4o-mini-tts supports the SDK audio tag syntax via the `instructions`
    // parameter. Leave raw tags in place so `generate()` can extract them and
    // build the instructions string in a single pass.
    if (modelId === "gpt-4o-mini-tts") {
      return { text, warnings: [] };
    }
    return stripAudioTags(text, `openai/${modelId}`);
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    const { input, instructions } = this.buildRequestInput(
      options.modelId,
      options.text,
      options.providerOptions
    );

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      model: options.modelId,
      input,
      voice: options.voice,
    };
    if (instructions !== undefined) {
      body.instructions = instructions;
    }

    const url = `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "OPENAI_API_KEY", "OpenAI")}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `openai/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get("content-type") ?? "audio/mpeg";

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
    };
  }
}

export function createOpenAI(config: OpenAISpeechProviderConfig = {}) {
  const provider = new OpenAISpeechProvider(config);

  return function openai(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
