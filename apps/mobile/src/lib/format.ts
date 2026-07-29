// Locale-aware number formatting.
//
// Hermes ships full Intl support on all platforms. Passing "default" as the
// locale makes Intl.NumberFormat follow the device's locale, so grouping matches
// what the user expects — e.g. an Indian locale renders 1234567 as "12,34,567"
// while a US locale renders "1,234,567".

// Intl.NumberFormat construction is relatively expensive, so cache instances by
// the (locale, options) pair. "default" resolves to the device locale.
const cache = new Map<string, Intl.NumberFormat>();

function getFormatter(options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = options ? JSON.stringify(options) : "";
  let formatter = cache.get(key);

  if (!formatter) {
    formatter = new Intl.NumberFormat("default", options);
    cache.set(key, formatter);
  }

  return formatter;
}

/** Format a number using the device's locale (grouping, digits, etc.). */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return getFormatter(options).format(value);
}
