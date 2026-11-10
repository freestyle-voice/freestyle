/**
 * macOS Accessibility window bounds for dictation display placement.
 * Usage: macos-ax window [excludePid]
 * Prints {"x": n, "y": n, "width": n, "height": n} in screen coordinates.
 * Exit codes: 0 success; 1 invalid arguments; 2 no Accessibility permission;
 * 3 no external focused window.
 */
import ApplicationServices
import Foundation

if !AXIsProcessTrusted() {
    exit(2)
}

/// The focused application's focused window. This deliberately starts from
/// the system-wide focused application rather than the focused text element:
/// apps without a text field still have a window we can anchor the pill to.
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
let command = args.first ?? "window"

switch command {
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

default:
    FileHandle.standardError.write("unknown command \"\(command)\"\n".data(using: .utf8)!)
    exit(1)
}
