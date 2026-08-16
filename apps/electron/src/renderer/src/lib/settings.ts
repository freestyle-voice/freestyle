export function replaceSetting(
  settings: Record<string, string>,
  key: string,
  value: string,
): Record<string, string> {
  return { ...settings, [key]: value };
}

/** Preserve the previous Settings fallback after the initial query fails. */
export function settingsForView(
  settings: Record<string, string> | undefined,
  hasError: boolean,
): Record<string, string> | null {
  if (settings !== undefined) return settings;
  return hasError ? {} : null;
}
