/**
 * Windows Microphone Listener
 *
 * Monitors WASAPI audio capture sessions for microphone usage.
 * Outputs MIC_START/MIC_STOP events with PIDs to stdout.
 *
 * Uses IAudioSessionManager2 to enumerate and monitor capture sessions.
 * Supports --exclude-pid to ignore the app's own microphone usage.
 *
 * Compile with: cl /O2 windows-mic-listener.c /Fe:windows-mic-listener.exe user32.lib ole32.lib oleaut32.lib uuid.lib
 * Or with MinGW: gcc -O2 windows-mic-listener.c -o windows-mic-listener.exe -luser32 -lole32 -loleaut32 -luuid
 */

#define WIN32_LEAN_AND_MEAN
#define COBJMACROS
#define CINTERFACE

#include <windows.h>
#include <initguid.h>
#include <mmdeviceapi.h>
#include <audiopolicy.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static DWORD g_excludePid = 0;
static volatile BOOL g_running = TRUE;
static DWORD g_mainThreadId = 0;

/* ======================================================================== *
 * IAudioSessionEvents implementation
 * ======================================================================== */

typedef struct SessionEvents {
    IAudioSessionEventsVtbl *lpVtbl;
    LONG refCount;
    DWORD pid;
} SessionEvents;

static HRESULT STDMETHODCALLTYPE SE_QueryInterface(
    IAudioSessionEvents *This, REFIID riid, void **ppvObject)
{
    if (IsEqualIID(riid, &IID_IUnknown) || IsEqualIID(riid, &IID_IAudioSessionEvents)) {
        *ppvObject = This;
        This->lpVtbl->AddRef(This);
        return S_OK;
    }
    *ppvObject = NULL;
    return E_NOINTERFACE;
}

static ULONG STDMETHODCALLTYPE SE_AddRef(IAudioSessionEvents *This) {
    SessionEvents *self = (SessionEvents *)This;
    return InterlockedIncrement(&self->refCount);
}

static ULONG STDMETHODCALLTYPE SE_Release(IAudioSessionEvents *This) {
    SessionEvents *self = (SessionEvents *)This;
    LONG count = InterlockedDecrement(&self->refCount);
    if (count == 0) free(self);
    return count;
}

static HRESULT STDMETHODCALLTYPE SE_OnDisplayNameChanged(
    IAudioSessionEvents *This, LPCWSTR n, LPCGUID e) {
    (void)This; (void)n; (void)e; return S_OK;
}
static HRESULT STDMETHODCALLTYPE SE_OnIconPathChanged(
    IAudioSessionEvents *This, LPCWSTR n, LPCGUID e) {
    (void)This; (void)n; (void)e; return S_OK;
}
static HRESULT STDMETHODCALLTYPE SE_OnSimpleVolumeChanged(
    IAudioSessionEvents *This, float v, BOOL m, LPCGUID e) {
    (void)This; (void)v; (void)m; (void)e; return S_OK;
}
static HRESULT STDMETHODCALLTYPE SE_OnChannelVolumeChanged(
    IAudioSessionEvents *This, DWORD c, float a[], DWORD ch, LPCGUID e) {
    (void)This; (void)c; (void)a; (void)ch; (void)e; return S_OK;
}
static HRESULT STDMETHODCALLTYPE SE_OnGroupingParamChanged(
    IAudioSessionEvents *This, LPCGUID g, LPCGUID e) {
    (void)This; (void)g; (void)e; return S_OK;
}

static HRESULT STDMETHODCALLTYPE SE_OnStateChanged(
    IAudioSessionEvents *This, AudioSessionState NewState)
{
    SessionEvents *self = (SessionEvents *)This;
    if (g_excludePid != 0 && self->pid == g_excludePid) return S_OK;

    if (NewState == AudioSessionStateActive) {
        printf("MIC_START %lu\n", (unsigned long)self->pid);
        fflush(stdout);
    } else if (NewState == AudioSessionStateInactive || NewState == AudioSessionStateExpired) {
        printf("MIC_STOP %lu\n", (unsigned long)self->pid);
        fflush(stdout);
    }
    return S_OK;
}

static HRESULT STDMETHODCALLTYPE SE_OnSessionDisconnected(
    IAudioSessionEvents *This, AudioSessionDisconnectReason r)
{
    SessionEvents *self = (SessionEvents *)This;
    (void)r;
    if (g_excludePid != 0 && self->pid == g_excludePid) return S_OK;

    printf("MIC_STOP %lu\n", (unsigned long)self->pid);
    fflush(stdout);
    return S_OK;
}

