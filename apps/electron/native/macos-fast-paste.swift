/**
 * macOS Fast Paste
 *
 * Injects Cmd+<key> at the CGEvent level — much faster than osascript.
 * Requires Accessibility permission (AXIsProcessTrusted).
 * The keycode is resolved from the active keyboard layout so this works
 * on non-QWERTY layouts (Dvorak, AZERTY, ...).
 *
 * Usage: macos-fast-paste [key]
 *   key — the letter to chord with Command. Defaults to "v" (paste), so
 *         existing callers that pass no argument are unaffected. Commands
 *         pass "c" to copy the focused app's selection.
 *
 * Exit codes:
 *   0 - success
 *   1 - CGEvent creation failed
 *   2 - no accessibility permission
 *
 * Compile:
 *   swiftc -O macos-fast-paste.swift -o macos-fast-paste -framework Cocoa -framework Carbon
 */

import Carbon.HIToolbox
import Cocoa

/// The keycode that types `character` on the active layout, or nil when the
/// layout can't be read or doesn't produce it unmodified.
func keyCode(for character: Character) -> CGKeyCode? {
    guard let sourceRef = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue(),
          let layoutDataRef = TISGetInputSourceProperty(sourceRef, kTISPropertyUnicodeKeyLayoutData) else {
        return nil
    }
    let layoutData = Unmanaged<CFData>.fromOpaque(layoutDataRef).takeUnretainedValue() as Data
    return layoutData.withUnsafeBytes { (buf: UnsafeRawBufferPointer) -> CGKeyCode? in
        guard let layout = buf.bindMemory(to: UCKeyboardLayout.self).baseAddress else {
            return nil
        }
        let target = UniChar(String(character).unicodeScalars.first!.value)
        var deadKeyState: UInt32 = 0
        var chars = [UniChar](repeating: 0, count: 4)
        var length = 0
        for code in 0..<UInt16(128) {
            let err = UCKeyTranslate(
                layout, code, UInt16(kUCKeyActionDown), 0,
                UInt32(LMGetKbdType()), OptionBits(kUCKeyTranslateNoDeadKeysBit),
                &deadKeyState, chars.count, &length, &chars)
            if err == noErr && length == 1 && chars[0] == target {
                return CGKeyCode(code)
            }
        }
        return nil
    }
}

/// QWERTY positions, used only when the layout lookup above comes up empty —
/// on a layout where these are wrong, the chord is wrong either way, and
/// posting the usual key is a better guess than posting nothing.
let fallbackKeyCodes: [Character: CGKeyCode] = ["v": 0x09, "c": 0x08]

if !AXIsProcessTrusted() {
    exit(2)
}

let arguments = Array(CommandLine.arguments.dropFirst())
let requested = arguments.first?.lowercased() ?? "v"
// An optional trailing "shift" widens the chord (Cmd+Shift+<key>) — used for
// redo (Cmd+Shift+Z). No other modifiers are supported by design.
let withShift = arguments.dropFirst().first?.lowercased() == "shift"
guard requested.count == 1, let character = requested.first, character.isLetter else {
    FileHandle.standardError.write("expected a single letter, got \"\(requested)\"\n".data(using: .utf8)!)
    exit(1)
}

guard let chordKey = keyCode(for: character) ?? fallbackKeyCodes[character] else {
    FileHandle.standardError.write("no key for \"\(character)\" on the active layout\n".data(using: .utf8)!)
    exit(1)
}

guard let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: chordKey, keyDown: true),
      let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: chordKey, keyDown: false) else {
    exit(1)
}

let chordFlags: CGEventFlags = withShift ? [.maskCommand, .maskShift] : .maskCommand
keyDown.flags = chordFlags
keyUp.flags = chordFlags

// Tag these synthetic events so our own key listener can recognize and ignore
// them. Without this, the listener sees the Cmd+V flag mask on the injected V
// events, records a "command" modifier as held, and — because no real Command
// key-up ever follows — leaves that modifier stuck. A stuck modifier then
// suppresses the next solo Fn/Globe hotkey activation until an unrelated key
// press resyncs the modifier state. Keep this constant in sync with the guard
// in macos-key-listener.swift.
let freestyleSyntheticMarker: Int64 = 0x4653_5459 // "FSTY"
keyDown.setIntegerValueField(.eventSourceUserData, value: freestyleSyntheticMarker)
keyUp.setIntegerValueField(.eventSourceUserData, value: freestyleSyntheticMarker)

keyDown.post(tap: .cgSessionEventTap)
usleep(8000)
keyUp.post(tap: .cgSessionEventTap)
usleep(20000)
