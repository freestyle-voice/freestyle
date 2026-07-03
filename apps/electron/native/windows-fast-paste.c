/**
 * Windows Fast Paste
 *
 * Injects Ctrl+V (or Ctrl+Shift+V for terminals) using the SendInput API.
 * Much faster than spawning PowerShell with SendKeys.
 *
 * Usage: windows-fast-paste.exe [--terminal]
 *
 * Exit codes:
 *   0 - success
 *   1 - SendInput failed
 *
 * Compile with: cl /O2 windows-fast-paste.c /Fe:windows-fast-paste.exe user32.lib
 * Or with MinGW: gcc -O2 windows-fast-paste.c -o windows-fast-paste.exe -luser32
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>

/* Resolve the virtual key that types 'v' under the focused window's
 * keyboard layout, so paste works on non-QWERTY layouts. */
static WORD resolve_v_vk(void) {
    HKL hkl = NULL;
    HWND fg = GetForegroundWindow();
    if (fg) {
        DWORD tid = GetWindowThreadProcessId(fg, NULL);
        hkl = GetKeyboardLayout(tid);
    }
    SHORT scan = hkl ? VkKeyScanExW(L'v', hkl) : VkKeyScanW(L'v');
    if (scan == -1) return 'V';
    return (WORD)(scan & 0xFF);
}

int main(int argc, char* argv[]) {
    int use_shift = 0;

    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--terminal") == 0) {
            use_shift = 1;
        }
    }

    WORD v_vk = resolve_v_vk();

    int nInputs = use_shift ? 8 : 6;
    INPUT inputs[8];
    ZeroMemory(inputs, sizeof(inputs));
    int idx = 0;

    /* Ctrl down */
    inputs[idx].type = INPUT_KEYBOARD;
    inputs[idx].ki.wVk = VK_CONTROL;
    idx++;

    /* Shift down (terminal mode) */
    if (use_shift) {
        inputs[idx].type = INPUT_KEYBOARD;
        inputs[idx].ki.wVk = VK_SHIFT;
        idx++;
    }

    /* V down */
    inputs[idx].type = INPUT_KEYBOARD;
    inputs[idx].ki.wVk = v_vk;
    idx++;

    /* V up */
    inputs[idx].type = INPUT_KEYBOARD;
    inputs[idx].ki.wVk = v_vk;
    inputs[idx].ki.dwFlags = KEYEVENTF_KEYUP;
    idx++;

    /* Shift up (terminal mode) */
    if (use_shift) {
        inputs[idx].type = INPUT_KEYBOARD;
        inputs[idx].ki.wVk = VK_SHIFT;
        inputs[idx].ki.dwFlags = KEYEVENTF_KEYUP;
        idx++;
    }

    /* Ctrl up */
    inputs[idx].type = INPUT_KEYBOARD;
    inputs[idx].ki.wVk = VK_CONTROL;
    inputs[idx].ki.dwFlags = KEYEVENTF_KEYUP;
    idx++;

    UINT sent = SendInput(idx, inputs, sizeof(INPUT));
    if (sent != (UINT)idx) {
        fprintf(stderr, "SendInput failed: sent %u of %d (error %lu)\n",
                sent, idx, GetLastError());
        return 1;
    }

    /* Brief delay to let the target app process the keystroke */
    Sleep(20);
    return 0;
}