static IAudioSessionEventsVtbl g_sessionEventsVtbl = {
    SE_QueryInterface, SE_AddRef, SE_Release,
    SE_OnDisplayNameChanged, SE_OnIconPathChanged,
    SE_OnSimpleVolumeChanged, SE_OnChannelVolumeChanged,
    SE_OnGroupingParamChanged, SE_OnStateChanged,
    SE_OnSessionDisconnected
};

static SessionEvents *CreateSessionEvents(DWORD pid) {
    SessionEvents *se = (SessionEvents *)calloc(1, sizeof(SessionEvents));
    if (!se) return NULL;
    se->lpVtbl = &g_sessionEventsVtbl;
    se->refCount = 1;
    se->pid = pid;
    return se;
}

/* ======================================================================== *
 * IAudioSessionNotification implementation
 * ======================================================================== */

typedef struct SessionNotification {
    IAudioSessionNotificationVtbl *lpVtbl;
    LONG refCount;
} SessionNotification;

static HRESULT STDMETHODCALLTYPE SN_QueryInterface(
    IAudioSessionNotification *This, REFIID riid, void **ppvObject)
{
    if (IsEqualIID(riid, &IID_IUnknown) || IsEqualIID(riid, &IID_IAudioSessionNotification)) {
        *ppvObject = This;
        This->lpVtbl->AddRef(This);
        return S_OK;
    }
    *ppvObject = NULL;
    return E_NOINTERFACE;
}

static ULONG STDMETHODCALLTYPE SN_AddRef(IAudioSessionNotification *This) {
    SessionNotification *self = (SessionNotification *)This;
    return InterlockedIncrement(&self->refCount);
}

static ULONG STDMETHODCALLTYPE SN_Release(IAudioSessionNotification *This) {
    SessionNotification *self = (SessionNotification *)This;
    LONG count = InterlockedDecrement(&self->refCount);
    if (count == 0) free(self);
    return count;
}

static void RegisterSessionEventsOnControl(IAudioSessionControl *pSessionControl);

static HRESULT STDMETHODCALLTYPE SN_OnSessionCreated(
    IAudioSessionNotification *This, IAudioSessionControl *NewSession)
{
    (void)This;
    if (NewSession) RegisterSessionEventsOnControl(NewSession);
    return S_OK;
}

static IAudioSessionNotificationVtbl g_sessionNotificationVtbl = {
    SN_QueryInterface, SN_AddRef, SN_Release, SN_OnSessionCreated
};

static SessionNotification *CreateSessionNotification(void) {
    SessionNotification *sn = (SessionNotification *)calloc(1, sizeof(SessionNotification));
    if (!sn) return NULL;
    sn->lpVtbl = &g_sessionNotificationVtbl;
    sn->refCount = 1;
    return sn;
}

/* ======================================================================== *
 * Helper: register events on a session control
 * ======================================================================== */

static void RegisterSessionEventsOnControl(IAudioSessionControl *pCtl) {
    IAudioSessionControl2 *pCtl2 = NULL;
    HRESULT hr = pCtl->lpVtbl->QueryInterface(pCtl, &IID_IAudioSessionControl2, (void **)&pCtl2);
    if (FAILED(hr) || !pCtl2) return;

    DWORD pid = 0;
    pCtl2->lpVtbl->GetProcessId(pCtl2, &pid);

    SessionEvents *events = CreateSessionEvents(pid);
    if (events) {
        pCtl->lpVtbl->RegisterAudioSessionNotification(pCtl, (IAudioSessionEvents *)events);
    }

    AudioSessionState state;
    hr = pCtl->lpVtbl->GetState(pCtl, &state);
    if (SUCCEEDED(hr) && state == AudioSessionStateActive) {
        if (g_excludePid == 0 || pid != g_excludePid) {
            printf("MIC_START %lu\n", (unsigned long)pid);
            fflush(stdout);
        }
    }

    pCtl2->lpVtbl->Release(pCtl2);
}

/* ======================================================================== *
 * Monitor capture sessions on a device
 * ======================================================================== */

