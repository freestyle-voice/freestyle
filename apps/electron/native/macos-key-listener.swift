/**
 * macOS Global Key Listener
 *
 * Monitors Globe/Fn key, right-side modifier keys, and extra mouse buttons
 * using native Cocoa/CoreGraphics APIs. Outputs key events to stdout for
 * consumption by the Electron main process via child_process stdio.
 *
 * Compile:
 *   swiftc -O macos-key-listener.swift -o macos-key-listener \
 *     -framework Cocoa
 */

import Cocoa
import Darwin

var fnIsDown = false
var lastModifierFlags: NSEvent.ModifierFlags = []

/// Marker stamped onto the app's own injected paste events by macos-fast-paste,
/// used to ignore them here. Keep in sync with macos-fast-paste.swift.
let freestyleSyntheticMarker: Int64 = 0x4653_5459 // "FSTY"

/// Modifier + key hotkeys (e.g. Option+U) are swallowed so macOS dead keys do not
/// reach the foreground app. Modifier-only hotkeys (e.g. RightOption) are not.
struct ParsedHotkey {
    var requireControl = false
    var requireOption = false
    var requireShift = false
    var requireCommand = false
    var requireFn = false
    var targetKeyCode: UInt16?

    var hasCompoundKey: Bool { targetKeyCode != nil }
}

func parseCLIArgs() -> (hotkey: String?, mouseButtons: Set<String>) {
    var hotkey: String?
    var mouseButtons = Set<String>()

    for arg in CommandLine.arguments.dropFirst() {
        let trimmed = arg.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { continue }

        if trimmed.contains("+") || isStandaloneHotkeyToken(trimmed) {
            hotkey = trimmed
            continue
        }

        for part in trimmed.split(separator: ",") {
            let name = String(part).trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty {
                mouseButtons.insert(name)
            }
        }
    }

    return (hotkey, mouseButtons)
}

func isStandaloneHotkeyToken(_ token: String) -> Bool {
    let lower = token.lowercased()
    if lower.hasPrefix("mousebutton") { return false }
    if lower == "fn" || lower == "globe" { return true }
    if lower.hasPrefix("right") { return true }
    if lower.hasPrefix("f"), let n = Int(lower.dropFirst()), (1...12).contains(n) { return true }
    return nameToKeyCode(token) != nil
}

func parseHotkey(_ hotkey: String) -> ParsedHotkey {
    var result = ParsedHotkey()

    for part in hotkey.split(separator: "+") {
        let token = part.trimmingCharacters(in: .whitespacesAndNewlines)
        if token.isEmpty { continue }

        switch token.lowercased() {
        case "control", "ctrl", "commandorcontrol", "cmdorctrl":
            result.requireControl = true
        case "alt", "option":
            result.requireOption = true
        case "shift":
            result.requireShift = true
        case "command", "cmd", "meta", "super", "win":
            result.requireCommand = true
        case "fn", "globe":
            result.requireFn = true
        case "rightalt", "rightoption", "rightcommand",
             "rightcontrol", "rightctrl", "rightshift", "rightsuper", "rightwin", "rightmeta":
            break
        default:
            if let code = nameToKeyCode(token) {
                result.targetKeyCode = code
            }
        }
    }

    return result
}

func eventMatchesSuppressibleHotkey(_ event: CGEvent, config: ParsedHotkey) -> Bool {
    guard config.hasCompoundKey else { return false }

    let keyCode = UInt16(event.getIntegerValueField(.keyboardEventKeycode))
    guard keyCode == config.targetKeyCode else { return false }

    let flags = event.flags
    if flags.contains(.maskControl) != config.requireControl { return false }
    if flags.contains(.maskAlternate) != config.requireOption { return false }
    if flags.contains(.maskShift) != config.requireShift { return false }
    if flags.contains(.maskCommand) != config.requireCommand { return false }
    if flags.contains(.maskSecondaryFn) != config.requireFn { return false }
    return true
}

let cliArgs = parseCLIArgs()
let suppressedMouseButtons = cliArgs.mouseButtons
let suppressHotkey = cliArgs.hotkey.map(parseHotkey)

