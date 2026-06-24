# Example Plugin

A minimal, copy-me starting point for writing your own Freestyle plugin.

It does just two things:

1. **Contributes a UI page** titled _Example Plugin_ — see `ui/index.html`,
   declared in `package.json` under `freestyle.contributes.pages`.
2. **Listens to the dictation pipeline** via the read-only `event` hook in
   `src/index.ts`, logging each event.

## Layout

```
example/
  package.json     # name, the contributed UI page, build scripts
  src/index.ts     # the plugin: setup + event hook
  ui/index.html    # the page the host renders
  vite.config.ts   # builds ui/ into dist/ui
  tsconfig.json
```

## Use it as a template

1. Copy this folder out of the monorepo and rename it.
2. In `package.json`, change `name`, drop `"private": true`, and replace the
   `freestyle-voice` dependency's `workspace:*` with a published version range
   (e.g. `^0.1.0`).
3. Build with `npm run build`, then publish (`npm publish`) so it can be
   installed from Freestyle's Browse tab.

The full plugin API — mutating hooks (`afterTranscribe`, `afterCleanup`,
`beforeOutput`), settings, and the `window.freestyle` UI bridge — is documented
in the [`freestyle-voice`](../../packages/sdk) package.
