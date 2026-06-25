import type { SpeechProviderFactory } from "./clone-voice.js";
import {
  InvalidDesignFieldError,
  VoiceDesignUnsupportedError,
} from "./errors.js";
import type { VoiceDesignPreview } from "./speech-provider.js";

export type { VoiceDesignPreview } from "./speech-provider.js";

/**
 * Default preview text for providers that require a spoken sample at design
 * time. ~95 chars — long enough to exercise prosody without tripping minimums.
 */
export const DEFAULT_PREVIEW_TEXT =
  "The quick brown fox jumps over the lazy dog while the evening sun dips behind the hills.";

export interface DesignVoiceOptions {
  abortSignal?: AbortSignal;
  /** Natural-language description of the voice to design. */
  description: string;
  headers?: Record<string, string>;
  /** BCP-47. Used by providers that key voice design on language. */
  language?: string;
  /** Display name for the persisted voice. */
  name: string;
  /** Text spoken in the returned preview sample. Providers requiring it default it. */
  previewText?: string;
  /**
   * A provider factory, e.g. `createElevenLabs()`. Voice design is a
   * provider-level operation — the returned voice id works across all of that
   * provider's models, so no model id is needed here.
   */
  provider: SpeechProviderFactory;
  providerOptions?: Record<string, unknown>;
}

export interface DesignedVoice {
  /** Preview audio of the designed voice, when the provider returns one. */
  preview?: VoiceDesignPreview;
  provider: string;
  providerMetadata?: Record<string, unknown>;
  voiceId: string;
  warnings?: string[];
}

export async function designVoice(
  options: DesignVoiceOptions
): Promise<DesignedVoice> {
  const { provider } = options.provider();

  if (!provider.designVoice) {
    throw new VoiceDesignUnsupportedError(provider.id);
  }

  if (options.description.trim().length === 0) {
    throw new InvalidDesignFieldError(
      provider.id,
      "description",
      "must not be empty."
    );
  }

  if (options.name.trim().length === 0) {
    throw new InvalidDesignFieldError(
      provider.id,
      "name",
      "must not be empty."
    );
  }

  const result = await provider.designVoice({
    description: options.description,
    name: options.name,
    previewText: options.previewText,
    language: options.language,
    providerOptions: options.providerOptions,
    abortSignal: options.abortSignal,
    headers: options.headers,
  });

  return {
    voiceId: result.voiceId,
    provider: provider.id,
    ...(result.preview && { preview: result.preview }),
    ...(result.warnings?.length ? { warnings: result.warnings } : {}),
    ...(result.providerMetadata && {
      providerMetadata: result.providerMetadata,
    }),
  };
}
