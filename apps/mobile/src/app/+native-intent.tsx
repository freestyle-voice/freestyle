/** Resolve keyboard hand-offs and legacy agent links before native routing. */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    const normalized = path
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .replace(/^\/+/, "")
      .replace(/^\(app\)\//, "");
    const target = normalized.split(/[/?#]/)[0];
    if (
      [
        "dictate",
        "remix",
        "agent-thread",
        "connected-apps",
        "automations",
        "notifications",
      ].includes(target) ||
      /^settings\/approvals(?:[/?#]|$)/.test(normalized)
    ) {
      // The authenticated layout handles sign-in and first-run onboarding.
      // The resident provider drains pending keyboard commands on home.
      return "/(app)/(tabs)";
    }
    return path;
  } catch {
    return path;
  }
}
