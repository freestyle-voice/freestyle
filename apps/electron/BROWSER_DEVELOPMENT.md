# Browser development

From the repository root, after `pnpm install --frozen-lockfile`:

```sh
pnpm dev:browser
```

Open <http://127.0.0.1:5173>. This runs the actual desktop React UI with a browser implementation of the preload bridge. Electron and the Freestyle backend do not start. Deep links use the existing hash routes:

- `http://127.0.0.1:5173/index.html#/settings/models`
- `http://127.0.0.1:5173/index.html#/tone`
- `http://127.0.0.1:5173/index.html?scenario=error#/vocabulary`
- `http://127.0.0.1:5173/pill.html`
- `http://127.0.0.1:5173/notification.html`

The development toolbar selects `default`, `empty`, `signed-out`, `loading`, `error`, or `onboarding` fixtures. API state is in memory and resets on reload. The loading scenario holds page data requests pending; the error scenario fails selected list endpoints while keeping settings/auth available so you can inspect the real error UI. These are UI previews, not a complete simulation of transcription or agent execution. Unknown API requests return 501 and appear in the toolbar instead of reaching a live backend. Add explicit fixtures in `src/renderer/src/browser/fixtures.ts` for additional interactions.

## Use a real development backend

Build the server, then start it with a fresh database directory. Never point this workflow at your desktop user-data database.

```sh
pnpm turbo build --filter=@freestyle-voice/server...
preview_dir="$(mktemp -d)"
HOST=127.0.0.1 PORT=4650 \
  FREESTYLE_DB_PATH="$preview_dir/preview.sqlite" \
  FREESTYLE_LOG_DIR="$preview_dir" \
  FREESTYLE_AUTH_TOKEN=dev-browser-only \
  pnpm --filter @freestyle-voice/server start
```

In another terminal:

```sh
FREESTYLE_BROWSER_MODE=server \
  FREESTYLE_BROWSER_SERVER_URL=http://127.0.0.1:4650 \
  FREESTYLE_BROWSER_SERVER_TOKEN=dev-browser-only \
  pnpm dev:browser
```

This mode uses real API reads and writes and shows onboarding for a new database. Vite proxies `/api` and `/stream`, including WebSockets, to the explicitly configured loopback server. The bearer token stays in the Vite process. Change the target/token by restarting Vite; the desktop Network settings cannot change this browser configuration. Both Vite and the backend bind to loopback. This is a local development workflow, not a hosted web version of Freestyle.

## Native capabilities

Clipboard and microphone operations use browser APIs and browser permissions. Cross-app paste, accessibility, global shortcuts, background audio control, app updates, native plugin views, and native window positioning require Electron. Browser implementations return explicit failures or display a notice for unavailable actions. Window geometry calls and native event subscriptions are inert. Desktop launch/update switches and shortcut recording are disabled in the browser. Use Electron tests for native behavior.

Automation can inspect `window.freestyleBrowser` for the active mode, scenario, capability flags, and fixture diagnostics. Browser-only code is injected by `browser.vite.config.ts`; Electron's HTML entry points and production build keep using the real preload.

## Verification

```sh
pnpm --filter @freestyle-voice/electron exec playwright install chromium
pnpm test:browser
```

The suite builds and serves the browser preview, starts a temporary authenticated backend and a second Vite instance, and checks the main pages, scenarios, native failures, and real API writes. Ports 5173, 5174, and 4651 must be free; existing servers are never reused. Failures retain screenshots and Playwright traces. CI runs the same suite on Chromium.

To build or serve a compiled fixture preview:

```sh
pnpm --filter @freestyle-voice/electron build:browser
pnpm --filter @freestyle-voice/electron preview:browser
```
