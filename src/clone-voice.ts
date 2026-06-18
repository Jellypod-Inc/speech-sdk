import { base64ToUint8Array } from "./audio-utils.js";
import {
  CloneSampleFetchError,
  InvalidCloneFieldError,
  TooManyCloneSamplesError,
  VoiceCloningUnsupportedError,
} from "./errors.js";
import type { NormalizedSample, ResolvedModel } from "./speech-provider.js";

export type VoiceSample =
  | Uint8Array
  | { audio: string | Uint8Array; mediaType?: string; transcript?: string }
  | { url: string; transcript?: string };

export interface CloneVoiceOptions {
  abortSignal?: AbortSignal;
  apiKey?: string;
  files: VoiceSample | VoiceSample[];
  headers?: Record<string, string>;
  /** BCP-47. Defaults to "en" (with a warning) for providers that require it. */
  language?: string;
  /** Factory-resolved model. A bare "provider/model" string throws in v1. */
  model: ResolvedModel | string;
  name: string;
  providerOptions?: Record<string, unknown>;
}

export interface ClonedVoice {
  provider: string;
  providerMetadata?: Record<string, unknown>;
  voiceId: string;
  warnings?: string[];
}

export async function cloneVoice(
  options: CloneVoiceOptions
): Promise<ClonedVoice> {
  if (typeof options.model === "string") {
    throw new VoiceCloningUnsupportedError(
      options.model,
      'voice cloning requires a provider factory (e.g. createElevenLabs()("model")). The "provider/model" gateway string path is not supported yet.'
    );
  }

  const { provider } = options.model;
  const { modelId } = options.model;

  if (!provider.cloneVoice) {
    throw new VoiceCloningUnsupportedError(provider.id);
  }

  if (options.name.trim().length === 0) {
    throw new InvalidCloneFieldError(provider.id, "name", "must not be empty.");
  }

  const fileList = Array.isArray(options.files)
    ? options.files
    : [options.files];
  if (fileList.length === 0) {
    throw new InvalidCloneFieldError(
      provider.id,
      "files",
      "at least one audio sample is required."
    );
  }

  // Enforce the count before normalizing so oversized requests don't fetch every URL first.
  const max = provider.maxCloneSamples?.(modelId) ?? 1;
  if (fileList.length > max) {
    throw new TooManyCloneSamplesError(provider.id, max, fileList.length);
  }

  const samples = await normalizeSamples(fileList, options.abortSignal);

  const result = await provider.cloneVoice({
    modelId,
    samples,
    name: options.name,
    language: options.language,
    providerOptions: options.providerOptions,
    abortSignal: options.abortSignal,
    headers: options.headers,
  });

  return {
    voiceId: result.voiceId,
    provider: provider.id,
    ...(result.warnings?.length ? { warnings: result.warnings } : {}),
    ...(result.providerMetadata && {
      providerMetadata: result.providerMetadata,
    }),
  };
}

async function normalizeSamples(
  files: VoiceSample[],
  abortSignal: AbortSignal | undefined
): Promise<NormalizedSample[]> {
  return await Promise.all(
    files.map((file) => normalizeSample(file, abortSignal))
  );
}

async function normalizeSample(
  file: VoiceSample,
  abortSignal: AbortSignal | undefined
): Promise<NormalizedSample> {
  if (file instanceof Uint8Array) {
    return { bytes: file, mediaType: sniffAudioMediaType(file) };
  }
  if ("url" in file) {
    return await fetchSample(file.url, file.transcript, abortSignal);
  }
  const bytes =
    file.audio instanceof Uint8Array
      ? file.audio
      : base64ToUint8Array(file.audio);
  return {
    bytes,
    mediaType: file.mediaType ?? sniffAudioMediaType(bytes),
    ...(file.transcript != null && { transcript: file.transcript }),
  };
}

async function fetchSample(
  url: string,
  transcript: string | undefined,
  abortSignal: AbortSignal | undefined
): Promise<NormalizedSample> {
  let response: Response;
  try {
    response = await fetch(url, { signal: abortSignal });
  } catch (cause) {
    throw new CloneSampleFetchError(url, { cause });
  }
  if (!response.ok) {
    throw new CloneSampleFetchError(url, { statusCode: response.status });
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const headerType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
  return {
    bytes,
    mediaType:
      headerType && headerType.length > 0
        ? headerType
        : sniffAudioMediaType(bytes),
    ...(transcript != null && { transcript }),
  };
}

/** Best-effort container detection from magic bytes; defaults to audio/wav. */
export function sniffAudioMediaType(bytes: Uint8Array): string {
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return "audio/wav";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    return "audio/mpeg";
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: MP3 frame sync requires masking the top 3 bits of the second byte.
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return "audio/ogg";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    return "audio/flac";
  }
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return "audio/mp4";
  }
  return "audio/wav";
}

const EXTENSION_BY_MEDIA_TYPE: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/webm": "webm",
  "audio/aac": "aac",
};

/** File extension for a sample's media type, for multipart filenames. */
export function extensionForMediaType(mediaType: string): string {
  return EXTENSION_BY_MEDIA_TYPE[mediaType.toLowerCase()] ?? "wav";
}

/** Builds a multipart filename for the Nth sample, e.g. "sample-0.wav". */
export function cloneSampleFilename(
  sample: NormalizedSample,
  index: number
): string {
  return `sample-${index}.${extensionForMediaType(sample.mediaType)}`;
}

/**
 * Appends a providerOptions entry to a multipart form. Nullish values are
 * skipped (so an unset optional field isn't sent as the literal "null"), and
 * non-primitives are JSON-encoded.
 */
export function appendProviderOption(
  form: FormData,
  key: string,
  value: unknown
): void {
  if (value == null) {
    return;
  }
  const encoded =
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
      ? String(value)
      : JSON.stringify(value);
  form.append(key, encoded);
}
