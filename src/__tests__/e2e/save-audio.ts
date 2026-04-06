import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Writes audio to disk when the `SPEECH_SDK_E2E_OUTPUT_DIR` env var is set.
 *
 * Intended for e2e tests that want to make their generated audio available
 * for manual listening. Tests should call this with a stable, descriptive
 * name — the file extension is derived from the audio's `mediaType`.
 *
 * Usage:
 *   SPEECH_SDK_E2E_OUTPUT_DIR=./e2e-output pnpm run test:e2e
 */
export function saveAudioIfRequested(
  name: string,
  audio: { uint8Array: Uint8Array; mediaType: string }
): string | undefined {
  const dir = process.env.SPEECH_SDK_E2E_OUTPUT_DIR;
  if (!dir) {
    return;
  }

  mkdirSync(dir, { recursive: true });

  const ext = mediaTypeToExtension(audio.mediaType);
  const safeName = name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const filePath = join(dir, `${safeName}.${ext}`);

  writeFileSync(filePath, audio.uint8Array);
  return filePath;
}

function mediaTypeToExtension(mediaType: string): string {
  const type = mediaType.split(";")[0].trim().toLowerCase();
  switch (type) {
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "wav";
    case "audio/ogg":
      return "ogg";
    case "audio/opus":
      return "opus";
    case "audio/flac":
      return "flac";
    case "audio/aac":
      return "aac";
    case "audio/pcm":
      return "pcm";
    default:
      return "bin";
  }
}
