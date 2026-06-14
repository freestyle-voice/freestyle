/**
 * Windows Key Listener for Push to Hold
 *
 * Uses Windows Low-Level Keyboard Hook to detect key up/down events.
 * Accepts a virtual key code as command line argument.
 * Outputs "KEY_DOWN" and "KEY_UP" to stdout.
 *
 * Compile with: cl /O2 windows-key-listener.c /Fe:windows-key-listener.exe user32.lib
 * Or with MinGW: gcc -O2 windows-key-listener.c -o windows-key-listener.exe -luser32
 */

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static HHOOK g_hook = NULL;
static HHOOK g_mouseHook = NULL;
static DWORD g_targetVk = 0;
static DWORD g_targetMouseButton = 0;
static BOOL g_isKeyDown = FALSE;

static BOOL g_requireCtrl = FALSE;
static BOOL g_requireAlt = FALSE;
static BOOL g_requireShift = FALSE;
static BOOL g_requireWin = FALSE;
static BOOL g_useModifiersOnly = FALSE;
static BOOL g_record_mode = FALSE;
static BOOL g_ctrlDown = FALSE;
static BOOL g_altDown = FALSE;
static BOOL g_shiftDown = FALSE;
static BOOL g_leftWinDown = FALSE;
static BOOL g_rightWinDown = FALSE;

static BOOL IsCtrlVk(DWORD vkCode) {
    return vkCode == VK_CONTROL || vkCode == VK_LCONTROL || vkCode == VK_RCONTROL;
}

static BOOL IsAltVk(DWORD vkCode) {
    return vkCode == VK_MENU || vkCode == VK_LMENU || vkCode == VK_RMENU;
}

static BOOL IsShiftVk(DWORD vkCode) {
    return vkCode == VK_SHIFT || vkCode == VK_LSHIFT || vkCode == VK_RSHIFT;
}

static BOOL IsWinVk(DWORD vkCode) {
    return vkCode == VK_LWIN || vkCode == VK_RWIN;
}

static void UpdateModifierState(DWORD vkCode, BOOL isKeyDown) {
    if (IsCtrlVk(vkCode)) { g_ctrlDown = isKeyDown; return; }
    if (IsAltVk(vkCode)) { g_altDown = isKeyDown; return; }
    if (IsShiftVk(vkCode)) { g_shiftDown = isKeyDown; return; }
    if (vkCode == VK_LWIN) { g_leftWinDown = isKeyDown; return; }
    if (vkCode == VK_RWIN) { g_rightWinDown = isKeyDown; }
}

static BOOL IsRequiredModifierEvent(DWORD vkCode) {
    return (g_requireCtrl && IsCtrlVk(vkCode)) ||
           (g_requireAlt && IsAltVk(vkCode)) ||
           (g_requireShift && IsShiftVk(vkCode)) ||
           (g_requireWin && IsWinVk(vkCode));
}

static void SyncModifierState(DWORD currentVkCode) {
    if (!IsCtrlVk(currentVkCode))
        g_ctrlDown = (GetAsyncKeyState(VK_CONTROL) & 0x8000) != 0;
    if (!IsAltVk(currentVkCode))
        g_altDown = (GetAsyncKeyState(VK_MENU) & 0x8000) != 0;
    if (!IsShiftVk(currentVkCode))
        g_shiftDown = (GetAsyncKeyState(VK_SHIFT) & 0x8000) != 0;
    if (currentVkCode != VK_LWIN)
        g_leftWinDown = (GetAsyncKeyState(VK_LWIN) & 0x8000) != 0;
    if (currentVkCode != VK_RWIN)
        g_rightWinDown = (GetAsyncKeyState(VK_RWIN) & 0x8000) != 0;
}

static BOOL AreRequiredModifiersPressed(void) {
    if (g_requireCtrl && !g_ctrlDown) return FALSE;
    if (g_requireAlt && !g_altDown) return FALSE;
    if (g_requireShift && !g_shiftDown) return FALSE;
    if (g_requireWin && !(g_leftWinDown || g_rightWinDown)) return FALSE;
    return TRUE;
}

