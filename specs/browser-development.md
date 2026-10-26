# Browser development mode

## Design

Run the existing desktop renderer in a normal browser for agent-driven UI development, with no Electron process. Keep the production desktop entry points and native integrations intact. A browser bootstrap installs a typed implementation of the preload contract before importing the renderer. The contract is inferred from the desktop implementation so additions cannot silently drift.

Two workflows share the same routes and components: deterministic in-memory fixture previews (the default), and real API access through a loopback Vite proxy to an explicitly configured development server. Fixture mode never falls through to a real backend. Server mode does not read the desktop database or credentials. Native operations return explicit unsupported results or visible feedback; subscriptions and window geometry use safe browser implementations. Browser microphone/clipboard access continues to require browser permission.

Alternatives: sprinkling optional chaining across the UI hides missing behavior; maintaining a second frontend duplicates product UI. A bootstrap adapter gives incremental portability without a broad component rewrite. Native features still require Electron integration tests.

## Implementation plan

1. Add failing adapter tests for native failures, safe external URLs, configuration, event cleanup, and browser storage. Export the inferred preload API type and implement its browser counterpart.
2. Add a standalone Vite config and browser bootstrap; add strict fixture routing with default, empty, loading, error, and onboarding scenarios, plus visible preview controls. Add root development commands and document isolated server startup.
3. Add browser Playwright coverage for route loading, settings persistence, fixture failures, auxiliary surfaces, and the real standalone server. Verify typechecks, unit suites, browser/desktop builds, and Electron smoke tests.

## Verification focus

Missing fixture routes must fail explicitly without network fallback; malformed preview state must not prevent startup; server mode must preserve authorization and streaming paths; unavailable native actions must not report success; browser-only bootstrap code must stay outside production Electron bundles.

## Isolation and compatibility

The browser host configures both the general API base and the device-local API base to its own origin. This keeps MCP requests on the development proxy instead of the desktop server's default port. The proxy adds HTTP bearer authorization and WebSocket query authorization on the backend hop; neither credential is exposed to renderer code. Native plugin UI assets are blocked at the browser proxy, and the production server's plugin guard remains in force.

The notification fixture uses the same presentational card as the native notification surface. The production Electron build does not import the browser bootstrap or fixture toolbar.
