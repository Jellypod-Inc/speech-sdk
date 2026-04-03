import { ToWords } from "to-words";
import { getFormatInfo } from "./locale-format.js";

const CURRENCY_SYMBOLS = "\\$€£¥₹₩₪₫₱₿฿₺₴₸";
const CURRENCY_SYMBOL_PATTERN = `[${CURRENCY_SYMBOLS}]|R\\$`;
const MAX_DIGITS = 15;
const FOUR_DIGIT_RE = /^\d{4}$/;

function convertToWords(num: number, locale: string): string | null {
  try {
    const tw = new ToWords({ localeCode: locale });
    return tw.convert(num).toLowerCase();
  } catch {
    try {
      const tw = new ToWords({ localeCode: "en-US" });
      return tw.convert(num).toLowerCase();
    } catch {
      return null;
    }
  }
}

function convertToWordsCurrency(num: number, locale: string): string | null {
  try {
    const tw = new ToWords({ localeCode: locale });
    return tw
      .convert(num, { currency: true, doNotAddOnly: true })
      .toLowerCase();
  } catch {
    try {
      const tw = new ToWords({ localeCode: "en-US" });
      return tw
        .convert(num, { currency: true, doNotAddOnly: true })
        .toLowerCase();
    } catch {
      return null;
    }
  }
}

function convertToOrdinal(num: number, locale: string): string | null {
  try {
    const tw = new ToWords({ localeCode: locale });
    return tw.toOrdinal(num).toLowerCase();
  } catch {
    try {
      const tw = new ToWords({ localeCode: "en-US" });
      return tw.toOrdinal(num).toLowerCase();
    } catch {
      return null;
    }
  }
}

function parseLocaleNumber(
  raw: string,
  decimal: string,
  group: string
): number | null {
  let cleaned = raw;
  // Strip group separators (including U+202F and U+00A0 for French)
  const groupEscaped = group.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  cleaned = cleaned.replace(new RegExp(groupEscaped, "g"), "");
  // Also strip narrow no-break space and regular no-break space used as group separators
  cleaned = cleaned.replace(/[\u202F\u00A0]/g, "");
  // Replace locale decimal with standard dot
  if (decimal !== ".") {
    const decimalEscaped = decimal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(decimalEscaped), ".");
  }
  const num = Number(cleaned);
  if (!Number.isFinite(num)) {
    return null;
  }
  return num;
}

