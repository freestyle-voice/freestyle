# Canonical Remix Agent

## Goal

Make Remix the one conversational agent exposed by desktop and mobile. A
single Remix request may use Cloud tools and, when a desktop explicitly
advertises them, local machine tools. Cloud decides which declared tool to
call but never executes a command or accesses a desktop file itself.

## Current problem

The product currently has two visible conversations with separate agent
routes. The compact hotkey pill uses `/api/remix` → `/v2/remix`, while the
desktop Remix workspace and mobile use `/api/agent` → `/v2/agent`. Their
prompts and tool sets differ. As a result, a user cannot rely on a Remix chat
having the same capabilities in the pill and the full workspace.

## Canonical request contract

`remixAgentRequestSchema` gains optional fields already accepted by the
legacy agent contract:

```ts
client?: {
  platform?: "darwin" | "win32" | "linux" | "ios" | "android";
  localTools?: Array<
    "current_time" | "emote" | "save_file" |
    "Bash" | "Read" | "Write" | "Edit" | "Glob" | "Grep"
  >;
  supportsDownloadsSave?: boolean;
  supportsKeyboardInsertion?: boolean;
  supportsConnectorApprovals?: boolean;
};
threadId?: string;
firstTurn?: boolean;
```

`localTools` is an allowlisted name list, not caller-supplied schemas or
implementations. The Cloud package owns the tool descriptions and input
schemas. A request receives only the intersection of the list and the
canonical local-tool registry. Mobile platforms receive no local machine
tools even if a malformed request advertises them.

The desktop proxy is trusted to overwrite client capabilities using its real
local harness. The renderer never gets to expand the Cloud-visible local
surface. It advertises all currently implemented desktop handlers:
`current_time`, `emote`, `save_file`, `Bash`, `Read`, `Write`, `Edit`,
`Glob`, and `Grep`.

## Tool ownership

| Tool category | Registered by | Runs in | Approval |
| --- | --- | --- | --- |
| Web search, connected apps, schedules, notifications, Brain persistence | Cloud Remix | Cloud Worker | Existing connector/mobile rules |
| Document/cursor/clipboard tools | Cloud Remix declaration | Desktop renderer/main process | Existing Remix interaction rules |
| Shell, file operations, Downloads, clock, companion expression | Cloud Remix declaration when advertised | Desktop renderer and local `/api/agent-os` | Existing explicit local approval card, except free clock/emote |
| MCP tools | Cloud Remix declaration from the local registry | Desktop MCP client | Existing desktop MCP policy |

The response stream remains the AI SDK UI-message protocol. A client tool has
no Cloud `execute` handler. The renderer supplies a result using
`addToolResult`, then the canonical Remix route continues the same message
thread.

## Cloud Remix behavior

`/v2/remix` absorbs the general agent's server tool composition, thread
persistence, attachment rehydration, run claims, usage gate, compaction,
scheduled tasks, notification tools, connected-app policy, and platform-aware
prompt sections. The canonical prompt is conversational by default but keeps
cursor-aware writing behavior whenever a document context is present. It must
state that local tools require approval and give Windows PowerShell guidance;
macOS/Linux commands use POSIX syntax. When a mobile client has no local tool
surface, the prompt says it cannot access a computer.

## Client migration and compatibility

Desktop's full Remix workspace and compact pill both call `/api/remix` and
share the same local executor and approval cards. The mobile Remix transport
calls `/v2/remix`, sends its current mobile capabilities, and continues to use
the existing thread model.

`/v2/agent` remains unchanged as a compatibility endpoint for older desktop
and mobile releases. It continues to accept its current optional `client`
contract and tools. New clients do not call it. Local `/api/agent/thread/*`
is retained until the existing thread proxy can be moved without changing the
Cloud thread store contract; it is a resource API, not a second agent run
endpoint.

## Safety and backward compatibility

- Old Remix requests without `client`, `threadId`, or `firstTurn` must parse
  and retain today’s document/MCP behavior.
- Old `/v2/agent` clients retain their current behavior and platform rules.
- A Cloud deploy before a client deploy must not expose local machine tools;
  missing `localTools` means none are registered.
- A client deploy before a Cloud deploy must retain the ordinary Remix
  fallback: unknown optional fields are ignored by the older schema.
- Desktop always re-checks approval and local operation limits. A tool name in
  the request is never authorization to execute it.

## Verification

Contract tests cover legacy Remix parsing, desktop local-tool intersection,
mobile exclusion, and platform prompt text. Cloud route tests assert that
canonical Remix registers both server and advertised local declarations, and
that it preserves thread persistence/durable semantics. Desktop tests assert
the workspace and pill use `/api/remix`; mobile tests assert `/v2/remix`.
Focused desktop, mobile, and Cloud test/typecheck suites must pass before the
legacy route is considered compatibility-only.
