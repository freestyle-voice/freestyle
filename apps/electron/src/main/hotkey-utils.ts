/**
 * Normalize user-recorded accelerators to the Electron-style format expected
 * by native binaries and isValidAccelerator.
 */
export function normalizeAccelerator(accel: string): string {
  return accel
    .split("+")
    .map((part) => {
      const p = part.trim();
      if (!p) return p;

      const lower = p.toLowerCase();
      if (lower === "fn" || lower === "globe") return "Fn";
      if (lower === "control" || lower === "ctrl") return "Control";
      if (lower === "command" || lower === "cmd" || lower === "meta")
        return "Command";
      if (lower === "alt" || lower === "option") return "Alt";
      if (lower === "shift") return "Shift";
      if (lower === "commandorcontrol" || lower === "cmdorctrl")
        return "CommandOrControl";
      if (lower === "space") return "Space";
      if (lower === "return" || lower === "enter") return "Return";
      if (lower === "escape" || lower === "esc") return "Escape";
      if (lower === "backspace") return "Backspace";
      if (lower === "delete" || lower === "del") return "Delete";
      if (lower === "tab") return "Tab";
      if (lower === "rightalt" || lower === "rightoption") return "RightAlt";
      if (lower === "rightcontrol" || lower === "rightctrl")
        return "RightControl";
      if (lower === "rightshift") return "RightShift";
      if (lower === "rightcommand" || lower === "rightcmd")
        return "RightCommand";
      if (
        lower === "rightsuper" ||
        lower === "rightwin" ||
        lower === "rightmeta"
      )
        return "RightSuper";
      if (lower === "mousebutton4" || lower === "mouse4") return "MouseButton4";
      if (lower === "mousebutton5" || lower === "mouse5") return "MouseButton5";
      if (/^f\d+$/i.test(p)) return p.toUpperCase();
      if (p.length === 1) return p.toUpperCase();
      if (p === "Up" || p === "Down" || p === "Left" || p === "Right") return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join("+");
}