let rightModifiers: [(UInt16, NSEvent.ModifierFlags, String)] = [
    (61, .option, "RightOption"),
    (54, .command, "RightCommand"),
    (62, .control, "RightControl"),
    (60, .shift, "RightShift"),
]

let modifierMask: NSEvent.ModifierFlags = [.control, .command, .option, .shift]

let releases: [(NSEvent.ModifierFlags, String)] = [
    (.control, "control"),
    (.command, "command"),
    (.option, "option"),
    (.shift, "shift"),
]

func emit(_ message: String) {
    FileHandle.standardOutput.write((message + "\n").data(using: .utf8)!)
    fflush(stdout)
}

func emitFlags(_ flags: NSEvent.ModifierFlags) {
    var parts: [String] = []
    let mods = flags.intersection(modifierMask)
    if mods.contains(.control) { parts.append("control") }
    if mods.contains(.option) { parts.append("option") }
    if mods.contains(.shift) { parts.append("shift") }
    if mods.contains(.command) { parts.append("command") }
    emit("FLAGS:" + parts.joined(separator: ","))
}

/// US ANSI keyboard keycodes (kVK_ANSI_* / kVK_Space, etc.)
func keyCodeToName(_ code: UInt16) -> String? {
    switch code {
    case 0: return "A"
    case 1: return "S"
    case 2: return "D"
    case 3: return "F"
    case 4: return "H"
    case 5: return "G"
    case 6: return "Z"
    case 7: return "X"
    case 8: return "C"
    case 9: return "V"
    case 11: return "B"
    case 12: return "Q"
    case 13: return "W"
    case 14: return "E"
    case 15: return "R"
    case 16: return "Y"
    case 17: return "T"
    case 18: return "1"
    case 19: return "2"
    case 20: return "3"
    case 21: return "4"
    case 22: return "6"
    case 23: return "5"
    case 24: return "="
    case 25: return "9"
    case 26: return "7"
    case 27: return "-"
    case 28: return "8"
    case 29: return "0"
    case 30: return "]"
    case 31: return "O"
    case 32: return "U"
    case 33: return "["
    case 34: return "I"
    case 35: return "P"
    case 37: return "L"
    case 38: return "J"
    case 39: return "'"
    case 40: return "K"
    case 41: return ";"
    case 42: return "\\"
    case 43: return ","
    case 44: return "/"
    case 45: return "N"
    case 46: return "M"
    case 47: return "."
    case 48: return "Tab"
    case 49: return "Space"
    case 50: return "`"
    case 51: return "Delete"
    case 53: return "Escape"
    case 36: return "Return"
    case 117: return "ForwardDelete"
    case 123: return "Left"
    case 124: return "Right"
    case 125: return "Down"
    case 126: return "Up"
    case 122: return "F1"
    case 120: return "F2"
    case 99: return "F3"
    case 118: return "F4"
    case 96: return "F5"
    case 97: return "F6"
    case 98: return "F7"
    case 100: return "F8"
    case 101: return "F9"
    case 109: return "F10"
    case 103: return "F11"
    case 111: return "F12"
    default: return nil
    }
}

func nameToKeyCode(_ name: String) -> UInt16? {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return nil }

    let lower = trimmed.lowercased()
    if lower == "space" { return 49 }
    if lower == "return" || lower == "enter" { return 36 }
    if lower == "escape" || lower == "esc" { return 53 }
    if lower == "tab" { return 48 }
    if lower == "backspace" || lower == "delete" { return 51 }
    if lower == "forwarddelete" { return 117 }
    if lower == "up" { return 126 }
    if lower == "down" { return 125 }
    if lower == "left" { return 123 }
    if lower == "right" { return 124 }

    if lower.hasPrefix("f"), let number = Int(lower.dropFirst()), (1...12).contains(number) {
        let fKeyCodes: [UInt16] = [122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111]
        return fKeyCodes[number - 1]
    }

    if trimmed.count == 1, let upper = trimmed.uppercased().first {
        for code: UInt16 in 0...128 {
            if keyCodeToName(code)?.uppercased() == String(upper) {
                return code
            }
        }
    }

    for code: UInt16 in 0...128 {
        if keyCodeToName(code)?.lowercased() == lower {
            return code
        }
    }

    return nil
}

