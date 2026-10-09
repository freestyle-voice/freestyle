# Native dictation validation

The cross-platform `Dictation HTTP` CI matrix sends deterministic recorded WAV
bytes through a real loopback HTTP server, real cleanup/dictionary/output routes,
and a disposable SQLite database. Only model inference and its credentials are
fixtures; no live provider, model downloads, or microphone permissions are needed.
This verifies binary framing, delivery dispositions, rewriting, and persistence.
It does not prove audio capture, global keyboard handling, or native paste.

## Real-device smoke matrix

Run on macOS, Windows, and Linux Wayland using a disposable app profile and a
text editor containing unsaved sample text. Record OS/app version and results.

1. Fresh profile: deny microphone permission, confirm actionable recovery, grant
   it, then record again. On macOS also deny/grant Accessibility for paste.
2. Record one phrase with the global hotkey; verify one insertion at the cursor.
   Repeat with a compound hotkey and a modifier-only hotkey where supported.
3. Record two rapid segments; verify ordered delivery and exactly one cleanup.
4. Cancel during capture, transcription, and cleanup; verify no later insertion.
5. Start with media playing; verify pause/duck restores on success, cancellation,
   provider failure, and app quit.
6. Copy output with Unicode and newlines; verify clipboard mode without granting
   Accessibility. For paste, verify pre-existing text/HTML/image clipboard data
   restores after delivery. Wayland must exercise the portal/helper route.
7. Quit while a request or WebSocket is active; verify process and model children
   exit, then reopen and confirm history/settings are intact.

Native device results must be recorded separately from hosted CI. A green HTTP
matrix or mocked UI test must not be described as successful native paste proof.
