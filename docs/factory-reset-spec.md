# Spec: Dev-only "Wipe Everything" Factory Reset

## Goal

Add a **development-only** action that performs a *factory reset* of Freestyle —
deleting every setting, configuration, API key, and history record — so a
developer can relaunch the app and experience the onboarding flow exactly as a
brand-new, first-time user would.

**Soft on models:** downloaded voice models and cached binaries
(`~/.cache/freestyle/`) are intentionally **kept**. They are large
(up to ~1.6 GB each), re-downloadable infrastructure that has no bearing on the
onboarding experience, so wiping them would only cost the developer minutes of
re-download on every reset. Onboarding will re-detect the already-downloaded
model and let the developer pick it again.

This is a strict superset of the existing `resetOnboarding()` helper
(`apps/electron/src/main/index.ts:512`), which only flips
`onboardingComplete` back to `false`. Factory reset wipes the underlying data
too, so even the DB-fallback "existing user" check
(`apps/electron/src/main/index.ts:288-303`) can't silently re-skip onboarding.

Like "Reset Onboarding", it is gated behind `is.dev` and surfaced only in dev
builds.

---

## Background: what counts as "onboarded"

`createSettingsWindow()` decides between `/onboarding` and `/today` using a
two-part check (`apps/electron/src/main/index.ts:283-308`):

1. `readSettings().onboardingComplete === true`, **OR**
2. the DB has any rows in `model_configs` (`SELECT COUNT(*) FROM model_configs`).

This means a true reset must clear **both** the `settings.json` flag **and** the
database. Just deleting `settings.json` would still skip onboarding if any model
was ever configured.

---

## Complete inventory of persisted state

Everything Freestyle writes to disk, grouped by what a reset must do with it.

### A. `settings.json` (Electron `userData`)

- Path: `join(app.getPath("userData"), "settings.json")`
  (`apps/electron/src/main/index.ts:68`)
- In-memory cache: `settingsCache` (`apps/electron/src/main/index.ts:63`) — must
  be invalidated as part of the reset.
- Keys written: `pillPosition`, `onboardingComplete`, `autoUpdate`,
  `showDashboardOnLaunch`.

### B. SQLite database (Electron `userData`)

- Path: `process.env.FREESTYLE_DB_PATH` =
  `join(app.getPath("userData"), "freestyle.db")`
  (`apps/electron/src/main/index.ts:901`).
- Opened as a **cached singleton** in `getDb()` (`apps/server/src/lib/db.ts:6`),
  with WAL mode enabled (`PRAGMA journal_mode = WAL`). A `closeDb()` already
  exists (`apps/server/src/lib/db.ts:29`) but is **not** re-exported from the
  package entry (`apps/server/src/index.ts` only exports the auto-start /
  reconcile helpers) — see Implementation step 0.
- Files on disk: `freestyle.db`, plus WAL sidecars `freestyle.db-wal` and
  `freestyle.db-shm`. All three must be deleted.
- Tables (`apps/server/src/lib/schema.ts`): `schema_version`, `settings`,
  `api_keys` (BYOK keys — OpenAI etc. live here, **not** the macOS Keychain),
  `model_configs`, `transcription_history`, `dictionary`, `format_rules`
  (10 seeded defaults), `vocabulary`.
- Settings rows of note: `hotkey`, `hotkey_mode`, `language`, `local_llm_url`,
  `local_llm_api_key`, `transcription_prompt`, `llm_cleanup`,
  `mlx_asr_keep_alive_minutes`, `telemetry_enabled`, `posthog_device_id`.

> Deleting the whole `.db` file (rather than truncating tables) is simplest:
> `initSchema()` recreates the schema and re-seeds default `format_rules` on the
> next `getDb()`.

### C. Downloaded models & cached binaries (`~/.cache/freestyle`) — **KEPT**

These are **not** under `userData`; they live in the user's cache dir, and the
reset **deliberately leaves them in place** (soft reset — see Goal):

- Whisper model weights — `~/.cache/freestyle/whisper-models/`
  (`apps/server/src/lib/whisper/constants.ts:127`). Up to ~1.6 GB each.
- Whisper binaries — `~/.cache/freestyle/whisper-bin/`
  (`apps/server/src/lib/whisper/constants.ts:178`).
