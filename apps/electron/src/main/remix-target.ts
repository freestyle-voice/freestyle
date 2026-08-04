/**
 * Whether a frontmost app may be a Remix target. Freestyle's own windows are
 * normally excluded; onboarding's practice mode suspends that exclusion so the
 * agent can drive the practice draft inside our window.
 */
export function isRemixTargetAllowed(
  appName: string | null,
  exclusions: ReadonlySet<string>,
  practiceTarget: boolean,
): boolean {
  if (!appName) return false;
  return practiceTarget || !exclusions.has(appName.trim().toLowerCase());
}
