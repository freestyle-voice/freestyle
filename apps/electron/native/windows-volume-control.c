/**
 * Windows Volume Control Helper
 *
 * Native helper for low-latency Windows system-volume ducking.
 *
 * Opens the default playback endpoint's IAudioEndpointVolume once and keeps it
 * alive for the lifetime of the process. Reads commands from stdin and writes
 * compact "volume|muted" responses to stdout.
 *
 * Design goals:
 *  - Fast: no PowerShell spawn per operation, warm COM object.
 *  - Safe: clean shutdown on stdin close / EOF / CTRL events; the parent
 *    process owns restore logic.
 *  - Simple IPC: line-delimited text, one command per line.
 *
 * Supported commands (case-sensitive, trailing whitespace ignored):
 *   get              -> "0.75|false\n"
 *   set <0..1>       -> "ok\n"
 *   mute <0|1>       -> "ok\n"
 *   quit             -> "ok\n" then exit
 *
 * Error responses start with "err|" and are followed by a short message.
 *
 * Compile (MSVC):
 *   cl /O2 /MT windows-volume-control.c /Fe:windows-volume-control.exe \
 *      user32.lib ole32.lib uuid.lib
 *
 * Compile (MinGW):
 *   gcc -O2 -mwindows windows-volume-control.c -o windows-volume-control.exe \
 *       -luser32 -lole32 -luuid
 */

#define WIN32_LEAN_AND_MEAN
#define COBJMACROS
#define CINTERFACE

#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

/* Core Audio interface declarations. */
#include <mmdeviceapi.h>
#include <endpointvolume.h>

/* ------------------------------------------------------------------------ *
 * Explicit GUID definitions
 *
 * These symbols are normally supplied by defining INITGUID and including
 * <initguid.h> before the Core Audio headers, or by linking uuid.lib. On the
 * current build host only clang-cl is available, and neither path resolves the
 * symbols, so we define them directly in this translation unit.
 * ------------------------------------------------------------------------ */

const CLSID CLSID_MMDeviceEnumerator =
    { 0xBCDE0395, 0xE52F, 0x467C, { 0x8E, 0x3D, 0xC4, 0x57, 0x92, 0x91, 0x69, 0x2E } };

const IID IID_IMMDeviceEnumerator =
    { 0xA95664D2, 0x9614, 0x4F35, { 0xA7, 0x46, 0xDE, 0x8D, 0xB6, 0x36, 0x17, 0xE6 } };

const IID IID_IAudioEndpointVolume =
    { 0x5CDF2C82, 0x841E, 0x4546, { 0x97, 0x22, 0x0C, 0xF7, 0x40, 0x78, 0x22, 0x9A } };

/* ------------------------------------------------------------------------ *
 * Globals
 * ------------------------------------------------------------------------ */

static volatile BOOL g_running = TRUE;
static IAudioEndpointVolume *g_endpoint = NULL;
static IMMDeviceEnumerator *g_enumerator = NULL;
static IMMDevice *g_device = NULL;

/* ------------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------------ */

static void write_line(const char *line) {
    if (!line) return;
    DWORD written = 0;
    DWORD len = (DWORD)strlen(line);
    HANDLE h = GetStdHandle(STD_OUTPUT_HANDLE);
    if (h == INVALID_HANDLE_VALUE) return;
    WriteFile(h, line, len, &written, NULL);
    WriteFile(h, "\n", 1, &written, NULL);
    FlushFileBuffers(h);
}

static void report_error(const char *msg) {
    char buf[512];
    snprintf(buf, sizeof(buf), "err|%s", msg ? msg : "unknown");
    write_line(buf);
}

static BOOL ensure_endpoint(void) {
    if (g_endpoint) return TRUE;

    HRESULT hr = CoCreateInstance(
        &CLSID_MMDeviceEnumerator,
        NULL,
        CLSCTX_ALL,
        &IID_IMMDeviceEnumerator,
        (void **)&g_enumerator);
    if (FAILED(hr) || !g_enumerator) {
        report_error("device-enumerator-creation-failed");
        return FALSE;
    }

    hr = g_enumerator->lpVtbl->GetDefaultAudioEndpoint(
        g_enumerator, eRender, eMultimedia, &g_device);
    if (FAILED(hr) || !g_device) {
        report_error("default-endpoint-not-found");
        return FALSE;
    }

    hr = g_device->lpVtbl->Activate(
        g_device,
        &IID_IAudioEndpointVolume,
        CLSCTX_ALL,
        NULL,
        (void **)&g_endpoint);
    if (FAILED(hr) || !g_endpoint) {
        report_error("endpoint-activation-failed");
        return FALSE;
    }

    return TRUE;
}

static void release_endpoint(void) {
    if (g_endpoint) {
        g_endpoint->lpVtbl->Release(g_endpoint);
        g_endpoint = NULL;
    }
    if (g_device) {
        g_device->lpVtbl->Release(g_device);
        g_device = NULL;
    }
    if (g_enumerator) {
        g_enumerator->lpVtbl->Release(g_enumerator);
        g_enumerator = NULL;
    }
}

