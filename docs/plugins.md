# Freestyle Plugins

Everything you need to understand, build, and ship a Freestyle plugin.

Freestyle's plugin system lets third-party (and first-party) code extend the
dictation pipeline — rewrite transcripts, steer LLM cleanup, transform final
text, control how text is delivered — and contribute their own UI pages inside
the app. The design is deliberately modeled on
[Vite's plugin API](https://vite.dev/guide/api-plugin): a plugin is a **named
object** with optional `enforce` metadata and the hooks it implements.

This document covers:

- [The big picture](#the-big-picture) — what a plugin is and where it runs
- [Architecture](#architecture) — the SDK, the two hosts, and how they connect
- [The plugin contract](#the-plugin-contract) — the `Plugin` object and lifecycle
- [Hooks](#hooks) — every extension point, what fires it, and what you mutate
- [Events](#events) — the read-only observer hook
- [UI pages](#ui-pages) — contributing a page and the `window.freestyle` bridge
- [How plugins are loaded](#how-plugins-are-loaded) — discovery, ordering, install
- [Anatomy of a plugin](#anatomy-of-a-plugin-audio-transcription) — the audio-transcription plugin, file by file
- [Build your own plugin](#build-your-own-plugin) — step-by-step from the template
- [Release & publishing](#release--publishing) — how first-party plugins ship
- [Reference](#reference) — file map and tables

---

## The big picture

A Freestyle plugin is an **npm-style package** (or a single local file) that
exports a default **factory function**. The factory returns a plugin object —
a `name` plus the hooks it cares about. Freestyle loads that module into its two
processes and calls your hooks at the right moments in the dictation pipeline.

There are two things a plugin can do, independently or together:

1. **Hook into the pipeline** (`src/index.ts`) — run code when a recording is
   transcribed, cleaned, or delivered. This is headless logic.
2. **Contribute a UI page** (`ui/` + a declaration in `package.json`) — a
   sandboxed web page the app renders in the Plugins hub, with a privileged
   bridge back to the local server.

The two existing plugins map cleanly onto this:

| Plugin | Hooks | UI page | What it demonstrates |
| --- | --- | --- | --- |
| [`plugins/example`](../plugins/example) | `event` (read-only) | minimal `<h1>` | The smallest possible plugin — a copy-me template |
| [`plugins/audio-transcription`](../plugins/audio-transcription) | none (just `setup`) | full drag-and-drop page | A UI-driven plugin that calls the server through the bridge |

---

## Architecture

### Three pieces

```
packages/sdk  →  freestyle-voice          The public contract + host-agnostic runtime
apps/server   →  @freestyle-voice/server  The dictation backend (Hono on 127.0.0.1)
apps/electron →  the desktop app          Electron main + renderer + plugin UI host
```

**`packages/sdk` (`freestyle-voice`)** is the package plugins depend on. It
ships:

- The **types** that form the contract — `Plugin`, `Hooks`, `PluginContext`,
  `FreestyleEvent`, `FreestyleBridge`, etc.
- A **host-agnostic runtime** — the loader (`loadPlugins`), the registry
  (`PluginRegistry`), ordering (`sortPlugins`), the `transform` helper, and the
  manifest parsers (`parsePluginPages`, `pluginSlug`).

The SDK does *not* contain any server or Electron code. The hosts inject their
own settings, directories, logging, and error reporting through the loader's
options. This is why the same loader powers both processes.

### Two hosts, one plugin

A plugin is loaded into **both** processes:

- The **server** (`apps/server`) runs transcription and cleanup. It invokes the
  server hooks: `config`, `afterTranscribe`, `beforeCleanup`, `afterCleanup`.
- The **Electron main process** (`apps/electron`) runs OS integration and
  output. It invokes the app hook: `beforeOutput`.
- The `event` hook runs in **both**, but every event type is emitted by exactly
  one process, so a handler sees each event **once** — never duplicated.
- `setup` / `dispose` run **once per host** (so potentially twice total). Branch
  on `ctx.mode` (`"server"` | `"app"`) when behavior differs.

You don't configure any of this routing. You write the hooks you need; each host
only calls the ones that belong to it.

> **Per-host installation.** The server may be **remote**, so the two hosts have
> separate `node_modules`/plugin folders. A plugin only runs where it's actually
> installed — a server-only plugin loads on the server and is silently skipped on
> the desktop, and vice-versa. The `plugins` / `disabled_plugins` settings are
> **server-owned and shared**: enabling or disabling a plugin reloads *both*
> registries, so its hooks start/stop everywhere immediately, with no restart.

### Where the wiring lives (host side)

You don't need to touch these to write a plugin, but here's the map for the
curious:

| Concern | Server | Electron |
| --- | --- | --- |
| Load registry | `apps/server/src/lib/plugins/loader.ts` → `loadServerPlugins()` | `apps/electron/src/main/plugins/loader.ts` → `loadAppPlugins()` |
| Init at boot | `apps/server/src/lib/plugins/index.ts` → `initServerPlugins()` | `apps/electron/src/main/plugins/index.ts` → `initAppPlugins()` |
| `afterTranscribe` | `apps/server/src/routes/transcribe.ts`, `routes/stream.ts` | — |
| `beforeCleanup` / `afterCleanup` | `apps/server/src/lib/post-process.ts` | — |
| `beforeOutput` / `OutputDelivered` | — | `apps/electron/src/main/index.ts` |
| UI protocol + bridge | — | `apps/electron/src/main/plugins/ui.ts`, `ui-host.ts`, `src/preload/plugin-bridge.ts` |
| Install / catalog API | `apps/server/src/routes/plugins.ts`, `lib/plugins/install-service.ts` | `apps/electron/src/main/plugins/loader.ts` |

---

## The plugin contract

A plugin **module** exports a default **factory**. The factory runs once at
load; the hooks it returns run many times.

```ts
import type { Plugin } from "freestyle-voice";

export default function myPlugin(): Plugin {
  return {
    name: "freestyle-plugin-my",
    enforce: "pre", // optional — chain position

    setup({ logger, mode }) {
      logger.info(`ready on ${mode}`); // mode: "server" | "app"
    },

    afterCleanup: (_input, output) => {
      output.text = output.text.replace(/\bteh\b/g, "the");
    },
  };
}
```

### The `Plugin` object

| Field | Required | Purpose |
| --- | --- | --- |
| `name` | yes | Stable identifier — shown in logs, telemetry, and the settings UI |
| `enforce` | no | `"pre"` runs first, `"post"` runs last, unset runs in between |
| `setup` | no | Lifecycle: runs once per host with `PluginContext`, before any hook |
| `dispose` | no | Lifecycle: runs once per host on teardown |
| _hooks_ | no | Any of the [hooks](#hooks), flat on the object |

### The factory and presets

The default export is a `PluginFactory`: `(options?) => Plugin | Plugin[] | falsy`.

- Return a single plugin for the common case.
- Return an **array** (a "preset") and the loader flattens it — useful for
  shipping a bundle of related plugins from one package.
- Return (or include) a **falsy** value to conditionally disable — handy for
  toggles driven by `options`.

```ts
export default function pack(opts?: { extras?: boolean }): Plugin[] {
  return [base(), opts?.extras !== false && extras()].filter(Boolean) as Plugin[];
}
```

In settings, an entry can carry options as a tuple: `["@acme/pack", { "extras": true }]`.

> Only the module's **default export** is treated as a factory. Named exports are
> ignored by the loader, so you can export helpers freely.

### `setup`, `dispose`, and `PluginContext`

`setup` runs once per host before any hook. Capture what your hooks need in a
closure. It receives a `PluginContext`:

```ts
interface PluginContext {
  name: string;                  // your declared name
  mode: "server" | "app";        // which process you're in
  directory: string;             // user-data dir (db, settings, plugins live here)
  logger: PluginLogger;          // structured logger scoped to your plugin
  settings: SettingsReader;      // read-only settings access
}
```

`SettingsReader` exposes `get(key)` (global settings) and `getOwn(key)`
(your plugin's own namespaced settings). Writes are intentionally not exposed
in V1.

Use the `logger` rather than `console` — it mirrors the host's Winston logger so
plugin logs are formatted consistently.

---

## Hooks

Every hook is **optional** and may be **async**. Hooks live flat on the plugin
object. Within a hook, all implementing plugins run in resolved order
(`enforce: "pre"` → unset → `"post"`, then load order), each awaited in
sequence.

**Mutating hooks** receive a read-only `input` (what's happening) and a mutable
`output` you **edit in place**. Return values are ignored — *except* `config`,
which returns a partial. A throwing hook is caught and logged by the host; it
can never crash a dictation.

### Server hooks (dictation backend)

| Hook | When it fires | You mutate |
| --- | --- | --- |
| `config` | Server boot, after settings load | *return* a partial config (deep-merged in plugin order) |
| `afterTranscribe` | Right after speech-to-text, before cleanup | `output.text` (raw transcript) |
| `beforeCleanup` | While the LLM cleanup prompt is assembled (only when cleanup is enabled) | `output.system[]`, `output.register` |
| `afterCleanup` | On the final text, always (the dictionary stage) | `output.text` (chained across plugins) |

`afterCleanup` is the **flagship text-rewrite seam**. It fires on the final text
whether or not LLM cleanup ran, in the same stage as built-in dictionary
replacement. Plugins form a chain: each receives the previous plugin's
`output.text`.

```ts
afterCleanup: (input, output) => {
  output.text = output.text.replace(/\bteh\b/g, "the");
},
```

`beforeCleanup` lets you inject system-prompt fragments or override the inferred
writing register before the LLM runs:

```ts
beforeCleanup: (input, output) => {
  output.system.push("Prefer British spelling.");
  output.register = "formal"; // "formal" | "casual" | "neutral"
},
```

### App hook (Electron main process)

| Hook | When it fires | You mutate |
| --- | --- | --- |
| `beforeOutput` | Just before final text is delivered to the focused app | `output.text`, `output.mode` |

`output.mode` is an `OutputMode` controlling delivery:

| Value | Constant | Behavior |
| --- | --- | --- |
| `"paste"` | `OutputMode.Paste` | Copy to clipboard, synthesize Cmd/Ctrl+V into the focused app |
| `"clipboard"` | `OutputMode.Clipboard` | Copy to clipboard only; the user pastes manually |
| `"none"` | `OutputMode.None` | Suppress delivery — nothing pasted or copied |

```ts
import { OutputMode } from "freestyle-voice";

beforeOutput: (input, output) => {
  if (/terminal/i.test(input.appContext?.appName ?? "")) {
    output.mode = OutputMode.Clipboard; // don't auto-paste into a terminal
  }
},
```

`"none"` is useful for voice-command plugins that *consume* the utterance instead
of typing it.

### The `transform` helper

For the common single-rewrite case, `transform` wraps a pure `(text) => text`
function into the `afterCleanup` shape so you skip the `(input, output)`
mutation convention:

```ts
import { transform, type Plugin } from "freestyle-voice";

export default function trim(): Plugin {
  return {
    name: "freestyle-plugin-trim",
    afterCleanup: transform((text) => text.trimEnd()),
  };
}
```

### App-aware behavior

Every mutating hook's `input` carries an optional `appContext` describing the
application the user was dictating into. Self-filter inside the handler:

```ts
afterCleanup: (input, output) => {
  if (/slack/i.test(input.appContext?.appName ?? "")) {
    output.text = output.text.replace(/[.,!?]+$/, ""); // no trailing punctuation in Slack
  }
},
```

`AppContext` fields (all optional, OS introspection can fail): `appName`,
`windowTitle`, `url`, `bundleId`.

---

## Events

The read-only `event` hook receives a discriminated `FreestyleEvent`. It cannot
influence behavior — use the mutating hooks for that. It's for observation:
logging, metrics, side effects.

```ts
import { FreestyleEventType } from "freestyle-voice";

event: ({ event }) => {
  switch (event.type) {
    case FreestyleEventType.RecordingStarted:   break;
    case FreestyleEventType.RecordingCommitted: break;
    case FreestyleEventType.RecordingCancelled: break;
    case FreestyleEventType.Transcribed:        /* event.text, event.durationInSeconds */ break;
    case FreestyleEventType.Cleaned:            /* event.before, event.after */ break;
    case FreestyleEventType.OutputDelivered:    /* event.text, event.mode */ break;
    case FreestyleEventType.PipelineError:      /* event.stage, event.message */ break;
  }
},
```

`recording*` and `output*` fire in the Electron main process; `transcribed` and
`cleaned` fire on the server. Because each type is emitted by exactly one
process, your handler is delivered each event exactly once even though the plugin
is loaded in both. `FreestyleEventType` and `PipelineStage` are const objects
(not TS enums) — match the constant or the bare string literal.

---

## UI pages

A plugin can contribute one or more pages the app renders inside the Plugins
hub. A page is **plain static web content** (HTML/CSS/JS) built into the
plugin's `dist/`, served by the host over a custom `freestyle-plugin://`
protocol, and rendered in a **sandboxed** web view with no Node or IPC access.

### Declaring a page

Pages are declared in `package.json` under `freestyle.contributes.pages`:

```json
{
  "freestyle": {
    "icon": "FileMusic",
    "contributes": {
      "pages": [
        {
          "id": "transcribe-files",
          "title": "Transcribe Files",
          "entry": "dist/ui/index.html"
        }
      ]
    }
  }
}
```

| Field | Required | Purpose |
| --- | --- | --- |
| `freestyle.icon` | no | Lucide icon for the plugin in the hub (PascalCase `"FileMusic"` or kebab `"file-music"`); falls back to a default |
| `pages[].id` | yes | Stable, plugin-unique id (used in the page route) |
| `pages[].title` | yes | Display title in the hub and as the page heading |
| `pages[].entry` | yes | Path to the page's HTML, relative to the package root (built output, e.g. `dist/ui/index.html`) |
| `pages[].icon` | no | Optional per-page Lucide icon |

The host parses this block tolerantly via `parsePluginPages` — malformed or
duplicate entries are dropped rather than crashing discovery.

### The `window.freestyle` bridge

A page is sandboxed and **cannot reach the loopback server directly**. The host
injects a privileged bridge as `window.freestyle` (typed as `FreestyleBridge`) —
the only privileged surface available to page content:

```ts
interface FreestyleBridge {
  readonly serverUrl: string;       // e.g. http://127.0.0.1:4649
  readonly token?: string;          // bearer token, when configured
  api(path, init?): Promise<FreestyleResponse>;  // pre-authed, host-proxied fetch
  invoke<C>(channel, payload): Promise<void>;    // host actions
}
```

- **`api(path, init)`** proxies a `fetch` through the host. The token is attached
  automatically and the request is routed past the sandbox/mixed-content
  boundary. It resolves a lightweight `FreestyleResponse` (`.ok`, `.status`,
  `.json()`, `.text()`, `.arrayBuffer()`) — not a native `Response`.
- **`invoke(channel, payload)`** triggers a small set of host actions:

  | Channel | Payload | Effect |
  | --- | --- | --- |
  | `copy` | `{ text }` | Copy text to the clipboard |
  | `toast` | `{ message, variant? }` | Show a transient notification |
  | `navigate` | `{ to }` | Navigate the host to an app route |

Always guard for the bridge's absence (e.g. when previewing the page outside the
host):

```ts
const bridge = window.freestyle;
if (!bridge) { /* degrade gracefully */ }
const res = await bridge.api("/api/transcribe", { method: "POST", body });
if (res.ok) console.log(await res.json());
```

### A fully-typed server client (optional)

For end-to-end type safety against the server API, add
`@freestyle-voice/server` as a **dev dependency** (type-only — nothing ships at
runtime) and hand Hono's `hc` the bridge's `fetch`:

```ts
import { hc } from "hono/client";
import type { AppType } from "@freestyle-voice/server";

const client = hc<AppType>(window.freestyle.serverUrl, {
  fetch: (input, init) =>
    window.freestyle.api(typeof input === "string" ? input : input.toString(), init),
});

const res = await client.api.transcribe.$post({ form: { audio } });
```

The SDK intentionally does **not** re-export `AppType` (the server depends on the
SDK, so re-exporting would create a build cycle). Importing it straight from the
server package keeps the graph acyclic, and `import type` adds zero runtime
weight.

### Content Security Policy

Because pages are real web content, give them a tight CSP `<meta>` tag. The
audio-transcription page allows `connect-src` to the loopback server and Google
Fonts; the example page is stricter. Start from one of those and only widen what
you need.

---

## How plugins are loaded

### Two sources

Plugins are loaded from two places (see the SDK README and `loader.ts`):

1. **Local files** — a `.js`, `.mjs`, or `.ts` module dropped into
   `<userData>/plugins/`. `.ts` files use Node's native type-stripping, so stick
   to plain, strippable TypeScript (no `enum`s, `namespace`s, or anything that
   requires emit). Discovered files are sorted by name for stable load order.
2. **npm packages** — package names listed in the `plugins` setting. The
   installer materializes them under `<userData>/plugins/<slug>/` and the loader
   resolves each to its `package.json#main` entry.

`<userData>/plugins/` is derived from `FREESTYLE_DB_PATH`
(`defaultLocalPluginsDir()`); it's `null` for a remote-server config with no
local database.

### Load order

`loadPlugins` runs this sequence (`packages/sdk/src/loader.ts`):

1. **entries** (npm specifiers from the `plugins` setting), in order
2. **local files** (sorted by name), after entries
3. flatten presets / drop falsy results
4. run each plugin's `setup` in load order
5. sort by `enforce` — stable (`sortPlugins`): `"pre"` → unset → `"post"`,
   preserving load order within each band
6. return a `PluginRegistry`

The registry runs hooks: `run()` for mutating hooks, `emit()` for events,
`resolveConfig()` for the `config` chain, `dispose()` on teardown. Every handler
is wrapped so a throwing plugin is reported to the host's `onError` and never
crashes the pipeline.

### Installing, enabling, disabling

Installation is server-owned and synced to both hosts (the server may be
remote):

| Action | API (server) | Effect |
| --- | --- | --- |
| Browse | `GET /api/plugins/catalog` | Lists browseable plugins |
| Install | `POST /api/plugins/install` (`npmName`, `version?`) | npm-installs into the plugins dir, adds to `plugins` setting, reloads both registries |
| Uninstall | `POST /api/plugins/uninstall` (`specifier`) | Removes from `plugins` setting and disk |
| Reload | `POST /api/plugins/reload` | Forces a registry reload |

Enabling/disabling toggles the **`disabled_plugins`** setting (the plugin stays
installed). Both hosts honor `plugins` and `disabled_plugins`, and a change
reloads both registries so hooks start/stop immediately with no restart.

---

## Anatomy of a plugin: audio-transcription

[`plugins/audio-transcription`](../plugins/audio-transcription) is the canonical
first-party example. It adds a **Transcribe Files** page where you drop audio
files and get clean text back, reusing your configured voice model. It's a
**UI-driven** plugin: almost all the logic lives in the page, and the hook module
is intentionally tiny.

### File map

```
plugins/audio-transcription/
  package.json        name, the contributed page, build scripts, the freestyle manifest
  .craft.yml          independent release pipeline config
  tsconfig.json       config for the hook module (src/)
  vite.config.ts      builds ui/ into dist/ui
  src/
    index.ts          the plugin: name + setup (no pipeline hooks)
  ui/
    index.html        the page (declares its CSP, loads main.ts)
    tsconfig.json     config for the page (DOM libs enabled)
    vite-env.d.ts     vite client types
    src/
      main.ts         page logic: drag/drop, upload via bridge, render results
      to-wav.ts       decode + resample any audio file to 16 kHz mono WAV
      styles.css      page styling
```

### The hook module — `src/index.ts`

It has no pipeline hooks, because transcribing dropped files doesn't alter live
dictation. `setup` only announces the plugin in logs:

```ts
import type { Plugin } from "freestyle-voice";

export default function audioTranscriptionPlugin(): Plugin {
  return {
    name: "@freestyle-voice/plugin-audio-transcription",
    setup({ logger, mode }) {
      logger.info(`audio-transcription ready on ${mode}`);
    },
  };
}
```

### The page — `ui/src/main.ts`

This is where the work happens. The flow per dropped file:

1. Read `window.freestyle` (the bridge); fail gracefully if absent.
2. Decode and resample the file to **16 kHz mono PCM WAV** with the Web Audio
   API (`to-wav.ts`) — Freestyle's transcription providers expect that format,
   so doing it client-side means any common format (`wav`, `mp3`, `m4a`, `ogg`,
   `flac`, `webm`) works regardless of provider.
3. Upload the WAV **as a raw `ArrayBuffer` body** (not multipart) to
   `POST /api/transcribe` via `bridge.api(...)`:

   ```ts
   const res = await bridge.api("/api/transcribe", {
     method: "POST",
     headers: { "content-type": "audio/wav" },
     body: await wav.arrayBuffer(),
   });
   ```

   > A raw `ArrayBuffer` survives the host bridge intact; a `FormData`/`File`
   > gets mangled crossing the sandbox boundary. The server accepts a raw audio
   > body too.
4. Render the returned `{ raw, cleaned, model, durationMs, ... }` — show the
   cleaned transcript, metric chips, and Copy/Download actions. Copy uses
   `bridge.invoke("copy", { text })`; Download triggers an in-page object-URL
   download (the sandboxed page can't reach the native save dialog).

### Build config

`package.json` builds in two passes:

```json
"scripts": {
  "build": "pkgroll --minify && vite build",
  "typecheck": "tsc --noEmit && tsc --noEmit -p ui/tsconfig.json"
}
```

- **`pkgroll --minify`** bundles `src/index.ts` → `dist/index.js` (the hook
  module, `package.json#main`).
- **`vite build`** bundles `ui/index.html` → `dist/ui/` (the page).

`vite.config.ts` uses `root: ui/`, `base: "./"` (relative asset paths are
required because the page is served over `freestyle-plugin://`), and
`outDir: dist/ui`. Everything lands under `dist/`, which is the only directory
the package ships (`"files": ["dist"]`).

There are **two tsconfigs**: `tsconfig.json` for the hook module (Node libs) and
`ui/tsconfig.json` for the page (`DOM`, `DOM.Iterable` libs). The page needs DOM
types; the hook module doesn't.

---

## Build your own plugin

The fastest path is to copy [`plugins/example`](../plugins/example) — a minimal,
copy-me plugin with a UI page and an `event` hook.

### 1. Copy the template

```bash
cp -r plugins/example /path/to/my-plugin   # copy out of the monorepo
cd /path/to/my-plugin
```

### 2. Edit `package.json`

- Change `name` to your package name (e.g. `freestyle-plugin-my` or
  `@you/freestyle-plugin-my`).
- Drop `"private": true`.
- Replace the `freestyle-voice` dependency's `workspace:*` with a published
  version range (e.g. `^0.1.0`).
- Update the `freestyle` manifest: `icon`, and the `contributes.pages` entries
  (or remove the block entirely if your plugin is headless).

```json
{
  "name": "freestyle-plugin-my",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "files": ["dist"],
  "freestyle": {
    "icon": "Puzzle",
    "contributes": {
      "pages": [{ "id": "my", "title": "My Plugin", "entry": "dist/ui/index.html" }]
    }
  },
  "scripts": {
    "build": "pkgroll --minify && vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "freestyle-voice": "^0.1.0" },
  "devDependencies": { "pkgroll": "^2.27.0", "typescript": "^5.8.3", "vite": "^7.3.3" }
}
```

> If your plugin has **no UI page**, drop `vite` and the `vite build` step, and
> remove the `freestyle.contributes` block. The build is just `pkgroll --minify`.

### 3. Write the hook module — `src/index.ts`

Implement only the hooks you need. Capture context in `setup`:

```ts
import type { Plugin, PluginLogger } from "freestyle-voice";

export default function myPlugin(): Plugin {
  let log: PluginLogger | undefined;
  return {
    name: "freestyle-plugin-my",
    setup({ logger, mode }) {
      log = logger;
      logger.info(`my plugin ready on ${mode}`);
    },
    afterCleanup: (_input, output) => {
      output.text = output.text.replace(/\bteh\b/g, "the");
    },
    event: ({ event }) => log?.info(`event: ${event.type}`),
  };
}
```

### 4. (Optional) Build a UI page

Add `ui/index.html` with a tight CSP and a `<script type="module">` entry, plus
`ui/src/main.ts` for logic. Use `window.freestyle` for anything that needs the
server or host. Keep `vite.config.ts` as-is (`root: ui/`, `base: "./"`,
`outDir: dist/ui`). If your page uses DOM APIs in TypeScript, give it its own
`ui/tsconfig.json` with `"lib": ["ESNext", "DOM", "DOM.Iterable"]`.

### 5. Build and test locally

```bash
npm install
npm run build        # → dist/index.js (+ dist/ui/ if you have a page)
npm run typecheck
```

To test inside Freestyle without publishing, drop the built module into your
user-data plugins folder, or `npm install` it from a local path. For a quick
hook-only test you can drop a single strippable `.ts` file straight into
`<userData>/plugins/`.

### 6. Publish

```bash
npm publish
```

Once published, it can be installed from Freestyle's **Browse** tab (or added by
name to the `plugins` setting).

### Checklist

- [ ] `name` is unique and stable (it shows in logs/telemetry/settings)
- [ ] Default export is a factory function
- [ ] Only the hooks you need are implemented; each mutates `output` in place
- [ ] `setup` captures `logger`/`settings`; you branch on `mode` if needed
- [ ] UI page (if any) is declared in `freestyle.contributes.pages` and built to `dist/`
- [ ] Page uses relative asset paths and a tight CSP, and guards `window.freestyle`
- [ ] `dist` is the only thing in `files`; `freestyle-voice` is a real dependency
- [ ] `npm run build` and `npm run typecheck` pass

---

## Release & publishing

First-party plugins in this monorepo use **independent release pipelines** via
Craft, configured per package in `.craft.yml`. The audio-transcription plugin's
config:

```yaml
minVersion: "2.21.1"
versioning:
  policy: manual
changelog:
  filePath: CHANGELOG.md
  policy: auto
releaseBranchPrefix: release-plugin-audio-transcription
targets:
  - name: npm
    access: public
  - name: github
    tagPrefix: "plugin-audio-transcription@"
```

To add a new first-party plugin pipeline (per the comment in that file): copy
`.craft.yml` into the new plugin dir, change `tagPrefix` and
`releaseBranchPrefix` to unique values, and add the plugin to the `package` input
choices in `release-package.yml`. The SDK (`freestyle-voice`) and each plugin
release on their own tags/branches so a plugin bump doesn't force an SDK bump.

Third-party plugins don't need any of this — they're just npm packages you
publish however you like.

---

## Reference

### SDK file map (`packages/sdk/src`)

| File | Exports / purpose |
| --- | --- |
| `index.ts` | The public barrel — everything a plugin imports |
| `plugin.ts` | `Plugin`, `PluginFactory`, `PluginPreset`, `Enforce`, `PluginMode` |
| `hooks.ts` | `Hooks` and the hook `*Input` types, `Handler`, `Register` |
| `context.ts` | `PluginContext`, `PluginLogger`, `SettingsReader`, `createPluginLogger` |
| `events.ts` | `FreestyleEvent`, `FreestyleEventType`, `PipelineStage`, `AppContext` |
| `output.ts` | `OutputMode` |
| `transform.ts` | `transform` helper + `TextTransformer` |
| `bridge.ts` | `FreestyleBridge`, `FreestyleResponse`, `HostActions` (the `window.freestyle` types) |
| `ui.ts` | `PluginManifest`, `PluginUIPage`, `parsePluginPages`, `parsePluginIcon`, `pluginSlug` |
| `config.ts` | `PluginConfig` (open-ended record for the `config` hook) |
| `loader.ts` | `loadPlugins`, `discoverLocalPlugins`, `resolveLocalPackage`, `defaultLocalPluginsDir` |
| `registry.ts` | `PluginRegistry` (`run`/`emit`/`resolveConfig`/`dispose`), `HookFailure` |
| `order.ts` | `sortPlugins` (the `enforce` ordering) |
| `app-context.ts` | `parseAppContext`, `AppContextPayload` |

### Hook quick reference

| Hook | Host | Input | Mutate / return |
| --- | --- | --- | --- |
| `config` | server | `PluginConfig` | *return* partial config |
| `afterTranscribe` | server | `{ providerId, modelId, appContext? }` | `output.text` |
| `beforeCleanup` | server | `{ text, appContext?, inferredRegister }` | `output.system[]`, `output.register?` |
| `afterCleanup` | server | `{ appContext? }` | `output.text` |
| `beforeOutput` | app | `{ appContext? }` | `output.text`, `output.mode` |
| `event` | both | `{ event: FreestyleEvent }` | — (read-only) |
| `setup` | both | `PluginContext` | — (lifecycle) |
| `dispose` | both | — | — (lifecycle) |

### Where to go next

- [`packages/sdk/README.md`](../packages/sdk/README.md) — the SDK's own contract
  reference (the authoritative source for the API).
- [`plugins/example`](../plugins/example) — the copy-me template.
- [`plugins/audio-transcription`](../plugins/audio-transcription) — a full
  UI-driven plugin.
</content>
</invoke>
