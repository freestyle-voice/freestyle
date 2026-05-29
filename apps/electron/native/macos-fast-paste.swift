/**
 * macOS Fast Paste
 *
 * Injects Cmd+V at the CGEvent level — much faster than osascript.
 * Requires Accessibility permission (AXIsProcessTrusted).
 *
 * Exit codes:
 *   0 - success
 *   1 - CGEvent creation failed
 *   2 - no accessibility permission
 *
 * Compile:
 *   swiftc -O macos-fast-paste.swift -o macos-fast-paste -framework Cocoa
 */

import Cocoa

if !AXIsProcessTrusted() {
    exit(2)
}

guard let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: 0x09, keyDown: true),
      let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: 0x09, keyDown: false) else {
    exit(1)
}

keyDown.flags = .maskCommand
keyUp.flags = .maskCommand
keyDown.post(tap: .cgSessionEventTap)
usleep(8000)
keyUp.post(tap: .cgSessionEventTap)
usleep(20000)