static void EmitRecordModifiers(void) {
    char buf[256] = "";
    int len = 0;

    if (g_ctrlDown) {
        len += snprintf(buf + len, sizeof(buf) - len, "%sControl", len ? "," : "");
    }
    if (g_altDown) {
        len += snprintf(buf + len, sizeof(buf) - len, "%sAlt", len ? "," : "");
    }
    if (g_shiftDown) {
        len += snprintf(buf + len, sizeof(buf) - len, "%sShift", len ? "," : "");
    }
    if (g_leftWinDown || g_rightWinDown) {
        len += snprintf(buf + len, sizeof(buf) - len, "%sSuper", len ? "," : "");
    }

    printf("RECORD_MODIFIERS:%s\n", buf);
    fflush(stdout);
}

static const char* VkToRecordKeyName(DWORD vk) {
    if (vk == VK_SPACE) return "Space";
    if (vk == VK_RETURN) return "Return";
    if (vk == VK_ESCAPE) return "Escape";
    if (vk == VK_TAB) return "Tab";
    if (vk == VK_BACK) return "Backspace";
    if (vk == VK_DELETE) return "Delete";
    if (vk == VK_UP) return "Up";
    if (vk == VK_DOWN) return "Down";
    if (vk == VK_LEFT) return "Left";
    if (vk == VK_RIGHT) return "Right";
    if (vk == VK_HOME) return "Home";
    if (vk == VK_END) return "End";
    if (vk == VK_PRIOR) return "PageUp";
    if (vk == VK_NEXT) return "PageDown";
    if (vk == VK_INSERT) return "Insert";
    if (vk == VK_PAUSE) return "Pause";
    if (vk == VK_SCROLL) return "ScrollLock";
    if (vk == VK_CAPITAL) return "CapsLock";
    if (vk == VK_NUMLOCK) return "NumLock";
    if (vk == VK_RMENU) return "RightAlt";
    if (vk == VK_RCONTROL) return "RightControl";
    if (vk == VK_RSHIFT) return "RightShift";
    if (vk == VK_RWIN) return "RightSuper";
    if (vk == VK_OEM_3) return "`";
    if (vk == VK_OEM_MINUS) return "-";
    if (vk == VK_OEM_PLUS) return "=";
    if (vk == VK_OEM_4) return "[";
    if (vk == VK_OEM_6) return "]";
    if (vk == VK_OEM_5) return "\\";
    if (vk == VK_OEM_1) return ";";
    if (vk == VK_OEM_7) return "'";
    if (vk == VK_OEM_COMMA) return ",";
    if (vk == VK_OEM_PERIOD) return ".";
    if (vk == VK_OEM_2) return "/";
    if (vk >= VK_F1 && vk <= VK_F24) {
        static char fkey[8];
        snprintf(fkey, sizeof(fkey), "F%lu", (unsigned long)(vk - VK_F1 + 1));
        return fkey;
    }
    if (vk >= 'A' && vk <= 'Z') {
        static char letter[2];
        letter[0] = (char)vk;
        letter[1] = '\0';
        return letter;
    }
    if (vk >= '0' && vk <= '9') {
        static char digit[2];
        digit[0] = (char)vk;
        digit[1] = '\0';
        return digit;
    }
    return NULL;
}

static const char* MouseButtonToRecordKeyName(DWORD button) {
    if (button == XBUTTON1) return "MouseButton4";
    if (button == XBUTTON2) return "MouseButton5";
    return NULL;
}