- MLX-ASR runtime + worker — `~/.cache/freestyle/mlx-asr/`
  (`apps/server/src/lib/mlx-asr/constants.ts:85`).
- MLX-ASR model weights — HuggingFace hub cache at
  `~/.cache/huggingface/hub/` (or `$HUGGINGFACE_HUB_CACHE` / `$HF_HOME/hub`)
  (`apps/server/src/lib/mlx-asr/models.ts:75-86`). Shared with other HF tools;
  also kept.

Keeping these is safe: the reset wipes `model_configs` from the DB, so the app
forgets which model was *selected*, but the bytes on disk remain. During
re-onboarding the model picker shows the model as already downloaded, so the
developer re-selects it instantly instead of waiting on a multi-GB download.

### D. Ephemeral / temp (no action strictly required)

- Temp audio: `/tmp/freestyle-whisper/`, `/tmp/freestyle-mlx-asr/` — auto-cleaned
  after each transcription. Optional to sweep.
- Sidecar processes: whisper-server (port 8178), mlx-asr worker (port 8179),
  native key listener, mic listener — all in-memory, killed on quit. Must be
  **stopped before** deleting their binaries/DB (see ordering).

### E. OS-level state — **cannot** be reset programmatically

Document these as manual steps; the reset cannot touch them:

- **Microphone** permission (System Settings ▸ Privacy ▸ Microphone).
- **Accessibility** permission (System Settings ▸ Privacy ▸ Accessibility).
- **Launch at startup** login item (`app.setLoginItemSettings`,
  `apps/electron/src/main/index.ts:1108`). *We can* clear this one via
  `app.setLoginItemSettings({ openAtLogin: false })` — include it in the reset.
- `electron-updater` cache (library-managed, irrelevant to onboarding).

To also re-trigger the *permission prompts* during onboarding, the developer
must manually remove Freestyle from those two privacy panes (e.g.
`tlsctl reset Microphone com.freestyle.app` is **not** reliable; recommend doing
it by hand). This is a documented limitation, not part of the automated reset.

---

## Design

Reuse the existing dev-menu + IPC conventions. Two entry points, one shared
implementation.

### Entry points (both gated by `is.dev`)

1. **Tray context menu** — add a "Wipe All Data & Restart…" item next to the
   existing "Reset Onboarding" (`apps/electron/src/main/index.ts:645-653`).
2. **App menu** — same item in the dev block
   (`apps/electron/src/main/index.ts:700-708`).

Both call a new `factoryReset()` function in the main process. (Optional: also
expose an IPC channel `dev:factory-reset` via preload so a dev button in the
Settings UI can trigger it — follows the `contextBridge` pattern in
`apps/electron/src/preload/index.ts`. Not required for v1.)

### Confirmation

Because this is destructive, show a blocking confirm dialog first:

```ts
const { response } = await dialog.showMessageBox({
  type: "warning",
  buttons: ["Cancel", "Wipe Everything"],
  defaultId: 0,
  cancelId: 0,
  title: "Factory Reset (Dev)",
  message: "Delete all Freestyle settings & data and restart?",
  detail:
    "Removes settings, API keys, history, and dictionary/vocabulary, then " +
    "relaunches into onboarding. Downloaded voice models are kept. macOS " +
    "Microphone/Accessibility permissions are not affected.",
});
if (response !== 1) return;
```

---

## Implementation steps

### Step 0 — Export `closeDb` from the server package

`closeDb()` exists in `apps/server/src/lib/db.ts:29` but isn't exported from the
package root. Re-export it from `apps/server/src/index.ts` so the main process
can release the SQLite handle (WAL files stay locked otherwise on some
platforms):

```ts
// apps/server/src/index.ts
export { closeDb } from "./lib/db.js";
```

Then import it in the main process alongside the existing server imports
(`apps/electron/src/main/index.ts:22-25`).

### Step 1 — Add `factoryReset()` to the main process

Place near `resetOnboarding()` (`apps/electron/src/main/index.ts:512`).

Ordering matters — stop everything that holds a file handle or port before
deleting files:

