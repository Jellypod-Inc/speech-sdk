// Honors DEBUG env var: "*", "speech-sdk", "speech-sdk:*", or comma list.
const NAMESPACE = "speech-sdk";

function debugEnabled(): boolean {
  if (typeof process === "undefined" || !process.env?.DEBUG) {
    return false;
  }
  const raw = process.env.DEBUG;
  if (raw === "*") {
    return true;
  }
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (
      trimmed === NAMESPACE ||
      trimmed === `${NAMESPACE}:*` ||
      trimmed.startsWith(`${NAMESPACE}:`)
    ) {
      return true;
    }
  }
  return false;
}

// Evaluated once — toggling DEBUG mid-process requires a re-import.
const ENABLED = debugEnabled();

export function debug(message: string): void {
  if (!ENABLED) {
    return;
  }
  console.debug(`[${NAMESPACE}] ${message}`);
}
