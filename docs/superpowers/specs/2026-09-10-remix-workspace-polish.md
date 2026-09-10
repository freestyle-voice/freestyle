# Remix Workspace Polish

## Goal

Make Remix easier to scan during a real, tool-heavy conversation while keeping
the full audit trail, local-action approvals, and existing product language
intact.

## Evidence

Live review of the main-repo Electron app found that a completed Remix answer
can be preceded by a long, repetitive tool list; the context rail overlays
answer content at desktop widths; and Model, Connected Apps, MCP, and Remix
Settings do not clearly communicate the current operating configuration.

## Decisions

- Keep every tool action available. Collapse completed, repeated actions into
  a semantic summary; errors and in-flight work remain visible.
- Keep the context rail as a distinct workspace surface, but reserve content
  space for it when open. Empty sections become compact counts rather than
  full cards.
- Keep the existing dark editorial visual system, olive accent, and card
  language. Do not introduce a new palette or product metaphor.
- Make loading placeholders match their final chat geometry and use only
  transform/opacity motion. Respect `prefers-reduced-motion`.
- Clarify that Freestyle Cloud manages dictation/cleanup while Remix runtime
  is independently selected. Do not change the selected model or cloud/local
  persistence behavior.
- Make schedule instructions progressive disclosure; do not alter recurrence,
  run-now, enable/disable, edit, or delete semantics.
- Do not change live user data, connected-app permissions, agent tools,
  approval requirements, queue behavior, or reconnect behavior.

## Acceptance criteria

- Tool-heavy answers present a short, meaningful summary by default and retain
  complete per-tool input/output details on demand.
- Opening context never covers readable conversation content at desktop widths.
- Empty context content has substantially lower visual weight than active run,
  task, note, or brain content.
- Models explicitly distinguish Dictation from Remix Runtime and explain the
  Cloud/local consequence of the selected Remix runtime.
- A workspace schedule scans as status and cadence first, with its instruction
  available behind an explicit detail control.
- Visual tests cover populated Remix activity, open context, a loading
  conversation, a cloud runtime, a local runtime, and schedule detail state.
- The live no-tools Remix verification covers normal response, queued follow-up,
  and reconnect UI without invoking connected-app or local-action tools.