static void cmd_get(void) {
    if (!ensure_endpoint()) return;

    float volume = 0.0f;
    BOOL muted = FALSE;
    HRESULT hr = g_endpoint->lpVtbl->GetMasterVolumeLevelScalar(g_endpoint, &volume);
    if (FAILED(hr)) {
        report_error("get-volume-failed");
        return;
    }
    hr = g_endpoint->lpVtbl->GetMute(g_endpoint, &muted);
    if (FAILED(hr)) {
        report_error("get-mute-failed");
        return;
    }

    char buf[64];
    snprintf(buf, sizeof(buf), "%f|%s", volume, muted ? "true" : "false");
    write_line(buf);
}

static void cmd_set(const char *arg) {
    if (!arg || !*arg) {
        report_error("set-missing-argument");
        return;
    }
    char *end = NULL;
    double value = strtod(arg, &end);
    if (end == arg || value < 0.0 || value > 1.0) {
        report_error("set-invalid-argument");
        return;
    }
    if (!ensure_endpoint()) return;

    HRESULT hr = g_endpoint->lpVtbl->SetMasterVolumeLevelScalar(
        g_endpoint, (float)value, NULL);
    if (FAILED(hr)) {
        report_error("set-volume-failed");
        return;
    }
    write_line("ok");
}

static void cmd_mute(const char *arg) {
    if (!arg || !*arg) {
        report_error("mute-missing-argument");
        return;
    }
    BOOL muted = FALSE;
    if (strcmp(arg, "1") == 0 || _stricmp(arg, "true") == 0) {
        muted = TRUE;
    } else if (strcmp(arg, "0") == 0 || _stricmp(arg, "false") == 0) {
        muted = FALSE;
    } else {
        report_error("mute-invalid-argument");
        return;
    }
    if (!ensure_endpoint()) return;

    HRESULT hr = g_endpoint->lpVtbl->SetMute(g_endpoint, muted, NULL);
    if (FAILED(hr)) {
        report_error("set-mute-failed");
        return;
    }
    write_line("ok");
}

static void process_line(const char *line) {
    char buf[256];
    strncpy_s(buf, sizeof(buf), line, sizeof(buf) - 1);
    buf[sizeof(buf) - 1] = '\0';

    /* Trim trailing whitespace */
    size_t len = strlen(buf);
    while (len > 0 && isspace((unsigned char)buf[len - 1])) {
        buf[len - 1] = '\0';
        len--;
    }

    if (strcmp(buf, "get") == 0) {
        cmd_get();
    } else if (strcmp(buf, "quit") == 0) {
        write_line("ok");
        g_running = FALSE;
    } else if (strncmp(buf, "set ", 4) == 0) {
        cmd_set(buf + 4);
    } else if (strncmp(buf, "mute ", 5) == 0) {
        cmd_mute(buf + 5);
    } else if (strcmp(buf, "set") == 0 || strcmp(buf, "mute") == 0) {
        report_error("missing-argument");
    } else {
        report_error("unknown-command");
    }
}

/* ------------------------------------------------------------------------ *
 * Console / signal handling
 * ------------------------------------------------------------------------ */

static BOOL WINAPI console_handler(DWORD signal) {
    if (signal == CTRL_C_EVENT ||
        signal == CTRL_BREAK_EVENT ||
        signal == CTRL_CLOSE_EVENT ||
        signal == CTRL_LOGOFF_EVENT ||
        signal == CTRL_SHUTDOWN_EVENT) {
        g_running = FALSE;
        return TRUE;
    }
    return FALSE;
}

/* ------------------------------------------------------------------------ *
 * Stdin reader
 * ------------------------------------------------------------------------ */

static BOOL read_line(char *out, size_t out_size) {
    if (!out || out_size == 0) return FALSE;
    size_t i = 0;
    out[0] = '\0';

    HANDLE hStdin = GetStdHandle(STD_INPUT_HANDLE);
    if (hStdin == INVALID_HANDLE_VALUE) return FALSE;

    while (g_running && i < out_size - 1) {
        char ch = 0;
        DWORD read = 0;
        BOOL ok = ReadFile(hStdin, &ch, 1, &read, NULL);
        if (!ok || read == 0) {
            /* EOF or pipe closed */
            return FALSE;
        }
        if (ch == '\n') {
            break;
        }
        if (ch != '\r') {
            out[i++] = ch;
        }
    }
    out[i] = '\0';
    return TRUE;
}

/* ------------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------------ */

int main(void) {
    SetConsoleOutputCP(CP_UTF8);
    SetConsoleCtrlHandler(console_handler, TRUE);

    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (FAILED(hr)) {
        report_error("coinitialize-failed");
        return 1;
    }

    /* Pre-warm the endpoint so the first real command is fast. */
    if (!ensure_endpoint()) {
        CoUninitialize();
        return 1;
    }

    write_line("ready");

    char line[512];
    while (g_running) {
        BOOL ok = read_line(line, sizeof(line));
        if (!ok) {
            /* EOF / parent closed pipe -> exit cleanly. */
            break;
        }
        process_line(line);
    }

    release_endpoint();
    CoUninitialize();
    return 0;
}
