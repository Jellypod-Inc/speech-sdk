/**
 * Minimal debug-level logger. Emits a namespaced message only when the
 * `DEBUG` env var opts in (convention borrowed from the `debug` npm
 * package, without the dependency). Matches any of:
 *   DEBUG=*              enables everything
 *   DEBUG=speech-sdk     enables the SDK
 *   DEBUG=speech-sdk:*   same (wildcard namespace)
 *   DEBUG=foo,speech-sdk comma list
 */
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

// Evaluated once at module load; avoids reading env on every call in hot
// paths. Developers toggling DEBUG mid-process would need to re-import —
// acceptable trade-off since debug logging is an operator concern set at
// startup, not a runtime setting.
const ENABLED = debugEnabled();

export function debug(message: string): void {
  if (!ENABLED) {
    return;
  }
  console.debug(`[${NAMESPACE}] ${message}`);
}