```ts
import { rm } from "node:fs/promises";
import { closeDb } from "@freestyle/server";

async function factoryReset(): Promise<void> {
  // 1. Stop sidecar servers (release ports 8178/8179 + model files).
  await fetch(`http://127.0.0.1:${serverPort}/api/whisper/server/stop`, {
    method: "POST",
  }).catch(() => {});
  await fetch(`http://127.0.0.1:${serverPort}/api/mlx-asr/server/stop`, {
    method: "POST",
  }).catch(() => {});

  // 2. Stop native listeners.
  keyListener?.stop();
  keyListener = null;
  micListener?.stop();
  micListener = null;
  if (process.platform === "win32") globalShortcut.unregisterAll();

  // 3. Release the SQLite singleton so the .db / -wal / -shm unlock.
  try {
    closeDb();
  } catch {}

  // 4. Close the HTTP server.
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }

  // 5. Delete userData files. NOTE: downloaded models/binaries under
  //    ~/.cache/freestyle are intentionally NOT touched (soft reset).
  const userData = app.getPath("userData");
  for (const f of [
    "settings.json",
    "freestyle.db",
    "freestyle.db-wal",
    "freestyle.db-shm",
  ]) {
    await rm(join(userData, f), { force: true });
  }

  // 6. Invalidate the in-memory settings cache + login item.
  settingsCache = null;
  app.setLoginItemSettings({ openAtLogin: false });

  // 7. Relaunch into a clean first-run state.
  app.relaunch();
  app.exit(0);
}
```

Notes:
- `app.relaunch()` + `app.exit(0)` is the standard restart pattern; it is not
  currently used elsewhere in the codebase, so confirm it bypasses the
  `before-quit` guard (`apps/electron/src/main/index.ts:1423`). Using
  `app.exit(0)` (not `app.quit()`) skips the `before-quit` handler, which is what
  we want since cleanup is already done above.
- Wrap the destructive section in try/catch and log failures; a partial wipe
  should still relaunch.

### Step 2 — Wire up the menu items

In `buildTrayContextMenu()` (`apps/electron/src/main/index.ts:645-653`) and
`rebuildMenus()` (`apps/electron/src/main/index.ts:700-708`), add inside the
existing `is.dev` block:

```ts
{
  label: "Wipe All Data & Restart…",
  click: () => { void factoryReset(); },
},
```

### Step 3 (optional) — Settings-UI trigger

If a dev button in the dashboard is desired:
- Add `factoryResetDev: (): Promise<void> => ipcRenderer.invoke("dev:factory-reset")`
  to the preload `api` (`apps/electron/src/preload/index.ts`).
- Add `ipcMain.handle("dev:factory-reset", () => factoryReset())` in the
  `app.whenReady()` block, guarded by `is.dev`.
- Gate the button in the renderer behind a dev check.

---

## Reset ordering (summary)

1. `POST /api/whisper/server/stop`
2. `POST /api/mlx-asr/server/stop`
3. Stop `keyListener` + `micListener` (+ `globalShortcut.unregisterAll()` on Win)
4. `closeDb()`
5. `httpServer.close()`
6. Delete `settings.json`, `freestyle.db`, `freestyle.db-wal`, `freestyle.db-shm`
   (cache/models under `~/.cache/freestyle/` are **kept**)
7. `settingsCache = null`; clear login item
8. `app.relaunch()` → `app.exit(0)`

On relaunch: no `settings.json` → `onboardingComplete` is falsy; empty DB →
`model_configs` count is 0 → `createSettingsWindow()` loads `/onboarding`. The
previously downloaded voice model is still on disk, so the onboarding model
picker offers it as already-downloaded for instant re-selection.

---

## Decisions (resolved)

1. **Keep downloaded models — yes (soft reset).** The reset wipes `settings.json`
   + the DB but leaves `~/.cache/freestyle/` (and the shared HuggingFace hub
   cache) untouched, so re-onboarding never re-downloads gigabytes. This is the
   only reset variant; no separate "deep wipe" is planned for v1.
2. **Permission prompts during re-onboarding — accepted limitation.**
   Microphone/Accessibility stay granted at the OS level, so those onboarding
   steps appear already-satisfied. Reproducing the prompts requires manually
   removing Freestyle from the macOS privacy panes; this is out of scope for the
   automated reset and documented as a known limitation.

## Possible future extension

- A separate "Deep Wipe (incl. models)" dev item could additionally `rm -rf`
  `~/.cache/freestyle/` for the rare case of testing the model-download step of
  onboarding. Not needed now.
