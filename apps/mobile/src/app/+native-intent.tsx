/**
 * Rewrites the keyboard's `freestyle://dictate` deep link before Expo Router
 * tries to route it.
 *
 * The iOS keyboard extension can't use the mic, so its mic button opens the app
 * via `freestyle://dictate` (the only mechanism that reliably launches the host
 * app from a keyboard on iOS 18+). Expo Router evaluates that URL by stripping
 * the scheme to a path — here that's `/dictate`. There is deliberately no
 * `/dictate` screen anymore: the resident dictation session lives in
 * `KeyboardDictationProvider` (mounted under the `(app)` group) and drains the
 * keyboard's `start` command on its own, surfacing a floating status strip
 * wherever the user is. So there's nothing to navigate to.
 *
 * Without this file, `/dictate` matches no route and Expo Router lands on the
 * `+not-found` screen — the app looks stuck after tapping the keyboard mic.
 * `redirectSystemPath` runs *before* routing (unlike a `_layout` effect, which
 * races Expo Router's own navigation), so we rewrite the dictation link to the
 * app's home tab and let the provider take over. Every other unknown URL still
 * falls through to `+not-found`, which surfaces the attempted path for
 * debugging.
 *
 * Must not throw — a throw here can crash the app on launch (see the Expo Router
 * "Customizing links" guide), so everything is wrapped defensively.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  try {
    // `path` may be a full URL (`freestyle://dictate`) or an already-stripped
    // path (`/dictate`) depending on launch vs. warm link. Normalize by pulling
    // the last non-empty segment after the scheme/slashes.
    const target = path
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") // drop `freestyle://`
      .replace(/^\/+/, "") // drop leading slashes
      .split(/[/?#]/)[0]; // first segment, sans query/hash

    if (target === "dictate") {
      // Land inside the authenticated app group where the provider is mounted.
      // If the user isn't signed in, the `(app)` layout redirects to sign-in.
      return "/(app)/(tabs)";
    }
    return path;
  } catch {
    return path;
  }
}
