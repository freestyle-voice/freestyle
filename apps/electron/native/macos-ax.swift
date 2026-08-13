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
 *   macos-ax bounds [excludePid]
 *     Prints JSON: {"x": n, "y": n, "width": n, "height": n} — the screen rect
 *     of the focused element's selection/caret (top-left origin). Lets the
 *     Jeb overlay land on the text cursor instead of a window edge. When the
 *     focused element belongs to excludePid (the caller's own chat panel
 *     holding key focus), exits 3 — that caret is not the user's document.
 *   macos-ax window [excludePid]
 *     Prints JSON: {"x": n, "y": n, "width": n, "height": n} — the
 *     focused external application's focused window. Unlike AppleScript, this
 *     uses the Accessibility permission Freestyle already requires. When the
 *     focused window belongs to excludePid, exits 3.
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

/// The focused application's focused window. This deliberately starts from
/// the system-wide focused application rather than the focused text element:
/// apps without a text field still have a window we can anchor the companion to.
func focusedWindow() -> AXUIElement {
    let systemWide = AXUIElementCreateSystemWide()
    var appRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(
        systemWide, kAXFocusedApplicationAttribute as CFString, &appRef) == .success,
        let appAny = appRef
    else {
        exit(3)
    }
    let app = appAny as! AXUIElement
    var windowRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(
        app, kAXFocusedWindowAttribute as CFString, &windowRef) == .success,
        let windowAny = windowRef
    else {
        exit(3)
    }
    return windowAny as! AXUIElement
}

func rectForWindow(_ window: AXUIElement) -> CGRect? {
    var positionRef: CFTypeRef?
    var sizeRef: CFTypeRef?
    guard
        AXUIElementCopyAttributeValue(
            window, kAXPositionAttribute as CFString, &positionRef) == .success,
        AXUIElementCopyAttributeValue(
            window, kAXSizeAttribute as CFString, &sizeRef) == .success,
        let positionAny = positionRef,
        let sizeAny = sizeRef,
        CFGetTypeID(positionAny) == AXValueGetTypeID(),
        CFGetTypeID(sizeAny) == AXValueGetTypeID()
    else {
        return nil
    }
    var position = CGPoint.zero
    var size = CGSize.zero
    guard
        AXValueGetValue(positionAny as! AXValue, .cgPoint, &position),
        AXValueGetValue(sizeAny as! AXValue, .cgSize, &size)
    else {
        return nil
    }
    return CGRect(origin: position, size: size)
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

case "bounds":
    let focused = focusedElement()
    let rest = Array(args.dropFirst())
    if rest.count == 1, let excludePid = Int32(rest[0]) {
        var ownerPid: pid_t = 0
        if AXUIElementGetPid(focused, &ownerPid) == .success, ownerPid == excludePid {
            exit(3)
        }
    }
    var rangeRef: CFTypeRef?
    guard
        AXUIElementCopyAttributeValue(
            focused, kAXSelectedTextRangeAttribute as CFString, &rangeRef) == .success,
        let rangeAny = rangeRef, CFGetTypeID(rangeAny) == AXValueGetTypeID()
    else {
        exit(3)
    }
    var boundsRef: CFTypeRef?
    let boundsErr = AXUIElementCopyParameterizedAttributeValue(
        focused, kAXBoundsForRangeParameterizedAttribute as CFString, rangeAny, &boundsRef)
    guard boundsErr == .success, let boundsAny = boundsRef,
        CFGetTypeID(boundsAny) == AXValueGetTypeID()
    else {
        exit(3)
    }
    var rect = CGRect.zero
    guard AXValueGetValue(boundsAny as! AXValue, .cgRect, &rect) else {
        exit(3)
    }
    print(
        "{\"x\": \(Int(rect.origin.x)), \"y\": \(Int(rect.origin.y)), \"width\": \(Int(rect.size.width)), \"height\": \(Int(rect.size.height))}"
    )

case "window":
    let focused = focusedWindow()
    let rest = Array(args.dropFirst())
    if rest.count == 1, let excludePid = Int32(rest[0]) {
        var ownerPid: pid_t = 0
        if AXUIElementGetPid(focused, &ownerPid) == .success, ownerPid == excludePid {
            exit(3)
        }
    }
    guard let rect = rectForWindow(focused), rect.width > 0, rect.height > 0 else {
        exit(3)
    }
    print(
        "{\"x\": \(Int(rect.origin.x)), \"y\": \(Int(rect.origin.y)), \"width\": \(Int(rect.size.width)), \"height\": \(Int(rect.size.height))}"
    )

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
