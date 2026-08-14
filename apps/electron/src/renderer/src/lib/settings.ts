export function replaceSetting(
  settings: Record<string, string>,
  key: string,
  value: string,
): Record<string, string> {
  return { ...settings, [key]: value };
}