DWORD ParseKeyCode(const char* keyName) {
    if (_stricmp(keyName, "F1") == 0) return VK_F1;
    if (_stricmp(keyName, "F2") == 0) return VK_F2;
    if (_stricmp(keyName, "F3") == 0) return VK_F3;
    if (_stricmp(keyName, "F4") == 0) return VK_F4;
    if (_stricmp(keyName, "F5") == 0) return VK_F5;
    if (_stricmp(keyName, "F6") == 0) return VK_F6;
    if (_stricmp(keyName, "F7") == 0) return VK_F7;
    if (_stricmp(keyName, "F8") == 0) return VK_F8;
    if (_stricmp(keyName, "F9") == 0) return VK_F9;
    if (_stricmp(keyName, "F10") == 0) return VK_F10;
    if (_stricmp(keyName, "F11") == 0) return VK_F11;
    if (_stricmp(keyName, "F12") == 0) return VK_F12;
    if (_stricmp(keyName, "F13") == 0) return VK_F13;
    if (_stricmp(keyName, "F14") == 0) return VK_F14;
    if (_stricmp(keyName, "F15") == 0) return VK_F15;
    if (_stricmp(keyName, "F16") == 0) return VK_F16;
    if (_stricmp(keyName, "F17") == 0) return VK_F17;
    if (_stricmp(keyName, "F18") == 0) return VK_F18;
    if (_stricmp(keyName, "F19") == 0) return VK_F19;
    if (_stricmp(keyName, "F20") == 0) return VK_F20;
    if (_stricmp(keyName, "F21") == 0) return VK_F21;
    if (_stricmp(keyName, "F22") == 0) return VK_F22;
    if (_stricmp(keyName, "F23") == 0) return VK_F23;
    if (_stricmp(keyName, "F24") == 0) return VK_F24;
    if (_stricmp(keyName, "Pause") == 0) return VK_PAUSE;
    if (_stricmp(keyName, "ScrollLock") == 0) return VK_SCROLL;
    if (_stricmp(keyName, "Insert") == 0) return VK_INSERT;
    if (_stricmp(keyName, "Home") == 0) return VK_HOME;
    if (_stricmp(keyName, "End") == 0) return VK_END;
    if (_stricmp(keyName, "PageUp") == 0) return VK_PRIOR;
    if (_stricmp(keyName, "PageDown") == 0) return VK_NEXT;
    if (_stricmp(keyName, "Space") == 0) return VK_SPACE;
    if (_stricmp(keyName, "Escape") == 0 || _stricmp(keyName, "Esc") == 0) return VK_ESCAPE;
    if (_stricmp(keyName, "Tab") == 0) return VK_TAB;
    if (_stricmp(keyName, "CapsLock") == 0) return VK_CAPITAL;
    if (_stricmp(keyName, "NumLock") == 0) return VK_NUMLOCK;
    if (_stricmp(keyName, "RightAlt") == 0 || _stricmp(keyName, "RightOption") == 0) return VK_RMENU;
    if (_stricmp(keyName, "RightControl") == 0 || _stricmp(keyName, "RightCtrl") == 0) return VK_RCONTROL;
    if (_stricmp(keyName, "RightShift") == 0) return VK_RSHIFT;
    if (_stricmp(keyName, "RightSuper") == 0 || _stricmp(keyName, "RightWin") == 0 ||
        _stricmp(keyName, "RightMeta") == 0 || _stricmp(keyName, "RightCommand") == 0 ||
        _stricmp(keyName, "RightCmd") == 0) return VK_RWIN;
    if (strcmp(keyName, "`") == 0 || _stricmp(keyName, "Backquote") == 0) return VK_OEM_3;
    if (strcmp(keyName, "-") == 0 || _stricmp(keyName, "Minus") == 0) return VK_OEM_MINUS;
    if (strcmp(keyName, "=") == 0 || _stricmp(keyName, "Equal") == 0) return VK_OEM_PLUS;
    if (strcmp(keyName, "[") == 0) return VK_OEM_4;
    if (strcmp(keyName, "]") == 0) return VK_OEM_6;
    if (strcmp(keyName, "\\") == 0) return VK_OEM_5;
    if (strcmp(keyName, ";") == 0) return VK_OEM_1;
    if (strcmp(keyName, "'") == 0) return VK_OEM_7;
    if (strcmp(keyName, ",") == 0) return VK_OEM_COMMA;
    if (strcmp(keyName, ".") == 0) return VK_OEM_PERIOD;
    if (strcmp(keyName, "/") == 0) return VK_OEM_2;

    if (strlen(keyName) == 1) {
        char c = keyName[0];
        if (c >= 'a' && c <= 'z') return (DWORD)(c - 'a' + 'A');
        if (c >= 'A' && c <= 'Z') return (DWORD)c;
        if (c >= '0' && c <= '9') return (DWORD)c;
    }

    if (keyName[0] == '0' && (keyName[1] == 'x' || keyName[1] == 'X')) {
        return (DWORD)strtol(keyName, NULL, 16);
    }

    return (DWORD)atoi(keyName);
}

