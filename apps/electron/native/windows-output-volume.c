/**
 * Windows Output Volume
 *
 * Reads and sets the default render endpoint volume through Core Audio.
 *
 * Commands:
 *   windows-output-volume.exe get
 *   windows-output-volume.exe set <volume> [deviceId]
 *
 * Output:
 *   get -> {"deviceId":"...","volume":0.5}
 *   set -> {"volume":0.15}
 *
 * Compile with: cl /O2 windows-output-volume.c /Fe:windows-output-volume.exe ole32.lib
 * Or with MinGW: gcc -O2 windows-output-volume.c -o windows-output-volume.exe -lole32
 */

#define WIN32_LEAN_AND_MEAN
#define COBJMACROS
#define CINTERFACE

#include <windows.h>
#include <initguid.h>
#include <mmdeviceapi.h>
#include <endpointvolume.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void emit_error(const char *message) {
    fprintf(stderr, "%s\n", message);
}

static char *wide_to_utf8(LPCWSTR value) {
    if (!value) return NULL;

    int len = WideCharToMultiByte(CP_UTF8, 0, value, -1, NULL, 0, NULL, NULL);
    if (len <= 0) return NULL;

    char *out = (char *)calloc((size_t)len, sizeof(char));
    if (!out) return NULL;

    if (WideCharToMultiByte(CP_UTF8, 0, value, -1, out, len, NULL, NULL) <= 0) {
        free(out);
        return NULL;
    }

    return out;
}

static wchar_t *utf8_to_wide(const char *value) {
    if (!value || !*value) return NULL;

    int len = MultiByteToWideChar(CP_UTF8, 0, value, -1, NULL, 0);
    if (len <= 0) return NULL;

    wchar_t *out = (wchar_t *)calloc((size_t)len, sizeof(wchar_t));
    if (!out) return NULL;

    if (MultiByteToWideChar(CP_UTF8, 0, value, -1, out, len) <= 0) {
        free(out);
        return NULL;
    }

    return out;
}

static void print_json_string(const char *value) {
    putchar('"');
    if (value) {
        for (const unsigned char *p = (const unsigned char *)value; *p; p++) {
            if (*p == '"' || *p == '\\') {
                putchar('\\');
                putchar((int)*p);
            } else if (*p == '\b') {
                printf("\\b");
            } else if (*p == '\f') {
                printf("\\f");
            } else if (*p == '\n') {
                printf("\\n");
            } else if (*p == '\r') {
                printf("\\r");
            } else if (*p == '\t') {
                printf("\\t");
            } else if (*p < 0x20) {
                printf("\\u%04x", (unsigned int)*p);
            } else {
                putchar((int)*p);
            }
        }
    }
    putchar('"');
}

static HRESULT create_enumerator(IMMDeviceEnumerator **enumerator) {
    return CoCreateInstance(
        &CLSID_MMDeviceEnumerator,
        NULL,
        CLSCTX_ALL,
        &IID_IMMDeviceEnumerator,
        (void **)enumerator);
}

static HRESULT get_device(
    IMMDeviceEnumerator *enumerator,
    const wchar_t *device_id,
    IMMDevice **device)
{
    if (device_id && *device_id) {
        return IMMDeviceEnumerator_GetDevice(enumerator, device_id, device);
    }

    return IMMDeviceEnumerator_GetDefaultAudioEndpoint(
        enumerator,
        eRender,
        eMultimedia,
        device);
}

static HRESULT get_endpoint_volume(
    IMMDevice *device,
    IAudioEndpointVolume **endpoint_volume)
{
    return IMMDevice_Activate(
        device,
        &IID_IAudioEndpointVolume,
        CLSCTX_ALL,
        NULL,
        (void **)endpoint_volume);
}

