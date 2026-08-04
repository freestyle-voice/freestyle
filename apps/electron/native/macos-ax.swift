/**
 * macOS Accessibility text helper
 *
 * Reads and drives the focused text element via the Accessibility API, which
 * is what lets Remix see a whole document (not just the selection) and place
 * the selection anywhere in it — in apps whose text fields cooperate with AX.
 * Canvas-rendered editors (Google Docs) expose nothing here; callers detect
 * exit 3 and fall back to keyboard-driven tiers.
 *
 * Usage:
 *   macos-ax read
 *     Prints JSON: {"text": ..., "selStart": n, "selLen": n, "settable": bool}
 *   macos-ax select <start> <len>
 *     Sets the focused element's selected range (UTF-16 offsets).
 *   macos-ax caps
 *     Prints JSON: {"settable": bool, "length": n} — whether the focused
 *     element's selection can be placed programmatically, and its character
 *     count. Cheap: never reads the text itself.
 *   macos-ax key <keycode>
 *     Posts a bare key press (no modifiers) by virtual keycode — e.g. 124 for
 *     Right Arrow, used to collapse a Select-All without Apple Events. Events
 *     carry the Freestyle synthetic marker so the key listener ignores them.
 *   macos-ax secure
 *     Prints "1" when a password field holds Secure Event Input, else "0".
 *
 * Exit codes:
 *   0 - success
 *   1 - bad arguments / AX call failed
 *   2 - no Accessibility permission
 *   3 - focused element has no readable text value
 */

import ApplicationServices
import Carbon.HIToolbox
import Foundation

func jsonString(_ s: String) -> String {
    var out = "\""
    for ch in s.unicodeScalars {
        switch ch {
        case "\"": out += "\\\""
        case "\\": out += "\\\\"
        case "\n": out += "\\n"
        case "\r": out += "\\r"
        case "\t": out += "\\t"
        default:
            if ch.value < 0x20 {
                out += String(format: "\\u%04x", ch.value)
            } else {
                out.unicodeScalars.append(ch)
            }
        }
    }
    return out + "\""
}

if !AXIsProcessTrusted() {
    exit(2)
}

/// Same marker macos-fast-paste stamps on its events ('FSTY'), so the key
/// listener's synthetic-event filter ignores these too.
let freestyleSyntheticMarker: Int64 = 0x4653_5459

/// The focused UI element, or exit 3 — only the text commands need one.
func focusedElement() -> AXUIElement {
    let systemWide = AXUIElementCreateSystemWide()
    var focusedRef: CFTypeRef?
    let focusedErr = AXUIElementCopyAttributeValue(
        systemWide, kAXFocusedUIElementAttribute as CFString, &focusedRef)
    guard focusedErr == .success, let focusedAny = focusedRef else {
        exit(3)
    }
    // The systemwide focused element is always an AXUIElement.
    return focusedAny as! AXUIElement
}

let args = CommandLine.arguments.dropFirst()
let command = args.first ?? "read"

switch command {
case "secure":
    print(IsSecureEventInputEnabled() ? "1" : "0")

case "read":
    let focused = focusedElement()
    var valueRef: CFTypeRef?
    let valueErr = AXUIElementCopyAttributeValue(
        focused, kAXValueAttribute as CFString, &valueRef)
    guard valueErr == .success, let text = valueRef as? String else {
        exit(3)
    }

    var selStart = -1
    var selLen = 0
    var rangeRef: CFTypeRef?
    if AXUIElementCopyAttributeValue(
        focused, kAXSelectedTextRangeAttribute as CFString, &rangeRef) == .success,
        let rangeAny = rangeRef, CFGetTypeID(rangeAny) == AXValueGetTypeID()
    {
        var range = CFRange(location: 0, length: 0)
        if AXValueGetValue(rangeAny as! AXValue, .cfRange, &range) {
            selStart = range.location
            selLen = range.length
        }
    }

    var settable = DarwinBoolean(false)
    _ = AXUIElementIsAttributeSettable(
        focused, kAXSelectedTextRangeAttribute as CFString, &settable)

    print(
        "{\"text\": \(jsonString(text)), \"selStart\": \(selStart), \"selLen\": \(selLen), \"settable\": \(settable.boolValue)}"
    )

case "caps":
    let focused = focusedElement()
    var settable = DarwinBoolean(false)
    _ = AXUIElementIsAttributeSettable(
        focused, kAXSelectedTextRangeAttribute as CFString, &settable)
    var length = -1
    var countRef: CFTypeRef?
    if AXUIElementCopyAttributeValue(
        focused, kAXNumberOfCharactersAttribute as CFString, &countRef) == .success,
        let count = countRef as? Int
    {
        length = count
    }
    print("{\"settable\": \(settable.boolValue), \"length\": \(length)}")

case "select":
    let focused = focusedElement()
    let rest = Array(args.dropFirst())
    guard rest.count == 2, let start = Int(rest[0]), let len = Int(rest[1]),
        start >= 0, len >= 0
    else {
        FileHandle.standardError.write("usage: macos-ax select <start> <len>\n".data(using: .utf8)!)
        exit(1)
    }
    var range = CFRange(location: start, length: len)
    guard let axRange = AXValueCreate(.cfRange, &range) else {
        exit(1)
    }
    let err = AXUIElementSetAttributeValue(
        focused, kAXSelectedTextRangeAttribute as CFString, axRange)
    if err != .success {
        exit(3)
    }

case "key":
    let rest = Array(args.dropFirst())
    guard rest.count == 1, let code = Int(rest[0]), code >= 0, code < 0x80 else {
        FileHandle.standardError.write("usage: macos-ax key <keycode>\n".data(using: .utf8)!)
        exit(1)
    }
    guard
        let keyDown = CGEvent(
            keyboardEventSource: nil, virtualKey: CGKeyCode(code), keyDown: true),
        let keyUp = CGEvent(
            keyboardEventSource: nil, virtualKey: CGKeyCode(code), keyDown: false)
    else {
        exit(1)
    }
    keyDown.setIntegerValueField(.eventSourceUserData, value: freestyleSyntheticMarker)
    keyUp.setIntegerValueField(.eventSourceUserData, value: freestyleSyntheticMarker)
    keyDown.post(tap: .cghidEventTap)
    usleep(8_000)
    keyUp.post(tap: .cghidEventTap)

default:
    FileHandle.standardError.write("unknown command \"\(command)\"\n".data(using: .utf8)!)
    exit(1)
}
