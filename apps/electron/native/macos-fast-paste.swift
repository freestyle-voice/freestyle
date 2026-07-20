/**
 * macOS Fast Paste
 *
 * Injects Cmd+V at the CGEvent level — much faster than osascript.
 * Requires Accessibility permission (AXIsProcessTrusted).
 * The V keycode is resolved from the active keyboard layout so paste
 * works on non-QWERTY layouts (Dvorak, AZERTY, ...).
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

func keyCodeForV() -> CGKeyCode {
    let fallback: CGKeyCode = 0x09
    guard let sourceRef = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue(),
          let layoutDataRef = TISGetInputSourceProperty(sourceRef, kTISPropertyUnicodeKeyLayoutData) else {
        return fallback
    }
    let layoutData = Unmanaged<CFData>.fromOpaque(layoutDataRef).takeUnretainedValue() as Data
    return layoutData.withUnsafeBytes { (buf: UnsafeRawBufferPointer) -> CGKeyCode in
        guard let layout = buf.bindMemory(to: UCKeyboardLayout.self).baseAddress else {
            return fallback
        }
        let target = UniChar(UnicodeScalar("v").value)
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
        return fallback
    }
}

if !AXIsProcessTrusted() {
    exit(2)
}

let vKey = keyCodeForV()

guard let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: vKey, keyDown: true),
      let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: vKey, keyDown: false) else {
    exit(1)
}

keyDown.flags = .maskCommand
keyUp.flags = .maskCommand

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