DWORD ParseMouseButton(const char* keyName) {
    if (_stricmp(keyName, "MouseButton4") == 0 || _stricmp(keyName, "Mouse4") == 0) return XBUTTON1;
    if (_stricmp(keyName, "MouseButton5") == 0 || _stricmp(keyName, "Mouse5") == 0) return XBUTTON2;
    return 0;
}

LRESULT CALLBACK LowLevelKeyboardProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION) {
        KBDLLHOOKSTRUCT* kbd = (KBDLLHOOKSTRUCT*)lParam;
        BOOL isDown = (wParam == WM_KEYDOWN || wParam == WM_SYSKEYDOWN);
        BOOL isUp = (wParam == WM_KEYUP || wParam == WM_SYSKEYUP);
        BOOL isModifierEvent = IsCtrlVk(kbd->vkCode) || IsAltVk(kbd->vkCode) ||
                               IsShiftVk(kbd->vkCode) || IsWinVk(kbd->vkCode);

        if (g_record_mode && isDown) {
            if (kbd->vkCode == VK_ESCAPE) {
                printf("RECORD_CANCEL\n");
                fflush(stdout);
                return CallNextHookEx(g_hook, nCode, wParam, lParam);
            }

            if (isModifierEvent) {
                UpdateModifierState(kbd->vkCode, TRUE);
                SyncModifierState(kbd->vkCode);

                if (kbd->vkCode == VK_RMENU || kbd->vkCode == VK_RCONTROL ||
                    kbd->vkCode == VK_RSHIFT || kbd->vkCode == VK_RWIN) {
                    const char* keyName = VkToRecordKeyName(kbd->vkCode);
                    if (keyName) {
                        printf("RECORD_KEY:%s\n", keyName);
                        fflush(stdout);
                    }
                    return CallNextHookEx(g_hook, nCode, wParam, lParam);
                }

                EmitRecordModifiers();
                return CallNextHookEx(g_hook, nCode, wParam, lParam);
            }

            const char* keyName = VkToRecordKeyName(kbd->vkCode);
            if (keyName) {
                EmitRecordModifiers();
                printf("RECORD_KEY:%s\n", keyName);
                fflush(stdout);
            }
            return CallNextHookEx(g_hook, nCode, wParam, lParam);
        }

        if (g_record_mode && isUp) {
            if (isModifierEvent) {
                UpdateModifierState(kbd->vkCode, FALSE);
            }
            printf("RECORD_RELEASE\n");
            fflush(stdout);
            return CallNextHookEx(g_hook, nCode, wParam, lParam);
        }

        if ((isDown || isUp) && isModifierEvent) {
            UpdateModifierState(kbd->vkCode, isDown);
            SyncModifierState(kbd->vkCode);
        }

        if (g_isKeyDown && isUp && IsRequiredModifierEvent(kbd->vkCode) &&
            !AreRequiredModifiersPressed()) {
            g_isKeyDown = FALSE;
            printf("KEY_UP\n");
            fflush(stdout);
        }

        if (g_isKeyDown && !g_useModifiersOnly && g_targetVk != 0 &&
            kbd->vkCode != g_targetVk &&
            !(GetAsyncKeyState(g_targetVk) & 0x8000)) {
            g_isKeyDown = FALSE;
            printf("KEY_UP\n");
            fflush(stdout);
        }

        if (g_useModifiersOnly) {
            if (isDown) {
                if (!g_isKeyDown && AreRequiredModifiersPressed()) {
                    g_isKeyDown = TRUE;
                    printf("KEY_DOWN\n");
                    fflush(stdout);
                }
            } else if (isUp) {
                if (g_isKeyDown && !AreRequiredModifiersPressed()) {
                    g_isKeyDown = FALSE;
                    printf("KEY_UP\n");
                    fflush(stdout);
                }
            }
            return CallNextHookEx(g_hook, nCode, wParam, lParam);
        }

        if (kbd->vkCode == g_targetVk) {
            if (isDown) {
                if (!g_isKeyDown && AreRequiredModifiersPressed()) {
                    g_isKeyDown = TRUE;
                    printf("KEY_DOWN\n");
                    fflush(stdout);
                }
                /* Suppress the key event globally so Windows doesn't process it.
                   This fires on both the initial press and held-key repeats.
                   Intentional for Alt+Space (prevents system window menu); note that
                   changing the hotkey to something other apps rely on would also suppress it. */
                if (g_isKeyDown) return 1;
            } else if (isUp) {
                if (g_isKeyDown) {
                    g_isKeyDown = FALSE;
                    printf("KEY_UP\n");
                    fflush(stdout);
                    return 1;
                }
            }
        }
    }
    return CallNextHookEx(g_hook, nCode, wParam, lParam);
}

