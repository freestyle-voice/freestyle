# Voice Commands

Turn spoken trigger phrases into actions. Define commands like _"post to Slack…"_
or _"add a reminder…"_ and Voice Commands will detect them in your dictation and
run the matching action instead of typing the text.

## How it works

1. **Prefilter** — a cheap, deterministic phrase match gates everything. If your
   speech contains no trigger phrase, nothing else runs and the transcript is
   dictated normally.
2. **Agent** — when a trigger matches, a multi-step tool-calling agent (using the
   LLM you've already configured for cleanup) decides whether it's really a
   command and extracts the payload (the part of your speech that isn't the
   trigger).
3. **Action** — the command fires. The utterance is _consumed_: cleanup is
   skipped and no text is delivered to the focused app.

If no cleanup LLM is configured, detection falls back to a deterministic match
(the longest matching trigger wins) so commands still work.

## Action types

- **Run Shortcut** _(macOS only)_ — run a macOS Shortcut by name; the payload is
  piped to its input.
- **Call webhook** — `POST` the payload as JSON, or `GET` it as a query param.
- **Open URL / app** — open a URL or app scheme; `{{input}}` is substituted.
- **Run script** — run a shell command; `{{input}}` is substituted and the
  payload is also available as `$FREESTYLE_COMMAND_INPUT`.

Shortcut commands are hidden on non-macOS hosts.
