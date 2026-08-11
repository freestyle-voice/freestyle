# Cross-platform companion display anchoring

## Goal

When dictation starts, place the companion on the display containing the
focused external application rather than the display containing the pointer.
The pointer is only a fallback when the platform cannot provide an external
window rectangle.

## Platform adapters

- **macOS:** use the existing Accessibility helper to read the focused external
  window rectangle, excluding Freestyle's own process.
- **Windows:** add a small Win32 helper that reads `GetForegroundWindow` and
  `GetWindowRect`, excludes Freestyle's process ID, and emits JSON. Convert its
  physical rectangle to Electron DIP coordinates before matching a display.
- **Linux X11:** add an X11 helper that reads the EWMH `_NET_ACTIVE_WINDOW`
  property and that window's root-relative rectangle, excluding Freestyle's
  process when it can be identified. Convert physical coordinates to DIP before
  matching a display.
- **Linux Sway:** reuse `swaymsg -t get_tree`; its focused node includes an
  absolute rectangle and application PID. Exclude Freestyle's PID.

## Unsupported compositor path

Generic Wayland does not let an ordinary client inspect other clients' global
surface positions. On compositors without a supported geometry API, including
GNOME and KDE Wayland, preserve the existing cursor-based placement instead of
guessing a display.

## Main-process flow

At dictation start, capture the cursor display as an immediate fallback and
request the focused external window rectangle through the platform adapter.
When a valid response arrives for the current dictation session, convert it to
Electron DIP coordinates and move the companion to the matching display. A
session request counter continues to reject stale asynchronous responses.

## Testing

- Unit-test focused-display precedence, unavailable-adapter fallback, and
  stale-result rejection in a platform-neutral coordinator.
- Unit-test the Windows, X11, and Sway result parsers with representative
  rectangles and Freestyle-PID exclusion.
- Run Electron typecheck, unit tests, build, end-to-end tests, and native
  compilation on the available host. CI/package jobs compile each platform's
  native helper on its corresponding platform.
