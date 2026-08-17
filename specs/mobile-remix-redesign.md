# Freestyle Mobile Remix Redesign

## Goal

Rebuild the mobile application around **Remix**, Freestyle's agent, while
retaining fast voice dictation as a deliberate secondary mode. The same two
lanes must be available from the iOS keyboard extension: normal dictation
inserts a transcription, while voice-only Remix gathers an instruction,
resolves any short clarification, and inserts the completed message into the
focused text field.

## Product decisions

- **Remix is the default mobile mode.** The Home screen starts in Remix and
  exposes a segmented `Remix / Dictate` control. Dictate changes the Home
  working surface without changing the rest of the application.
- **Use a native tab bar.** Replace the custom floating five-item dock with
  Expo Router's `NativeTabs`, visually following the Esopteric mobile app.
  There are exactly three destinations: Home, Activity, and Profile.
- **Move configuration out of navigation.** Dictation history, vocabulary,
  dictionary replacements, tone, keyboard setup, account, usage, integrations,
  and MCP/connected-app configuration are reached from Profile or its pushed
  detail screens. They do not each receive a bottom tab.
- **The keyboard is compact and voice-only in Remix mode.** It never becomes a
  miniature chat composer, shows no thread history, and has no typed agent
  input. It renders only the current instruction, a short status, or one short
  clarification question.
- **Automatic clarification listening is on by default.** After Remix asks a
  direct question, the keyboard automatically starts listening for one answer.
  `Listen after Remix questions` is a Profile → Keyboard setting. It does not
  auto-listen after paste, cancellation, failure, or a connected-app action.
- **Pasting is a constrained client tool.** The agent may request the existing
  `insert_at_cursor` client tool only to insert the final generated text. The
  keyboard inserts exactly once using its existing insertion token and sends an
  acknowledgement. The mobile client does not expose screen reading,
  clipboard reading, selection replacement, or arbitrary document writes.
- **Connected-app writes remain explicit.** Mobile may display server-side
  read-only tool progress. Any mutating connected-app/MCP action must retain
  the cloud approval flow and a user-visible confirmation; the keyboard never
  starts those actions.
- **No Brain surface on mobile.** Notes, memory, and brain-file management stay
  desktop-only. Mobile supports the customer-facing essentials: conversations,
  finished runs, briefs, dictation captures, account/usage, keyboard,
  dictation preferences, and connected apps.

## Current capability audit

### Mobile

`apps/mobile` already has the foundational primitives:

- Expo Router, TanStack Query, and an authenticated `cloud` client based on
  the Better Auth Expo cookie.
- A root `SettingsProvider`, `EntriesProvider`, `HistoryProvider`, and
  `KeyboardDictationProvider` mounted under `app/(app)/_layout.tsx`.
- A reliable app-group keyboard protocol. The app owns microphone capture;
  `KeyboardViewController.swift` polls a state channel and inserts a ready
  transcript once per `insertionToken`.
- A dictation Home screen and local data/settings screens. These must be
  preserved as reusable feature primitives, not as top-level navigation.

### Cloud

Freestyle Cloud already supports the required agent backend:

- `POST /v2/remix` accepts a full UI-message thread and returns a Vercel AI SDK
  UI-message stream.
- The route hosts web/image-search tools, reads saved writing preferences, and
  augments the agent with connected-app tools when available.
- `REMIX_CLIENT_TOOLS` already includes `insert_at_cursor`; client tools pause
  the loop until the client posts their result in the next message request.
- Cloud persists threads and connector state; its connector APIs expose
  catalog, connection, details, approval, and execution capabilities.

The initial mobile build uses those existing contracts. It does not add a
mobile-specific cloud endpoint or a second tool vocabulary.

## Information architecture

```
Native tabs
├── Home
│   ├── Remix (default): thread list/continuation + streaming composer
│   └── Dictate: existing recording, transcript, copy and share surface
├── Activity
│   ├── Remix conversations and completed runs
│   ├── briefs / scheduled outcomes when returned by cloud
│   └── existing dictation history
└── Profile
    ├── Connected apps & MCPs
    ├── Keyboard
    │   └── Listen after Remix questions (default true)
    ├── Dictation preferences
    │   ├── cleanup and tone
    │   ├── vocabulary
    │   └── dictionary replacements
    └── account, organisation, plan, usage and sign out
```

The first implementation slice creates this shell and keeps existing detail
routes accessible. Later slices replace the Home placeholder with the stream
backed Remix conversation and then add keyboard Remix mode.

## Remix mobile composer

### Data flow

1. Home loads the user's saved mobile Remix thread metadata and opens a new
   thread when no active thread is selected.
2. The user types or records an instruction. Voice transcription completes
   before the instruction is appended to the UI-message list.
