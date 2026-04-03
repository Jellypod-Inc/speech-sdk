import { detect } from "tinyld";

const DEFAULT_LOCALE = "en-US";
const MIN_DETECTION_LENGTH = 20;

export interface FormatInfo {
  decimal: string;
  group: string;
}

const formatCache = new Map<string, FormatInfo>();

export function resolveLocale(text: string, localeOverride?: string): string {
  if (localeOverride) {
    return localeOverride;
  }

  if (text.length < MIN_DETECTION_LENGTH) {
    return DEFAULT_LOCALE;
  }

  try {
    const langCode = detect(text);
    if (!langCode) {
      return DEFAULT_LOCALE;
    }
    const maximized = new Intl.Locale(langCode).maximize().toString();
    const parts = maximized.split("-");
    if (parts.length === 3) {
      return `${parts[0]}-${parts[2]}`;
    }
    return maximized;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function getFormatInfo(locale: string): FormatInfo {
  const cached = formatCache.get(locale);
  if (cached) {
    return cached;
  }

  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1_234_567.89);
    const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
    const group = parts.find((p) => p.type === "group")?.value ?? ",";
    const info: FormatInfo = { decimal, group };
    formatCache.set(locale, info);
    return info;
  } catch {
    const fallback: FormatInfo = { decimal: ".", group: "," };
    formatCache.set(locale, fallback);
    return fallback;
  }
}