LRESULT CALLBACK LowLevelMouseProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION) {
        MSLLHOOKSTRUCT* mouse = (MSLLHOOKSTRUCT*)lParam;
        BOOL isDown = (wParam == WM_XBUTTONDOWN);
        BOOL isUp = (wParam == WM_XBUTTONUP);

        if (!isDown && !isUp) {
            return CallNextHookEx(g_mouseHook, nCode, wParam, lParam);
        }

        DWORD button = HIWORD(mouse->mouseData);

        if (g_record_mode) {
            if (isDown) {
                const char* keyName = MouseButtonToRecordKeyName(button);
                if (keyName) {
                    EmitRecordModifiers();
                    printf("RECORD_KEY:%s\n", keyName);
                    fflush(stdout);
                }
            } else {
                printf("RECORD_RELEASE\n");
                fflush(stdout);
            }
            return CallNextHookEx(g_mouseHook, nCode, wParam, lParam);
        }

        if (button != g_targetMouseButton) {
            return CallNextHookEx(g_mouseHook, nCode, wParam, lParam);
        }

        if (isDown) {
            if (!g_isKeyDown && AreRequiredModifiersPressed()) {
                g_isKeyDown = TRUE;
                printf("KEY_DOWN\n");
                fflush(stdout);
            }
            if (g_isKeyDown) return 1;
        } else if (isUp) {
            if (g_isKeyDown) {
                g_isKeyDown = FALSE;
                printf("KEY_UP\n");
                fflush(stdout);
                return 1;
            }
        }
    }
    return CallNextHookEx(g_mouseHook, nCode, wParam, lParam);
}

BOOL WINAPI ConsoleHandler(DWORD signal) {
    if (signal == CTRL_C_EVENT || signal == CTRL_BREAK_EVENT || signal == CTRL_CLOSE_EVENT) {
        if (g_hook) {
            UnhookWindowsHookEx(g_hook);
            g_hook = NULL;
        }
        if (g_mouseHook) {
            UnhookWindowsHookEx(g_mouseHook);
            g_mouseHook = NULL;
        }
        ExitProcess(0);
    }
    return TRUE;
}

DWORD ParseCompoundHotkey(const char* hotkey) {
    char buffer[256];
    strncpy(buffer, hotkey, sizeof(buffer) - 1);
    buffer[sizeof(buffer) - 1] = '\0';

    g_requireCtrl = FALSE;
    g_requireAlt = FALSE;
    g_requireShift = FALSE;
    g_requireWin = FALSE;
    g_useModifiersOnly = FALSE;
    g_targetMouseButton = 0;

    DWORD mainKeyVk = 0;
    char* token = strtok(buffer, "+");

    while (token != NULL) {
        while (*token == ' ') token++;
        char* end = token + strlen(token) - 1;
        while (end > token && *end == ' ') *end-- = '\0';

        if (_stricmp(token, "CommandOrControl") == 0 ||
            _stricmp(token, "Control") == 0 ||
            _stricmp(token, "Ctrl") == 0 ||
            _stricmp(token, "CmdOrCtrl") == 0) {
            g_requireCtrl = TRUE;
        } else if (_stricmp(token, "Alt") == 0 ||
                   _stricmp(token, "Option") == 0) {
            g_requireAlt = TRUE;
        } else if (_stricmp(token, "Shift") == 0) {
            g_requireShift = TRUE;
        } else if (_stricmp(token, "Super") == 0 ||
                   _stricmp(token, "Meta") == 0 ||
                   _stricmp(token, "Win") == 0 ||
                   _stricmp(token, "Command") == 0 ||
                   _stricmp(token, "Cmd") == 0) {
            g_requireWin = TRUE;
        } else {
            DWORD mouseButton = ParseMouseButton(token);
            if (mouseButton != 0) {
                g_targetMouseButton = mouseButton;
            } else {
                mainKeyVk = ParseKeyCode(token);
            }
        }

        token = strtok(NULL, "+");
    }

    return mainKeyVk;
}

