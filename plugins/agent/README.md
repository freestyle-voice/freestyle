# Voice Agent

Dictate to an AI agent and see its replies in an expandable pill panel.

This is a first-party Freestyle plugin. It demonstrates the **pill panel** API:
instead of pasting your dictation into the focused app, it intercepts matching
utterances, runs an LLM turn with the model you've already configured, and shows
the conversation in a panel that expands out from the floating pill.

## Usage

The plugin only intercepts dictation that looks like it's meant for the agent —
everything else is dictated normally.

1. Enable the plugin in **Settings → Plugins**.
2. Trigger an agent turn one of two ways:
   - Say **"agent"** at the start of your dictation (e.g. _"Agent, what's the
     capital of France?"_). The wake word is matched however speech-to-text
     punctuates it — "Agent,", "Agent.", or just "Agent …" all work, as do
     "hey agent" and "ok agent" — and it's stripped before the prompt is sent.
   - Or dictate while a terminal or code editor is focused (Terminal, iTerm,
     Warp, VS Code, etc.), where the whole utterance is treated as the prompt.
3. The pill panel expands with your message and the agent's reply. Keep talking
   to continue the conversation — each turn is added to the thread.
4. Press the dictation hotkey again to dismiss the panel, or use **Close** in the
   panel header. **Clear** wipes the conversation.

Set a custom system prompt under the plugin's settings (**System prompt**).

## How it works

The plugin contributes an `afterTranscribe` hook and a `contributes.pill` panel:

1. **Interception** — `afterTranscribe` checks the transcript against the trigger
   rules. On a match it strips the `agent:` prefix, appends the message to the
   stored conversation, and runs a turn via [`api.llm`](https://freestylevoice.com/sdk-reference#pluginllm).
2. **Consume** — it calls `api.control.consume()` so the rest of the pipeline is
   skipped and **nothing is pasted** into your focused app.
3. **Panel** — the suppressed transcript signals the app to expand the pill
   panel. The panel page subscribes to `window.freestyle.pill` events and
   re-fetches the conversation from the plugin's own API route, rendering it live.

The plugin ships no model of its own and reuses your configured cleanup model and
keys through the SDK's `api.llm` capability. **Signed-in Freestyle Cloud users get
this too** — the turn runs on Freestyle Cloud's managed LLM, with no local model
required.

## Build from source

```bash
pnpm install
pnpm --filter @freestyle-voice/plugin-agent build
```

This runs `pkgroll --minify` (server-side plugin code) followed by `vite build`
(the pill panel UI).

## Source

[`plugins/agent/`](https://github.com/freestyle-voice/freestyle/tree/main/plugins/agent)
in the monorepo.