func emitFlagsFromCGEvent(_ flags: CGEventFlags) {
    var parts: [String] = []
    if flags.contains(.maskControl) { parts.append("control") }
    if flags.contains(.maskAlternate) { parts.append("option") }
    if flags.contains(.maskShift) { parts.append("shift") }
    if flags.contains(.maskCommand) { parts.append("command") }
    emit("FLAGS:" + parts.joined(separator: ","))
}

func mouseButtonName(_ buttonNumber: Int) -> String? {
    switch buttonNumber {
    case 3:
        return "MouseButton4"
    case 4:
        return "MouseButton5"
    default:
        return nil
    }
}

func emitMouseEvent(_ type: CGEventType, _ event: CGEvent) -> Bool {
    guard type == .otherMouseDown || type == .otherMouseUp else { return false }

    let buttonNumber = Int(event.getIntegerValueField(.mouseEventButtonNumber))
    guard let buttonName = mouseButtonName(buttonNumber) else { return false }

    emit(type == .otherMouseDown ? "MOUSE_BUTTON_DOWN:\(buttonName)" : "MOUSE_BUTTON_UP:\(buttonName)")
    return suppressedMouseButtons.contains(buttonName)
}

let mouseEventMask =
    (1 << CGEventType.otherMouseDown.rawValue) |
    (1 << CGEventType.otherMouseUp.rawValue)

var mouseEventTapPort: CFMachPort?

let mouseEventTap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: CGEventMask(mouseEventMask),
    callback: { _, type, event, _ in
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let mouseEventTapPort {
                CGEvent.tapEnable(tap: mouseEventTapPort, enable: true)
            }
            return Unmanaged.passUnretained(event)
        }

        if emitMouseEvent(type, event) {
            return nil
        }

        return Unmanaged.passUnretained(event)
    },
    userInfo: nil)

var mouseRunLoopSource: CFRunLoopSource?
if let mouseEventTap {
    mouseEventTapPort = mouseEventTap
    mouseRunLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, mouseEventTap, 0)
    CFRunLoopAddSource(CFRunLoopGetMain(), mouseRunLoopSource, .commonModes)
    CGEvent.tapEnable(tap: mouseEventTap, enable: true)
} else {
    FileHandle.standardError.write("Failed to create mouse event tap\n".data(using: .utf8)!)
}

guard let monitor = NSEvent.addGlobalMonitorForEvents(matching: .flagsChanged, handler: { event in
    let flags = event.modifierFlags
    let containsFn = flags.contains(.function)

    if containsFn && !fnIsDown {
        fnIsDown = true
        let otherMods = flags.intersection(modifierMask)
        if otherMods.isEmpty {
            emit("FN_DOWN")
        } else {
            var parts: [String] = []
            if otherMods.contains(.control) { parts.append("control") }
            if otherMods.contains(.option) { parts.append("option") }
            if otherMods.contains(.shift) { parts.append("shift") }
            if otherMods.contains(.command) { parts.append("command") }
            emit("FN_DOWN:" + parts.joined(separator: ","))
        }
    } else if !containsFn && fnIsDown {
        fnIsDown = false
        emit("FN_UP")
    }

    let keyCode = event.keyCode
    for (code, flag, name) in rightModifiers {
        if keyCode == code {
            emit(flags.contains(flag) ? "RIGHT_MOD_DOWN:\(name)" : "RIGHT_MOD_UP:\(name)")
            break
        }
    }

    let currentModifiers = flags.intersection(modifierMask)
    if currentModifiers != lastModifierFlags {
        let released = lastModifierFlags.subtracting(currentModifiers)
        for (flag, name) in releases {
            if released.contains(flag) {
                emit("MODIFIER_UP:\(name)")
            }
        }
        lastModifierFlags = currentModifiers
        emitFlags(flags)
    }
}) else {
    FileHandle.standardError.write("Failed to create event monitor\n".data(using: .utf8)!)
    exit(1)
}