static DWORD WINAPI StdinMonitorThread(LPVOID param) {
    DWORD mainThreadId = (DWORD)(DWORD_PTR)param;
    char buf[64];
    HANDLE hStdin = GetStdHandle(STD_INPUT_HANDLE);

    while (1) {
        DWORD bytesRead = 0;
        BOOL ok = ReadFile(hStdin, buf, sizeof(buf), &bytesRead, NULL);
        if (!ok || bytesRead == 0) {
            PostThreadMessage(mainThreadId, WM_QUIT, 0, 0);
            break;
        }
    }
    return 0;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <key> | %s --record\n", argv[0], argv[0]);
        fprintf(stderr, "Examples:\n");
        fprintf(stderr, "  %s `                        (backtick)\n", argv[0]);
        fprintf(stderr, "  %s F8                       (function key)\n", argv[0]);
        fprintf(stderr, "  %s CommandOrControl+F11     (with modifier)\n", argv[0]);
        fprintf(stderr, "  %s Ctrl+Shift+Space         (multiple modifiers)\n", argv[0]);
        fprintf(stderr, "  %s --record                 (hotkey rebinding mode)\n", argv[0]);
        return 1;
    }

    if (_stricmp(argv[1], "--record") == 0) {
        g_record_mode = TRUE;
        fprintf(stderr, "Hotkey recording mode\n");
    } else {
        g_targetVk = ParseCompoundHotkey(argv[1]);
    }

    if (!g_record_mode) {
        if (g_targetVk == 0 && g_targetMouseButton == 0 &&
            (g_requireCtrl || g_requireAlt || g_requireShift || g_requireWin)) {
            g_useModifiersOnly = TRUE;
        }

        if (g_targetVk == 0 && g_targetMouseButton == 0 && !g_useModifiersOnly) {
            fprintf(stderr, "Error: Invalid key '%s'\n", argv[1]);
            return 1;
        }

        fprintf(stderr, "Listening for: %s (VK=0x%02X, Mouse=%lu, Ctrl=%d, Alt=%d, Shift=%d, Win=%d, ModOnly=%d)\n",
                argv[1], g_targetVk, (unsigned long)g_targetMouseButton, g_requireCtrl, g_requireAlt, g_requireShift, g_requireWin, g_useModifiersOnly);
    }

    SetConsoleCtrlHandler(ConsoleHandler, TRUE);

    DWORD mainThreadId = GetCurrentThreadId();
    HANDLE hThread = CreateThread(NULL, 0, StdinMonitorThread, (LPVOID)(DWORD_PTR)mainThreadId, 0, NULL);
    if (hThread) CloseHandle(hThread);

    g_hook = SetWindowsHookEx(WH_KEYBOARD_LL, LowLevelKeyboardProc, NULL, 0);
    if (!g_hook) {
        fprintf(stderr, "Error: Failed to install keyboard hook (error %lu)\n", GetLastError());
        return 1;
    }

    g_mouseHook = SetWindowsHookEx(WH_MOUSE_LL, LowLevelMouseProc, NULL, 0);
    if (!g_mouseHook && (g_record_mode || g_targetMouseButton != 0)) {
        fprintf(stderr, "Error: Failed to install mouse hook (error %lu)\n", GetLastError());
        UnhookWindowsHookEx(g_hook);
        return 1;
    }

    printf("READY\n");
    fflush(stdout);

    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    UnhookWindowsHookEx(g_hook);
    if (g_mouseHook) UnhookWindowsHookEx(g_mouseHook);
    return 0;
}
