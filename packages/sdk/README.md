# `@freestyle/sdk`

The plugin SDK for [Freestyle](../../README.md) — the local-first voice
dictation app. This package is the **public contract** for writing plugins that
extend the dictation pipeline: rewrite transcripts, inject cleanup prompts,
transform final text, and adjust how text is delivered.

It ships **types and small helpers only** — no runtime dependencies. The plugin
loaders that discover, run, and sandbox plugins live in the apps that host them
(`apps/server` for pipeline hooks, `apps/electron` for output hooks).

## Installing

Plugins are loaded from two places:

- **Local files** — drop a `.ts`/`.js` module into the plugins directory inside
  your Freestyle user-data folder (`<userData>/plugins/`).
- **npm packages** — list package names in the `plugins` setting.

Either way, import the types from this package:

```ts
import type { Plugin } from "@freestyle/sdk";
```

## Writing a plugin

A plugin is an async factory that receives a context and returns the hooks it
implements. The factory runs **once** per process at load time; the hooks it
returns run **many times** across the dictation pipeline.

```ts
import type { Plugin } from "@freestyle/sdk";

export const MyPlugin: Plugin = async ({ logger }) => {
  logger.info("ready");

  return {
    // Rewrite the final, cleaned dictation.
    "text.transform": async (_input, output) => {
      output.text = output.text.replace(/\bteh\b/g, "the");
    },
  };
};
```

For the common single-rewrite case, use the `transform` helper to skip the
`(input, output)` mutation convention:

```ts
import { transform, type Plugin } from "@freestyle/sdk";

export const TrimPlugin: Plugin = async () => ({
  "text.transform": transform((text) => text.trimEnd()),
});
```

A copy-pasteable reference is exported as `ExamplePlugin` (see
[`src/example.ts`](./src/example.ts)).

## How hooks run

- Every hook is **optional** and **async**.
- For a given hook, all implementing plugins run **in load order**, each awaited
  in sequence (npm packages first, then local files).
- Mutating hooks receive a read-only `input` (what's happening) and a mutable
  `output` you **edit in place** to influence behavior. Return values are
  ignored.
- A misbehaving hook is caught and logged by the host; it won't crash a
  dictation.

## Hooks

Hooks are split by the process that runs them. A single plugin module may
implement hooks from both groups — each loader only invokes the hooks belonging
to its process.

### Server hooks (dictation backend)

| Hook | When it fires | You mutate |
| --- | --- | --- |
| `config` | Server boot, after settings load | resolved config |
| `event` | Any server pipeline event | — (read-only) |
| `transcribe.after` | Right after speech-to-text, before cleanup | `text` (raw transcript) |
| `cleanup.prompt` | While the LLM cleanup prompt is assembled | `system[]`, `register` |
| `text.transform` | On the final cleaned text (dictionary stage) | `text` (chained) |

### App hooks (Electron main process)

| Hook | When it fires | You mutate |
| --- | --- | --- |
| `event` | Any app-side event | — (read-only) |
| `output.before` | Just before text is pasted/copied | `text`, `mode` |

### Lifecycle

| Hook | When it fires |
| --- | --- |
| `dispose` | Plugin teardown (process shutdown) |

## Events

The read-only `event` hook receives a discriminated `FreestyleEvent`:

```ts
event: async ({ event }) => {
  switch (event.type) {
    case "server.transcribed": /* event.text, event.durationInSeconds */ break;
    case "server.cleaned":     /* event.before, event.after */ break;
    case "app.output.delivered": /* event.text, event.mode */ break;
    case "pipeline.error":     /* event.stage, event.message */ break;
  }
};
```

See [`src/events.ts`](./src/events.ts) for the full union.

## API reference

| Export | Kind | Purpose |
| --- | --- | --- |
| `Plugin` | type | The plugin factory signature |
| `Hooks` | type | The full hook surface |
| `PluginContext` | type | What every plugin factory receives |
| `PluginOptions` | type | Free-form plugin configuration |
| `PluginModule` | type | Shape of a loadable plugin module |
| `FreestyleEvent` | type | Discriminated event union |
| `AppContext` | type | The app the user dictated into |
| `OutputMode` | type | `"paste"` \| `"copy"` |
| `Register` | type | `"formal"` \| `"casual"` \| `"neutral"` |
| `transform` | fn | Wrap a pure `(text) => text` into `text.transform` |
| `ExamplePlugin` | value | Copy-pasteable reference plugin |

## Stability

V1 focuses on the text-transform pipeline (`transcribe.after`,
`cleanup.prompt`, `text.transform`, `output.before`) plus `event`/`config`.
Custom speech-to-text providers and additional lifecycle hooks are planned but
not yet part of the stable contract.