3. The mobile cloud client posts `{ messages, context }` to `/v2/remix`.
   Mobile context has no host-document data: `selection`, `appName`,
   `windowTitle`, and `clipboard` are `null`; `capturedAt` is current time;
   languages come from mobile settings.
4. The client decodes the UI-message stream, updates the active thread, and
   exposes compact `thinking`, tool-progress, text, question, error, and
   complete states to the renderer.
5. Server tools run only in cloud. A requested `insert_at_cursor` is held as a
   pending final insertion rather than executed by the normal mobile composer.
   The in-app composer offers a readable final result and explicit copy/share
   control; keyboard Remix is the only execution host that inserts into another
   application's field.

This intentionally avoids pretending a mobile app can reproduce the desktop's
frontmost-app and selection tools.

### Connected apps and MCPs

Profile renders cloud connector catalog and connection status with the existing
cloud APIs. OAuth and API-key connection steps open in the system browser and
return to the app through an Expo deep link. The composer displays connected
tool activity in concise language using the desktop's existing presentation
semantics. Server-side mutations require a confirmation card from the cloud
approval API before execution; the keyboard does not show or trigger those
cards.

## Keyboard Remix protocol

The existing App Group state and command channels are extended rather than
replaced. Both Swift copies of `DictationBridge.swift` must remain byte-for-byte
compatible.

### Commands from keyboard to app

| Command | Meaning |
| --- | --- |
| `startRemix` | Wake/launch the app-side resident session and begin recording the spoken Remix instruction. |
| `commitRemix` | Finish the current phrase and send it to the active keyboard Remix turn. |
| `answerRemix` | Submit a spoken answer to the outstanding one-question clarification. |
| `cancelRemix` | Cancel the local keyboard Remix turn; it must not insert anything. |
| `ackInsert` | Existing acknowledgement after the extension inserted the final text. |

### States published by app to keyboard

| State | Keyboard rendering | Next event |
| --- | --- | --- |
| `remixListening` | Compact mic, current partial instruction, “Listening”. | `commitRemix` |
| `remixWorking` | One short status (“Remix is writing”). | stream question or final client tool |
| `remixQuestion` | One question plus “Listening for your answer”. | automatic capture of one answer by default |
| `remixReady` | Brief “Pasted ✓” feedback after final insertion. | `ackInsert`, then idle |
| `remixFailed` | Short recoverable error; no insertion. | idle |

`remixQuestion` automatically moves to `remixListening` when the preference is
enabled. When disabled, it displays the question and waits for a mic tap.

### Insertion safety

- A keyboard turn permits exactly one final `insert_at_cursor` client-tool
  request. Subsequent requests fail locally with `{ ok: false,
  reason: "keyboard-insert-already-used" }`.
- The mobile app writes final text and a unique `insertionToken` to shared
  state. `KeyboardViewController` retains its existing token guard and
  `ackInsert` behaviour.
- Insertion is denied if the final text is blank or longer than
  `REMIX_WRITE_LIMIT`.
- The extension resumes idle after acknowledgement; it never starts a new
  recording merely because a result was pasted.

## Delivery slices

1. **Native shell and navigation migration.** Replace floating tabs; create
   Home, Activity, and Profile destinations; route existing configuration to
   Profile detail links. Preserve dictation as Home's Dictate mode.
2. **Remix Home conversation.** Add mobile thread storage, streaming request
   client, composable status/tool UI, usage and failure handling, plus basic
   connected-app configuration entry point.
3. **Activity and Profile completion.** Merge dictation history with Remix
   conversations/runs; add keyboard preferences and connector settings.
4. **Keyboard Remix mode.** Generalize the shared protocol, run agent turns
   app-side, render compact states, implement automatic clarification capture,
   and execute one safe final insertion.

## Non-goals

- Rebuilding desktop Brain, filesystem, screen-reading, selection, clipboard,
  or shell tools on mobile.
- A general-purpose in-keyboard agent chat interface.
- Background agent execution from the keyboard when the app is not resident.
- Android keyboard Remix in the first release; the existing iOS extension is
  the initial target.

## Acceptance criteria

1. A signed-in user sees native Home, Activity, and Profile tabs; Remix is the
   selected Home mode after fresh launch.
2. The Dictate mode retains the current audio session safety, transcription,
   copy/share, and local-history behaviour.
3. A mobile Remix turn streams in Home and renders success, usage-limit,
   authentication, disconnected-tool, and network-error states without losing
   an entered instruction.
4. Connected-app configuration is discoverable in Profile, and mobile never
   silently executes a mutating connected-app action.
5. Keyboard Remix accepts spoken instructions, streams only compact current
   turn information, automatically listens for a follow-up by default, and
   inserts no more than one final result per turn.
6. The existing dictation keyboard flow remains regression-tested.
