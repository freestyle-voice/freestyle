/**
 * Windows focused-window bounds helper
 *
 * Prints JSON describing the foreground external window:
 *   {"x": n, "y": n, "width": n, "height": n, "pid": n}
 *
 * Usage: windows-window-bounds.exe [excludePid]
 * Exit codes: 0 success; 1 invalid arguments; 3 unavailable/own window.
 */

#define WIN32_LEAN_AND_MEAN
#define _WIN32_WINNT 0x0A00
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char *argv[]) {
    /* Electron's screen conversion accepts physical pixels. Ensure this
     * short-lived helper receives per-monitor physical coordinates too. */
    if (!SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2)) {
        SetProcessDPIAware();
    }

    DWORD exclude_pid = 0;
    if (argc > 2) return 1;
    if (argc == 2) {
        char *end = NULL;
        unsigned long value = strtoul(argv[1], &end, 10);
        if (*argv[1] == '\0' || *end != '\0' || value == 0 || value > MAXDWORD) {
            return 1;
        }
        exclude_pid = (DWORD)value;
    }

    HWND window = GetForegroundWindow();
    if (window == NULL) return 3;

    DWORD pid = 0;
    GetWindowThreadProcessId(window, &pid);
    if (pid == 0 || pid == exclude_pid) return 3;

    RECT rect;
    if (!GetWindowRect(window, &rect)) return 3;
    LONG width = rect.right - rect.left;
    LONG height = rect.bottom - rect.top;
    if (width <= 0 || height <= 0) return 3;

    printf(
        "{\"x\": %ld, \"y\": %ld, \"width\": %ld, \"height\": %ld, \"pid\": %lu}\n",
        rect.left, rect.top, width, height, (unsigned long)pid
    );
    return 0;
}
