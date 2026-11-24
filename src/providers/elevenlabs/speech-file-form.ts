function audioExtension(mediaType: string): string {
  const base = mediaType.split(";")[0]?.toLowerCase();
  switch (base) {
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/flac":
      return "flac";
    case "audio/ogg":
    case "audio/opus":
      return "ogg";
    case "audio/webm":
      return "webm";
    default:
      return "mp3";
  }
}

// Multipart body with the audio as `file`, for the ElevenLabs endpoints that take an upload.
export function speechFileForm(audio: Uint8Array, mediaType: string): FormData {
  const form = new FormData();
  form.append(
    "file",
    new Blob([audio.slice()], { type: mediaType }),
    `speech.${audioExtension(mediaType)}`
  );
  return form;
}