// NSEvent key-down monitor — catches compound shortcuts (e.g. Option+Space) that the CGEvent
// tap may not surface when another app is focused, because macOS handles them first.
var keyDownMonitor: Any?
keyDownMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { event in
    // Skip the app's own injected paste — see macos-fast-paste.swift.
    if event.cgEvent?.getIntegerValueField(.eventSourceUserData) == freestyleSyntheticMarker {
        return
    }
    emitFlags(event.modifierFlags)
    guard let name = keyCodeToName(event.keyCode) else { return }
    emit("KEY_DOWN:\(name)")
}

// CGEvent keyboard tap — reliable KEY_UP delivery (NSEvent global monitors often miss key-up)
let keyEventMask =
    (1 << CGEventType.keyDown.rawValue) |
    (1 << CGEventType.keyUp.rawValue)

var keyEventTapPort: CFMachPort?

let keyEventTap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .defaultTap,
    eventsOfInterest: CGEventMask(keyEventMask),
    callback: { _, type, event, _ in
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let keyEventTapPort {
                CGEvent.tapEnable(tap: keyEventTapPort, enable: true)
            }
            return Unmanaged.passUnretained(event)
        }

        // Ignore the app's own injected paste (Cmd+V from macos-fast-paste).
        // Those events carry a synthetic Command flag with no matching key-up,
        // so reacting to them would leave a phantom "command" modifier stuck and
        // block the next Fn/Globe hotkey press. See macos-fast-paste.swift.
        if event.getIntegerValueField(.eventSourceUserData) == freestyleSyntheticMarker {
            return Unmanaged.passUnretained(event)
        }

        emitFlagsFromCGEvent(event.flags)

        let keyCode = UInt16(event.getIntegerValueField(.keyboardEventKeycode))
        guard let name = keyCodeToName(keyCode) else {
            return Unmanaged.passUnretained(event)
        }

        if type == .keyUp {
            emit("KEY_UP:\(name)")
        }

        if let suppressHotkey, eventMatchesSuppressibleHotkey(event, config: suppressHotkey) {
            // Returning nil swallows this event before the NSEvent global monitor
            // can observe it, so we must emit KEY_DOWN ourselves. For non-suppressed
            // events the NSEvent monitor emits KEY_DOWN (no duplicate risk here
            // because we only emit when suppressing).
            if type == .keyDown {
                emit("KEY_DOWN:\(name)")
            }
            return nil
        }

        return Unmanaged.passUnretained(event)
    },
    userInfo: nil)

var keyEventRunLoopSource: CFRunLoopSource?
if let keyEventTap {
    keyEventTapPort = keyEventTap
    keyEventRunLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, keyEventTap, 0)
    CFRunLoopAddSource(CFRunLoopGetMain(), keyEventRunLoopSource, .commonModes)
    CGEvent.tapEnable(tap: keyEventTap, enable: true)
} else {
    FileHandle.standardError.write("Failed to create keyboard event tap\n".data(using: .utf8)!)
}

let signalSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
signal(SIGTERM, SIG_IGN)
signalSource.setEventHandler {
    NSEvent.removeMonitor(monitor)
    if let keyDownMonitor {
        NSEvent.removeMonitor(keyDownMonitor)
    }
    if let keyEventTap {
        CGEvent.tapEnable(tap: keyEventTap, enable: false)
    }
    if let keyEventRunLoopSource {
        CFRunLoopRemoveSource(CFRunLoopGetMain(), keyEventRunLoopSource, .commonModes)
    }
    if let mouseEventTap {
        CGEvent.tapEnable(tap: mouseEventTap, enable: false)
    }
    if let mouseRunLoopSource {
        CFRunLoopRemoveSource(CFRunLoopGetMain(), mouseRunLoopSource, .commonModes)
    }
    exit(0)
}
signalSource.resume()

emit("READY")

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.run()
