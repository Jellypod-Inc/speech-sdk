/**
 * Minimal debug-level logger. Emits a namespaced message only when the
 * environment opts in via `DEBUG` (same convention as the `debug` npm
 * package, without the dependency). Matches any of:
 *   DEBUG=*              enables everything
 *   DEBUG=speech-sdk     enables the SDK
 *   DEBUG=speech-sdk:*   same (wildcard namespace)
 *   DEBUG=foo,speech-sdk comma list
 *
 * Browser environments: the `DEBUG` localStorage key (e.g.,
 * `localStorage.setItem("DEBUG", "speech-sdk")`) is also honored for
 * symmetry with the `debug` package. Safe no-op when neither is present.
 */
const NAMESPACE = "speech-sdk";

function debugEnabled(): boolean {
  const raw = readDebugEnv();
  if (!raw) {
    return false;
  }
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

function readDebugEnv(): string | undefined {
  if (typeof process !== "undefined" && process.env?.DEBUG) {
    return process.env.DEBUG;
  }
  // `localStorage` property access itself can throw `SecurityError` in
  // restricted browser environments (cross-origin iframes, storage blocked
  // by CSP, Chrome policy, etc.) — not just calls to its methods. Wrap the
  // whole access in try/catch so importing this module can't crash.
  try {
    const ls = (
      globalThis as {
        localStorage?: { getItem?(k: string): string | null };
      }
    ).localStorage;
    const value = ls?.getItem?.("DEBUG");
    return value ?? undefined;
  } catch {
    return undefined;
  }
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
