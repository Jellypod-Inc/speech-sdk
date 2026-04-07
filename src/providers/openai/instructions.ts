const TAG_REGEX = /\[([^\]]+)\]/g;

interface Segment {
  tags: string[];
  text: string;
}

export function buildOpenAIInstructionsFromTags(input: string): {
  text: string;
  instructions: string | undefined;
} {
  // Tokenize into an alternating list of text chunks and tag runs.
  // Each Segment holds the tag(s) that apply to the text following them.
  // A leading text chunk (before any tag) becomes a segment with tags: [].
  const segments: Segment[] = [];
  let current: Segment = { tags: [], text: "" };
  let lastIndex = 0;

  for (const match of input.matchAll(TAG_REGEX)) {
    const matchIndex = match.index ?? 0;
    current.text += input.slice(lastIndex, matchIndex);
    lastIndex = matchIndex + match[0].length;

    // If the current segment already has text, close it and start a new one.
    // Otherwise (consecutive tags, or tag at position 0), keep accumulating
    // tags onto the same segment.
    if (current.text.length > 0) {
      segments.push(current);
      current = { tags: [], text: "" };
    }
    current.tags.push(match[1].trim().toLowerCase());
  }
  current.text += input.slice(lastIndex);
  segments.push(current);

  // Normalize whitespace in each segment's text.
  for (const seg of segments) {
    seg.text = seg.text.replace(/\s+/g, " ").trim();
  }

  // Build cleaned text: concatenate all segment texts with spaces.
  const cleanedText = segments
    .map((s) => s.text)
    .filter((t) => t.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  // No tags anywhere → no instructions.
  if (segments.every((s) => s.tags.length === 0)) {
    return { text: cleanedText, instructions: undefined };
  }

  // Build the ordered list of delivery "positions".
  const positions: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.tags.length === 0) {
      // Leading untagged text contributes "neutrally" only if it has content.
      if (i === 0 && seg.text.length > 0) {
        positions.push("neutrally");
      }
      continue;
    }
    positions.push(seg.tags.join(", "));
  }

  // Single-position case: "Speak X."
  if (positions.length === 1 && positions[0] !== "neutrally") {
    return { text: cleanedText, instructions: `Speak ${positions[0]}.` };
  }

  // Multiple positions → ordered shift directive.
  const parts = positions.map((p, i) => (i === 0 ? `begin ${p}` : `then ${p}`));
  const instructions = `Delivery shifts through the text in order: ${parts.join(
    ", "
  )}.`;

  return { text: cleanedText, instructions };
}
