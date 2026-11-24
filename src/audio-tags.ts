const AUDIO_TAG_REGEX = /\[[^\]]+\]/g;

const AUDIO_TAG_SPLIT_REGEX = new RegExp(`(${AUDIO_TAG_REGEX.source})`);

/** The text split at its audio tags: script text at even indices, tags at odd ones. */
export function splitAtAudioTags(text: string): string[] {
  return text.split(AUDIO_TAG_SPLIT_REGEX);
}

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

  const stripped = textWithoutAudioTags(text);

  return { text: stripped, warnings };
}

export function textWithoutAudioTags(text: string): string {
  return text.replace(AUDIO_TAG_REGEX, "").replace(/\s+/g, " ").trim();
}