function shouldSkipNumber(raw: string): boolean {
  // Skip if too many digits (IDs)
  const digitCount = raw.replace(/\D/g, "").length;
  if (digitCount > MAX_DIGITS) {
    return true;
  }
  // Skip 4-digit standalone numbers (years)
  if (FOUR_DIGIT_RE.test(raw)) {
    return true;
  }
  return false;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expandCurrencyPrefix(
  text: string,
  locale: string,
  decimal: string,
  group: string
): string {
  const decEsc = escapeRegex(decimal);
  const grpEsc = escapeRegex(group);
  const numPat = `\\d{1,3}(?:${grpEsc}\\d{3})*(?:${decEsc}\\d+)?|\\d+(?:${decEsc}\\d+)?`;
  const pattern = new RegExp(
    `(?<![\\w-])(${CURRENCY_SYMBOL_PATTERN})\\s*(${numPat})(?![\\w-])`,
    "g"
  );

  return text.replace(pattern, (_match, _sym, numStr) => {
    if (shouldSkipNumber(numStr)) {
      return _match;
    }
    const num = parseLocaleNumber(numStr, decimal, group);
    if (num === null) {
      return _match;
    }
    const words = convertToWordsCurrency(num, locale);
    return words ?? _match;
  });
}

function expandCurrencySuffix(
  text: string,
  locale: string,
  decimal: string,
  group: string
): string {
  const decEsc = escapeRegex(decimal);
  const grpEsc = escapeRegex(group);
  const numPat = `\\d{1,3}(?:${grpEsc}\\d{3})*(?:${decEsc}\\d+)?|\\d+(?:${decEsc}\\d+)?`;
  const pattern = new RegExp(
    `(?<![\\w-])(${numPat})\\s*(${CURRENCY_SYMBOL_PATTERN})(?![\\w-])`,
    "g"
  );

  return text.replace(pattern, (_match, numStr, _sym) => {
    if (shouldSkipNumber(numStr)) {
      return _match;
    }
    const num = parseLocaleNumber(numStr, decimal, group);
    if (num === null) {
      return _match;
    }
    const words = convertToWordsCurrency(num, locale);
    return words ?? _match;
  });
}

function expandOrdinals(text: string, locale: string): string {
  if (!locale.startsWith("en")) {
    return text;
  }
  const pattern = /(?<!\w)(\d+)(st|nd|rd|th)(?!\w)/g;
  return text.replace(pattern, (_match, numStr, _suffix) => {
    if (shouldSkipNumber(numStr)) {
      return _match;
    }
    const num = Number.parseInt(numStr, 10);
    if (!Number.isFinite(num)) {
      return _match;
    }
    const words = convertToOrdinal(num, locale);
    return words ?? _match;
  });
}

function expandGroupedIntegers(
  text: string,
  locale: string,
  decimal: string,
  group: string
): string {
  const grpEsc = escapeRegex(group);
  const pattern = new RegExp(
    `(?<![\\w-])(\\d{1,3}(?:${grpEsc}\\d{3})+)(?![\\w-])`,
    "g"
  );

  return text.replace(pattern, (_match, numStr) => {
    // Validate that each group after the first is exactly 3 digits
    const parts = numStr.split(group);
    const validGroups = parts.slice(1).every((p: string) => p.length === 3);
    if (!validGroups) {
      return _match;
    }
    if (shouldSkipNumber(numStr)) {
      return _match;
    }
    const num = parseLocaleNumber(numStr, decimal, group);
    if (num === null) {
      return _match;
    }
    const words = convertToWords(num, locale);
    return words ?? _match;
  });
}

function expandDecimals(
  text: string,
  locale: string,
  decimal: string,
  group: string
): string {
  const decEsc = escapeRegex(decimal);
  const pattern = new RegExp(`(?<![\\w-])(\\d+${decEsc}\\d+)(?![\\w-])`, "g");

  return text.replace(pattern, (_match, numStr) => {
    if (shouldSkipNumber(numStr)) {
      return _match;
    }
    const num = parseLocaleNumber(numStr, decimal, group);
    if (num === null) {
      return _match;
    }
    const words = convertToWords(num, locale);
    return words ?? _match;
  });
}

function expandPlainIntegers(
  text: string,
  locale: string,
  decimal: string,
  group: string
): string {
  const decEsc = escapeRegex(decimal);
  const grpEsc = escapeRegex(group);
  const pattern = new RegExp(
    `(?<![.\\w\\-${decEsc}${grpEsc}])(\\d+)(?![.\\w\\-${decEsc}${grpEsc}])`,
    "g"
  );
  return text.replace(pattern, (_match, numStr) => {
    if (shouldSkipNumber(numStr)) {
      return _match;
    }
    const num = Number.parseInt(numStr, 10);
    if (!Number.isFinite(num)) {
      return _match;
    }
    const words = convertToWords(num, locale);
    return words ?? _match;
  });
}

export function expandNumbers(text: string, locale: string): string {
  try {
    if (!text) {
      return text;
    }

    const { decimal, group } = getFormatInfo(locale);

    let result = text;
    result = expandCurrencyPrefix(result, locale, decimal, group);
    result = expandCurrencySuffix(result, locale, decimal, group);
    result = expandOrdinals(result, locale);
    result = expandGroupedIntegers(result, locale, decimal, group);
    result = expandDecimals(result, locale, decimal, group);
    result = expandPlainIntegers(result, locale, decimal, group);

    return result;
  } catch {
    return text;
  }
}