static void MonitorDevice(IMMDevice *pDevice) {
    IAudioSessionManager2 *pMgr = NULL;
    HRESULT hr = pDevice->lpVtbl->Activate(pDevice, &IID_IAudioSessionManager2,
        CLSCTX_ALL, NULL, (void **)&pMgr);
    if (FAILED(hr) || !pMgr) return;

    SessionNotification *notification = CreateSessionNotification();
    if (notification) {
        pMgr->lpVtbl->RegisterSessionNotification(pMgr, (IAudioSessionNotification *)notification);
    }

    IAudioSessionEnumerator *pEnum = NULL;
    hr = pMgr->lpVtbl->GetSessionEnumerator(pMgr, &pEnum);
    if (SUCCEEDED(hr) && pEnum) {
        int count = 0;
        pEnum->lpVtbl->GetCount(pEnum, &count);
        for (int i = 0; i < count; i++) {
            IAudioSessionControl *pCtl = NULL;
            hr = pEnum->lpVtbl->GetSession(pEnum, i, &pCtl);
            if (SUCCEEDED(hr) && pCtl) {
                RegisterSessionEventsOnControl(pCtl);
                /* Release our reference — the registered callback holds its own */
                pCtl->lpVtbl->Release(pCtl);
            }
        }
        pEnum->lpVtbl->Release(pEnum);
    }
    /* Don't release pMgr — session notifications require it alive */
}

/* ======================================================================== *
 * Console handler & stdin monitor
 * ======================================================================== */

BOOL WINAPI ConsoleHandler(DWORD signal) {
    if (signal == CTRL_C_EVENT || signal == CTRL_BREAK_EVENT || signal == CTRL_CLOSE_EVENT) {
        g_running = FALSE;
        PostThreadMessage(g_mainThreadId, WM_QUIT, 0, 0);
        return TRUE;
    }
    return FALSE;
}

static DWORD WINAPI StdinMonitorThread(LPVOID param) {
    (void)param;
    char buf[64];
    HANDLE hStdin = GetStdHandle(STD_INPUT_HANDLE);

    while (g_running) {
        DWORD bytesRead = 0;
        BOOL ok = ReadFile(hStdin, buf, sizeof(buf), &bytesRead, NULL);
        if (!ok || bytesRead == 0) {
            g_running = FALSE;
            PostThreadMessage(g_mainThreadId, WM_QUIT, 0, 0);
            break;
        }
    }
    return 0;
}

/* ======================================================================== *
 * Main
 * ======================================================================== */

int main(int argc, char *argv[]) {
    for (int i = 1; i < argc; i++) {
        if (strcmp(argv[i], "--exclude-pid") == 0 && i + 1 < argc) {
            g_excludePid = (DWORD)atol(argv[i + 1]);
            i++;
        }
    }

    g_mainThreadId = GetCurrentThreadId();

    /* STA required for WASAPI session notification callbacks */
    HRESULT hr = CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (FAILED(hr)) {
        fprintf(stderr, "CoInitializeEx failed (0x%08lx)\n", (unsigned long)hr);
        return 1;
    }

    IMMDeviceEnumerator *pEnumerator = NULL;
    hr = CoCreateInstance(&CLSID_MMDeviceEnumerator, NULL, CLSCTX_ALL,
        &IID_IMMDeviceEnumerator, (void **)&pEnumerator);
    if (FAILED(hr) || !pEnumerator) {
        fprintf(stderr, "Failed to create device enumerator (0x%08lx)\n", (unsigned long)hr);
        CoUninitialize();
        return 1;
    }

    IMMDeviceCollection *pCollection = NULL;
    hr = pEnumerator->lpVtbl->EnumAudioEndpoints(pEnumerator, eCapture, DEVICE_STATE_ACTIVE, &pCollection);
    if (FAILED(hr) || !pCollection) {
        fprintf(stderr, "Failed to enumerate capture devices (0x%08lx)\n", (unsigned long)hr);
        pEnumerator->lpVtbl->Release(pEnumerator);
        CoUninitialize();
        return 1;
    }

    UINT deviceCount = 0;
    pCollection->lpVtbl->GetCount(pCollection, &deviceCount);

    for (UINT i = 0; i < deviceCount; i++) {
        IMMDevice *pDevice = NULL;
        hr = pCollection->lpVtbl->Item(pCollection, i, &pDevice);
        if (SUCCEEDED(hr) && pDevice) {
            MonitorDevice(pDevice);
        }
    }

    SetConsoleCtrlHandler(ConsoleHandler, TRUE);

    HANDLE hThread = CreateThread(NULL, 0, StdinMonitorThread, NULL, 0, NULL);
    if (hThread) CloseHandle(hThread);

    printf("READY\n");
    fflush(stdout);

    MSG msg;
    while (g_running && GetMessage(&msg, NULL, 0, 0) > 0) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    pCollection->lpVtbl->Release(pCollection);
    pEnumerator->lpVtbl->Release(pEnumerator);
    CoUninitialize();
    return 0;
}
