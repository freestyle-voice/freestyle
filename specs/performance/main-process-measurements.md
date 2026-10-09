# Main-process responsiveness measurements

The local HTTP server, synchronous SQLite calls, plugins, and Electron window
and hotkey handling currently share one event loop. Moving server work to a
utility process is a substantial ownership change; measure contention first.

After Electron becomes ready, a 20 ms resolution histogram samples delay in
60 second windows. Windows with a maximum delay of at least 250 ms emit one
local warning containing maximum delay, p99 delay, and event-loop utilization.
The histogram resets every window and the timer is unreferenced and disposed
on quit. No request bodies, transcripts, credentials, or audio are recorded.
This measures scheduling stalls, not end-to-end dictation latency or the exact
function responsible for a stall. Machine sleep and debugger pauses can also
produce warnings; they must not be treated as proof of server contention.

## Measurement procedure

Use a disposable profile with a large synthetic history. Compare the same
machine and app build while idle, searching/paging history, transcribing a
recorded clip, and running an installed plugin. Collect warnings from the
existing app log and correlate their timestamps with these operations.
For repeatable stalls, capture a main-process CPU profile to identify the
responsible code before choosing an optimization or process boundary.

## Isolation decision

If profiles attribute stalls to database/server/plugin work, design a supervised
utility process with explicit settings access, startup readiness, crash recovery,
and graceful shutdown. Keep native permissions, windows, and paste authority in
Electron main. This change intentionally gathers evidence rather than moving
shared database ownership without measurements.
