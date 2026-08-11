/**
 * Linux X11 focused-window bounds helper
 *
 * Reads EWMH _NET_ACTIVE_WINDOW and prints root-relative client geometry:
 *   {"x": n, "y": n, "width": n, "height": n, "pid": n}
 *
 * Usage: linux-window-bounds [excludePid]
 * Exit codes: 0 success; 1 invalid arguments; 3 unavailable/own window.
 */

#include <X11/Xatom.h>
#include <X11/Xlib.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>

static int read_cardinal_property(Display *display, Window window, Atom property,
                                  unsigned long *value) {
    Atom actual_type;
    int actual_format;
    unsigned long items;
    unsigned long bytes_after;
    unsigned char *data = NULL;
    int status = XGetWindowProperty(display, window, property, 0, 1, False,
                                    XA_CARDINAL, &actual_type, &actual_format,
                                    &items, &bytes_after, &data);
    if (status != Success || actual_type != XA_CARDINAL || actual_format != 32 ||
        items != 1 || data == NULL) {
        if (data != NULL) XFree(data);
        return 0;
    }
    *value = *(unsigned long *)data;
    XFree(data);
    return 1;
}

int main(int argc, char *argv[]) {
    unsigned long exclude_pid = 0;
    if (argc > 2) return 1;
    if (argc == 2) {
        char *end = NULL;
        exclude_pid = strtoul(argv[1], &end, 10);
        if (*argv[1] == '\0' || *end != '\0' || exclude_pid == 0) return 1;
    }

    Display *display = XOpenDisplay(NULL);
    if (display == NULL) return 3;
    Window root = DefaultRootWindow(display);
    Atom active_atom = XInternAtom(display, "_NET_ACTIVE_WINDOW", True);
    if (active_atom == None) {
        XCloseDisplay(display);
        return 3;
    }

    Atom actual_type;
    int actual_format;
    unsigned long items;
    unsigned long bytes_after;
    unsigned char *data = NULL;
    int status = XGetWindowProperty(display, root, active_atom, 0, 1, False,
                                    XA_WINDOW, &actual_type, &actual_format,
                                    &items, &bytes_after, &data);
    if (status != Success || actual_type != XA_WINDOW || actual_format != 32 ||
        items != 1 || data == NULL) {
        if (data != NULL) XFree(data);
        XCloseDisplay(display);
        return 3;
    }
    Window window = *(Window *)data;
    XFree(data);

    Atom pid_atom = XInternAtom(display, "_NET_WM_PID", True);
    unsigned long pid = 0;
    if (pid_atom != None) read_cardinal_property(display, window, pid_atom, &pid);
    /* Without _NET_WM_PID we cannot prove the active window is external.
     * Fail closed so Freestyle never anchors to one of its own windows. */
    if (pid == 0 || pid == exclude_pid) {
        XCloseDisplay(display);
        return 3;
    }

    XWindowAttributes attributes;
    if (!XGetWindowAttributes(display, window, &attributes) ||
        attributes.width <= 0 || attributes.height <= 0) {
        XCloseDisplay(display);
        return 3;
    }
    int x = 0;
    int y = 0;
    Window child;
    if (!XTranslateCoordinates(display, window, root, 0, 0, &x, &y, &child)) {
        XCloseDisplay(display);
        return 3;
    }

    printf(
        "{\"x\": %d, \"y\": %d, \"width\": %d, \"height\": %d, \"pid\": %lu}\n",
        x, y, attributes.width, attributes.height, pid
    );
    XCloseDisplay(display);
    return 0;
}