static int command_get(void) {
    HRESULT hr;
    IMMDeviceEnumerator *enumerator = NULL;
    IMMDevice *device = NULL;
    IAudioEndpointVolume *endpoint_volume = NULL;
    LPWSTR wide_id = NULL;
    char *device_id = NULL;
    float volume = 0.0f;
    int exit_code = 1;

    hr = create_enumerator(&enumerator);
    if (FAILED(hr) || !enumerator) {
        emit_error("failed to create audio device enumerator");
        goto cleanup;
    }

    hr = get_device(enumerator, NULL, &device);
    if (FAILED(hr) || !device) {
        emit_error("failed to get default audio render endpoint");
        goto cleanup;
    }

    hr = get_endpoint_volume(device, &endpoint_volume);
    if (FAILED(hr) || !endpoint_volume) {
        emit_error("failed to activate endpoint volume");
        goto cleanup;
    }

    hr = IAudioEndpointVolume_GetMasterVolumeLevelScalar(endpoint_volume, &volume);
    if (FAILED(hr)) {
        emit_error("failed to read endpoint volume");
        goto cleanup;
    }

    hr = IMMDevice_GetId(device, &wide_id);
    if (FAILED(hr) || !wide_id) {
        emit_error("failed to read endpoint device id");
        goto cleanup;
    }

    device_id = wide_to_utf8(wide_id);
    if (!device_id) {
        emit_error("failed to encode endpoint device id");
        goto cleanup;
    }

    printf("{\"deviceId\":");
    print_json_string(device_id);
    printf(",\"volume\":%.6f}\n", (double)volume);
    exit_code = 0;

cleanup:
    if (device_id) free(device_id);
    if (wide_id) CoTaskMemFree(wide_id);
    if (endpoint_volume) IAudioEndpointVolume_Release(endpoint_volume);
    if (device) IMMDevice_Release(device);
    if (enumerator) IMMDeviceEnumerator_Release(enumerator);
    return exit_code;
}

static int command_set(const char *volume_arg, const char *device_id_arg) {
    HRESULT hr;
    IMMDeviceEnumerator *enumerator = NULL;
    IMMDevice *device = NULL;
    IAudioEndpointVolume *endpoint_volume = NULL;
    wchar_t *wide_device_id = NULL;
    char *endptr = NULL;
    double parsed = strtod(volume_arg, &endptr);
    float volume;
    int exit_code = 1;

    if (
        !volume_arg ||
        endptr == volume_arg ||
        *endptr != '\0' ||
        !(parsed >= 0.0 && parsed <= 1.0))
    {
        emit_error("volume must be a number between 0 and 1");
        return 1;
    }

    volume = (float)parsed;
    wide_device_id = utf8_to_wide(device_id_arg);

    hr = create_enumerator(&enumerator);
    if (FAILED(hr) || !enumerator) {
        emit_error("failed to create audio device enumerator");
        goto cleanup;
    }

    hr = get_device(enumerator, wide_device_id, &device);
    if (FAILED(hr) || !device) {
        emit_error("failed to get audio render endpoint");
        goto cleanup;
    }

    hr = get_endpoint_volume(device, &endpoint_volume);
    if (FAILED(hr) || !endpoint_volume) {
        emit_error("failed to activate endpoint volume");
        goto cleanup;
    }

    hr = IAudioEndpointVolume_SetMasterVolumeLevelScalar(endpoint_volume, volume, NULL);
    if (FAILED(hr)) {
        emit_error("failed to set endpoint volume");
        goto cleanup;
    }

    printf("{\"volume\":%.6f}\n", (double)volume);
    exit_code = 0;

cleanup:
    if (wide_device_id) free(wide_device_id);
    if (endpoint_volume) IAudioEndpointVolume_Release(endpoint_volume);
    if (device) IMMDevice_Release(device);
    if (enumerator) IMMDeviceEnumerator_Release(enumerator);
    return exit_code;
}

int main(int argc, char *argv[]) {
    HRESULT hr = CoInitializeEx(NULL, COINIT_MULTITHREADED);
    int exit_code;

    if (FAILED(hr)) {
        emit_error("failed to initialize COM");
        return 1;
    }

    if (argc == 2 && strcmp(argv[1], "get") == 0) {
        exit_code = command_get();
    } else if ((argc == 3 || argc == 4) && strcmp(argv[1], "set") == 0) {
        exit_code = command_set(argv[2], argc == 4 ? argv[3] : NULL);
    } else {
        emit_error("usage: windows-output-volume get | set <volume> [deviceId]");
        exit_code = 1;
    }

    CoUninitialize();
    return exit_code;
}
