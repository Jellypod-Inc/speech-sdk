const AUDIO_TAG_REGEX = /\[[^\]]+\]/g;

export function detectAudioTags(text: string): string[] {
  return text.match(AUDIO_TAG_REGEX) ?? [];
}

export function stripAudioTags(
  text: string,
  modelIdentifier: string
): { text: string; warnings: string[] } {
  const tags = detectAudioTags(text);
  if (tags.length === 0) {
    return { text, warnings: [] };
  }

  const warnings = tags.map(
    (tag) =>
      `Audio tag ${tag} is not supported by ${modelIdentifier} and was removed.`
  );

  const stripped = text
    .replace(AUDIO_TAG_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();

  return { text: stripped, warnings };
}
