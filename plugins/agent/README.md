# Voice Agent

Talk to an AI agent by voice and see its replies in a chat panel that grows out
of the floating pill.

This is a first-party Freestyle plugin and the reference implementation of the
**pill panel** API. Say your wake word ("Hey Freestyle …") and, instead of
pasting your dictation into the focused app, Freestyle runs an agent turn —
optionally calling tools from your connected MCP servers — and shows the
conversation in a panel attached to the pill.

## Usage

1. Enable the plugin in **Settings → Plugins**.
2. Say your wake word at the start of a dictation, e.g. _"Hey Freestyle, what's
   on my calendar today?"_. The pill grows into a chat panel with your message
   and the agent's reply.
3. Press the dictation hotkey again to ask a follow-up — the conversation keeps
   its context.
4. Close the panel with the **✕** button, or just click outside it.

The wake word is matched however speech-to-text punctuates it ("Hey Freestyle,",
"Hey Freestyle.", or a bare "Freestyle …"), and a leading "hey"/"ok" is always
optional.

## Configuration

Open **Voice Agent** in the app sidebar (added when the plugin is enabled) to
configure:

- **Wake word** — the trigger phrase (default "hey freestyle").
- **System prompt** — the agent's persona and base instructions.
- **MCP servers** — connect [Model Context Protocol](https://modelcontextprotocol.io)
  servers over `stdio` (a local command) or `http` (a URL). Every enabled
  server's tools are made available to the agent during a turn.
- **Skills** — named, reusable instruction sets. Enabled skills are appended to
  the system prompt so the agent applies them on every turn.

## How it works

The plugin combines a server hook with two UI pages:

1. **Interception** — an `afterTranscribe` hook matches the wake word, strips it,
   and calls `api.control.consume()` so nothing is pasted into your focused app.
2. **Agent turn** — it connects the enabled MCP servers, hands their tools to the
   model (via the SDK's [`api.llm`](https://freestylevoice.com/sdk-reference#pluginllm)
   capability), and runs a tool-calling loop with the AI SDK. Connections are
   closed when the turn ends.
3. **Panel** — consuming the dictation signals the app to open the pill panel; the
   panel (a `contributes.pill` page) subscribes to `window.freestyle.pill` events
   and renders the conversation live.

The plugin reuses your configured model and keys — there's no separate provider
to set up. **Signed-in Freestyle Cloud users get this too**, running on Freestyle
Cloud's managed LLM.

## Build from source

```bash
pnpm install
pnpm --filter @freestyle-voice/plugin-agent build
```

`pkgroll` bundles the server-side plugin (including the MCP SDK and AI SDK);
`vite` builds the pill panel and settings pages.

## Source

[`plugins/agent/`](https://github.com/freestyle-voice/freestyle/tree/main/plugins/agent)
in the monorepo.
