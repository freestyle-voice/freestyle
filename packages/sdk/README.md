# Freestyle Voice

The plugin SDK for [Freestyle](../../README.md) — the local-first voice
dictation app. This package is the **public contract** for writing plugins that
extend the dictation pipeline: rewrite transcripts, inject cleanup prompts,
transform final text, and control how text is delivered.

It ships the plugin contract plus small host-agnostic runtime helpers (loader,
registry, ordering, transforms). The server and Electron hosts inject their own
settings, directories, logging, and error reporting. Plugin hooks are isolated so
one throwing plugin cannot crash a dictation, but plugins still run in-process.

The design is inspired by [Vite's plugin API](https://vite.dev/guide/api-plugin):
a plugin is a **named object** with optional `enforce` metadata and the hooks it
implements.

## Installing

Plugins are loaded from two places:

- **Local files** — drop a `.js`, `.mjs`, or `.ts` module into the plugins
  directory inside your Freestyle user-data folder (`<userData>/plugins/`).
  `.ts` files are loaded via Node's native type-stripping, so stick to plain,
  strippable TypeScript — no `enum`s, `namespace`s, or other constructs that
  require emit.
- **npm packages** — list package names in the `plugins` setting.

Either way, import the types from this package:

```ts
import type { Plugin } from "freestyle-voice";
```

## Writing a plugin

A plugin module exports a **factory** — a function returning a named plugin
object (or an array of them). The factory runs once at load; its hooks run many
times across the dictation pipeline. Use the `setup` lifecycle hook to capture
context (logger, settings) in a closure.

```ts
import type { Plugin } from "freestyle-voice";

export default function myPlugin(): Plugin {
  return {
    name: "freestyle-plugin-my",
    enforce: "pre", // optional — chain position

    setup({ logger, mode }) {
      logger.info(`ready on ${mode}`); // mode: "server" | "app"
    },

    // Rewrite the final, cleaned dictation.
    afterCleanup: (_input, output) => {
      output.text = output.text.replace(/\bteh\b/g, "the");
    },
  };
}
```

For the common single-rewrite case, use the `transform` helper to skip the
`(input, output)` mutation convention:

```ts
import { transform, type Plugin } from "freestyle-voice";

export default function trim(): Plugin {
  return {
    name: "freestyle-plugin-trim",
    afterCleanup: transform((text) => text.trimEnd()),
  };
}
```

## Plugin object

| Field | Required | Purpose |
| --- | --- | --- |
| `name` | yes | Stable identifier — shown in logs, telemetry, and settings UI |
| `enforce` | no | `"pre"` runs first, `"post"` runs last, unset runs in between |
| `setup` | no | Lifecycle: run once per host with `PluginContext` before any hook |
| `dispose` | no | Lifecycle: run once per host on teardown |
| _hooks_ | no | Any of the hooks below, flat on the object |

### Hosts, routing, and `mode`

A plugin is loaded into **both** processes — the server (transcription/cleanup)
and the Electron main process (output) — with no host gating to configure. Each
hook automatically runs only where it belongs:

- `afterTranscribe`, `beforeCleanup`, `afterCleanup` run on the **server**.
- `beforeOutput` runs in the **app**.
- `event` runs in both, but every event type is emitted by exactly one process,
  so a handler is **delivered each event once** — never duplicated.

The only thing that runs in both processes is `setup`/`dispose` (once per host).
When your setup logic differs by process, branch on `ctx.mode`:

```ts
export default (): Plugin => ({
  name: "freestyle-plugin-stats",
  setup({ logger, mode }) {
    if (mode === "server") {
      // open a server-only resource
    }
    logger.info(`ready on ${mode}`);
  },
  event: ({ event }) => {
    /* sees server and app events, each once */
  },
});
```

> **Per-host installation.** The server may be **remote**, so the two hosts have
> separate `node_modules`. A plugin only loads where it's actually installed: a
> server-only plugin loads on the server (and is silently skipped on the desktop),
> and vice-versa. The `plugins` / `disabled_plugins` settings are **server-owned
> and shared** — both hosts honor them. Enabling/disabling a plugin reloads
> **both** registries (the desktop's and the server's), so its hooks start or stop
> immediately everywhere it runs, with no restart.

### Calling the server from a UI page

A plugin's UI page is sandboxed and can't reach the server directly. Use the
`window.freestyle` bridge: `api()` proxies a `fetch` through the host, and
`serverUrl` / `token` are provided for building your own client. For a fully
typed client, install `@freestyle-voice/server` as a **dev dependency** (for its
`AppType` only — it's a type-only import, nothing ships at runtime) and hand
Hono's `hc` the bridge's `fetch`:

```ts
import { hc } from "hono/client";
import type { AppType } from "@freestyle-voice/server";

const client = hc<AppType>(window.freestyle.serverUrl, {
  // Route every request through the host bridge (handles auth + sandboxing).
  fetch: (input: RequestInfo | URL, init?: RequestInit) =>
    window.freestyle.api(
      typeof input === "string" ? input : input.toString(),
      init,
    ),
});

const res = await client.api.transcribe.$post({ form: { audio } });
```

The SDK intentionally does **not** re-export `AppType`: the server already
depends on the SDK, so re-exporting it would create a build cycle. Importing the
type straight from `@freestyle-voice/server` keeps the dependency graph acyclic, and
because it's a `import type` it adds no runtime weight to your plugin bundle.

### Presets and conditional plugins

A factory may return an **array** (a preset, flattened by the loader) and entries
may be **falsy** (ignored — handy for toggles):

```ts
export default function pack(opts?: { extras?: boolean }): Plugin[] {
  return [base(), opts?.extras !== false && extras()].filter(Boolean) as Plugin[];
}
```

In settings, a plugin entry can carry options: `["@acme/pack", { "extras": true }]`.

## How hooks run

- Every hook is **optional** and may be **async**.
- Plugins are ordered by `enforce` (`"pre"` → unset → `"post"`), then by load
  order within each band (npm packages first, then local files). The sort is
  stable.
- For a given hook, all implementing plugins run **in that resolved order**, each
  awaited in sequence.
- Mutating hooks receive a read-only `input` (what's happening) and a mutable
  `output` you **edit in place**. Return values are ignored, except `config`.
- A misbehaving hook is caught and logged by the host (by `name`); it won't crash
  a dictation.

App-specific behavior is done by self-filtering on `input.appContext` inside the
handler:

```ts
afterCleanup: (input, output) => {
  if (/slack/i.test(input.appContext?.appName ?? "")) {
    output.text = output.text.replace(/[.,!?]+$/, "");
  }
},
```

## Hooks

Hooks are split by the process that runs them. A single plugin may implement
hooks from both groups — each host only invokes the hooks belonging to its
process.

### Server hooks (dictation backend)

| Hook | When it fires | You mutate |
| --- | --- | --- |
| `config` | Server boot, after settings load | _return_ a partial config (deep-merged) |
| `afterTranscribe` | Right after speech-to-text, before cleanup | `text` (raw transcript) |
| `beforeCleanup` | While the LLM cleanup prompt is assembled (cleanup enabled only) | `system[]`, `register` |
| `afterCleanup` | On the final text, always (dictionary stage) | `text` (chained) |

### App hooks (Electron main process)

| Hook | When it fires | You mutate |
| --- | --- | --- |
| `beforeOutput` | Just before text is delivered | `text`, `mode` |

### Both

| Hook | When it fires | Notes |
| --- | --- | --- |
| `event` | Any pipeline event | Read-only observer |
| `setup` | Once, before any hook | Receives `PluginContext` |
| `dispose` | Once, on teardown | — |

## Output modes

`beforeOutput`'s `mode` controls delivery. `OutputMode` is a const object (use
the constant or the literal string):

| Value | Constant | Behavior |
| --- | --- | --- |
| `"paste"` | `OutputMode.Paste` | Write to clipboard and synthesize Cmd/Ctrl+V into the focused app |
| `"clipboard"` | `OutputMode.Clipboard` | Write to clipboard only; user pastes manually |
| `"none"` | `OutputMode.None` | Suppress delivery — nothing is pasted or copied |

```ts
import { OutputMode } from "freestyle-voice";

beforeOutput: (input, output) => {
  if (/terminal/i.test(input.appContext?.appName ?? "")) {
    output.mode = OutputMode.Clipboard; // don't auto-paste into a terminal
  }
},
```

Setting `mode` to `"none"` hints the app it has nothing to deliver — useful for
voice-command plugins that consume the utterance instead of typing it.

## Events

The read-only `event` hook receives a discriminated `FreestyleEvent`:

```ts
import { FreestyleEventType } from "freestyle-voice";

event: ({ event }) => {
  switch (event.type) {
    case FreestyleEventType.RecordingStarted:   break;
    case FreestyleEventType.RecordingCommitted: break;
    case FreestyleEventType.RecordingCancelled: break;
    case FreestyleEventType.Transcribed:        /* event.text, event.durationInSeconds */ break;
    case FreestyleEventType.Cleaned:            /* event.before, event.after */ break;
    case FreestyleEventType.OutputDelivered:    /* event.text, event.mode (OutputMode.None = suppressed) */ break;
    case FreestyleEventType.PipelineError:      /* event.stage, event.message */ break;
  }
};
```

See [`src/events.ts`](./src/events.ts) for the full union.
