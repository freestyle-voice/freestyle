/**
 * Linux Key Listener for Push-to-Talk
 *
 * Monitors /dev/input event devices for global key events on both X11
 * and Wayland. Parses compound hotkeys from CLI args.
 * Outputs "KEY_DOWN" and "KEY_UP" to stdout.
 *
 * Requires read access to /dev/input/event* (typically via input group).
 *
 * Compile: gcc -O2 linux-key-listener.c -o linux-key-listener
 *
 * Usage: linux-key-listener <hotkey>
 *   e.g.: linux-key-listener "Alt+Space"
 *         linux-key-listener "F8"
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <unistd.h>
#include <fcntl.h>
#include <dirent.h>
#include <poll.h>
#include <signal.h>
#include <sys/ioctl.h>
#include <linux/input.h>
#include <errno.h>

#define MAX_DEVICES 32

static volatile int g_running = 1;
static int g_isKeyDown = 0;

/* Parsed hotkey */
static int g_targetKey = 0;
static int g_requireCtrl = 0;
static int g_requireAlt = 0;
static int g_requireShift = 0;
static int g_requireMeta = 0;
static int g_modifiersOnly = 0;
static int g_record_mode = 0;

/* Tracked modifier state */
static int g_ctrlDown = 0;
static int g_altDown = 0;
static int g_shiftDown = 0;
static int g_metaDown = 0;

static int is_ctrl(int code) {
    return code == KEY_LEFTCTRL || code == KEY_RIGHTCTRL;
}
static int is_alt(int code) {
    return code == KEY_LEFTALT || code == KEY_RIGHTALT;
}
static int is_shift(int code) {
    return code == KEY_LEFTSHIFT || code == KEY_RIGHTSHIFT;
}
static int is_meta(int code) {
    return code == KEY_LEFTMETA || code == KEY_RIGHTMETA;
}

static void update_modifier(int code, int pressed) {
    if (is_ctrl(code)) g_ctrlDown = pressed;
    if (is_alt(code)) g_altDown = pressed;
    if (is_shift(code)) g_shiftDown = pressed;
    if (is_meta(code)) g_metaDown = pressed;
}

static int modifiers_satisfied(void) {
    if (g_requireCtrl && !g_ctrlDown) return 0;
    if (g_requireAlt && !g_altDown) return 0;
    if (g_requireShift && !g_shiftDown) return 0;
    if (g_requireMeta && !g_metaDown) return 0;
    return 1;
}

static int parse_key_name(const char *name) {
    if (strcasecmp(name, "Space") == 0) return KEY_SPACE;
    if (strcasecmp(name, "Tab") == 0) return KEY_TAB;
    if (strcasecmp(name, "Escape") == 0 || strcasecmp(name, "Esc") == 0) return KEY_ESC;
    if (strcasecmp(name, "Enter") == 0 || strcasecmp(name, "Return") == 0) return KEY_ENTER;
    if (strcasecmp(name, "Backspace") == 0) return KEY_BACKSPACE;
    if (strcasecmp(name, "Delete") == 0) return KEY_DELETE;
    if (strcasecmp(name, "Up") == 0) return KEY_UP;
    if (strcasecmp(name, "Down") == 0) return KEY_DOWN;
    if (strcasecmp(name, "Left") == 0) return KEY_LEFT;
    if (strcasecmp(name, "Right") == 0) return KEY_RIGHT;
    if (strcasecmp(name, "Home") == 0) return KEY_HOME;
    if (strcasecmp(name, "End") == 0) return KEY_END;
    if (strcasecmp(name, "PageUp") == 0) return KEY_PAGEUP;
    if (strcasecmp(name, "PageDown") == 0) return KEY_PAGEDOWN;
    if (strcasecmp(name, "CapsLock") == 0) return KEY_CAPSLOCK;
    if (strcasecmp(name, "Pause") == 0) return KEY_PAUSE;
    if (strcasecmp(name, "Insert") == 0) return KEY_INSERT;
    if (strcasecmp(name, "MouseButton4") == 0 || strcasecmp(name, "Mouse4") == 0) return BTN_SIDE;
    if (strcasecmp(name, "MouseButton5") == 0 || strcasecmp(name, "Mouse5") == 0) return BTN_EXTRA;

    /* Function keys */
    if (name[0] == 'F' || name[0] == 'f') {
        int n = atoi(name + 1);
        if (n >= 1 && n <= 12) return KEY_F1 + (n - 1);
        if (n >= 13 && n <= 24) return KEY_F13 + (n - 13);
    }

    /* Backtick */
    if (strcmp(name, "`") == 0 || strcasecmp(name, "Backquote") == 0) return KEY_GRAVE;

    /* Single letter/digit */
    if (strlen(name) == 1) {
        char c = name[0];
        if (c >= 'a' && c <= 'z') return KEY_A + (c - 'a');
        if (c >= 'A' && c <= 'Z') return KEY_A + (c - 'A');
        if (c >= '0' && c <= '9') return KEY_0 + (c - '0');
        /* Punctuation */
        switch (c) {
            case '-': return KEY_MINUS;
            case '=': return KEY_EQUAL;
            case '[': return KEY_LEFTBRACE;
            case ']': return KEY_RIGHTBRACE;
            case '\\': return KEY_BACKSLASH;
            case ';': return KEY_SEMICOLON;
            case '\'': return KEY_APOSTROPHE;
            case ',': return KEY_COMMA;
            case '.': return KEY_DOT;
            case '/': return KEY_SLASH;
        }
    }

    return 0;
}

static void parse_hotkey(const char *hotkey) {
    char buf[256];
    strncpy(buf, hotkey, sizeof(buf) - 1);
    buf[sizeof(buf) - 1] = '\0';

    char *token = strtok(buf, "+");
    while (token) {
        /* Trim */
        while (*token == ' ') token++;
        char *end = token + strlen(token) - 1;
        while (end > token && *end == ' ') *end-- = '\0';

        if (strcasecmp(token, "CommandOrControl") == 0 ||
            strcasecmp(token, "Control") == 0 ||
            strcasecmp(token, "Ctrl") == 0 ||
            strcasecmp(token, "CmdOrCtrl") == 0) {
            g_requireCtrl = 1;
        } else if (strcasecmp(token, "Alt") == 0 ||
                   strcasecmp(token, "Option") == 0) {
            g_requireAlt = 1;
        } else if (strcasecmp(token, "Shift") == 0) {
            g_requireShift = 1;
        } else if (strcasecmp(token, "Super") == 0 ||
                   strcasecmp(token, "Meta") == 0 ||
                   strcasecmp(token, "Command") == 0 ||
                   strcasecmp(token, "Cmd") == 0) {
            g_requireMeta = 1;
        } else {
            g_targetKey = parse_key_name(token);
        }

        token = strtok(NULL, "+");
    }

    if (g_targetKey == 0 && (g_requireCtrl || g_requireAlt || g_requireShift || g_requireMeta)) {
        g_modifiersOnly = 1;
    }
}

static int open_input_devices(int *fds, int max_fds) {
    DIR *dir = opendir("/dev/input");
    if (!dir) return 0;

    int count = 0;
    struct dirent *ent;
    while ((ent = readdir(dir)) && count < max_fds) {
        if (strncmp(ent->d_name, "event", 5) != 0) continue;

        char path[256];
        snprintf(path, sizeof(path), "/dev/input/%s", ent->d_name);

        int fd = open(path, O_RDONLY | O_NONBLOCK);
        if (fd < 0) continue;

        /* Check if device has keyboard capability */
        unsigned long evbits[1] = {0};
        if (ioctl(fd, EVIOCGBIT(0, sizeof(evbits)), evbits) >= 0) {
            if (evbits[0] & (1UL << EV_KEY)) {
                fds[count++] = fd;
                continue;
            }
        }
        close(fd);
    }
    closedir(dir);
    return count;
}

static void handle_signal(int sig) {
    (void)sig;
    g_running = 0;
}

static void emit_record_modifiers(void) {
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
    if (g_metaDown) {
        len += snprintf(buf + len, sizeof(buf) - len, "%sSuper", len ? "," : "");
    }

    printf("RECORD_MODIFIERS:%s\n", buf);
    fflush(stdout);
}

static const char *keycode_to_record_name(int code) {
    if (code == KEY_SPACE) return "Space";
    if (code == KEY_TAB) return "Tab";
    if (code == KEY_ESC) return "Escape";
    if (code == KEY_ENTER) return "Return";
    if (code == KEY_BACKSPACE) return "Backspace";
    if (code == KEY_DELETE) return "Delete";
    if (code == KEY_UP) return "Up";
    if (code == KEY_DOWN) return "Down";
    if (code == KEY_LEFT) return "Left";
    if (code == KEY_RIGHT) return "Right";
    if (code == KEY_HOME) return "Home";
    if (code == KEY_END) return "End";
    if (code == KEY_PAGEUP) return "PageUp";
    if (code == KEY_PAGEDOWN) return "PageDown";
    if (code == KEY_CAPSLOCK) return "CapsLock";
    if (code == KEY_PAUSE) return "Pause";
    if (code == KEY_INSERT) return "Insert";
    if (code == BTN_SIDE) return "MouseButton4";
    if (code == BTN_EXTRA) return "MouseButton5";
    if (code == KEY_RIGHTALT) return "RightAlt";
    if (code == KEY_RIGHTCTRL) return "RightControl";
    if (code == KEY_RIGHTSHIFT) return "RightShift";
    if (code == KEY_RIGHTMETA) return "RightSuper";
    if (code >= KEY_F1 && code <= KEY_F12) {
        static char fkey[8];
        snprintf(fkey, sizeof(fkey), "F%d", code - KEY_F1 + 1);
        return fkey;
    }
    if (code >= KEY_F13 && code <= KEY_F24) {
        static char fkey[8];
        snprintf(fkey, sizeof(fkey), "F%d", code - KEY_F13 + 13);
        return fkey;
    }
    if (code >= KEY_A && code <= KEY_Z) {
        static char letter[2];
        letter[0] = 'A' + (code - KEY_A);
        letter[1] = '\0';
        return letter;
    }
    if (code >= KEY_0 && code <= KEY_9) {
        static char digit[2];
        digit[0] = '0' + (code - KEY_0);
        digit[1] = '\0';
        return digit;
    }
    return NULL;
}

static void handle_record_event(int code, int pressed) {
    int is_mod = is_ctrl(code) || is_alt(code) || is_shift(code) || is_meta(code);

    if (!pressed) {
        if (is_mod) {
            update_modifier(code, 0);
        }
        printf("RECORD_RELEASE\n");
        fflush(stdout);
        return;
    }

    if (code == KEY_ESC) {
        printf("RECORD_CANCEL\n");
        fflush(stdout);
        return;
    }

    if (is_mod) {
        update_modifier(code, 1);
        if (code == KEY_RIGHTALT || code == KEY_RIGHTCTRL ||
            code == KEY_RIGHTSHIFT || code == KEY_RIGHTMETA) {
            const char *keyName = keycode_to_record_name(code);
            if (keyName) {
                printf("RECORD_KEY:%s\n", keyName);
                fflush(stdout);
            }
            return;
        }
        emit_record_modifiers();
        return;
    }

    const char *keyName = keycode_to_record_name(code);
    if (keyName) {
        emit_record_modifiers();
        printf("RECORD_KEY:%s\n", keyName);
        fflush(stdout);
    }
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(stderr, "Usage: %s <hotkey> | %s --record\n", argv[0], argv[0]);
        fprintf(stderr, "Examples: %s \"Alt+Space\"  |  %s F8  |  %s --record\n",
                argv[0], argv[0], argv[0]);
        return 1;
    }

    if (strcasecmp(argv[1], "--record") == 0) {
        g_record_mode = 1;
        fprintf(stderr, "Hotkey recording mode\n");
    } else {
        parse_hotkey(argv[1]);

        if (g_targetKey == 0 && !g_modifiersOnly) {
            fprintf(stderr, "Error: Invalid hotkey '%s'\n", argv[1]);
            return 1;
        }
    }

    signal(SIGTERM, handle_signal);
    signal(SIGINT, handle_signal);

    int fds[MAX_DEVICES];
    int nfds = open_input_devices(fds, MAX_DEVICES);
    if (nfds == 0) {
        fprintf(stderr, "Error: No accessible input devices in /dev/input/\n");
        fprintf(stderr, "Hint: Add your user to the 'input' group: sudo usermod -aG input $USER\n");
        return 1;
    }

    /* Also monitor stdin for parent death */
    struct pollfd pollfds[MAX_DEVICES + 1];
    for (int i = 0; i < nfds; i++) {
        pollfds[i].fd = fds[i];
        pollfds[i].events = POLLIN;
    }
    pollfds[nfds].fd = STDIN_FILENO;
    pollfds[nfds].events = POLLIN | POLLHUP;

    if (!g_record_mode) {
        fprintf(stderr, "Listening for: %s (key=%d, Ctrl=%d, Alt=%d, Shift=%d, Meta=%d, ModOnly=%d) on %d device(s)\n",
                argv[1], g_targetKey, g_requireCtrl, g_requireAlt, g_requireShift, g_requireMeta, g_modifiersOnly, nfds);
    } else {
        fprintf(stderr, "Recording hotkeys on %d device(s)\n", nfds);
    }

    printf("READY\n");
    fflush(stdout);

    while (g_running) {
        int ret = poll(pollfds, nfds + 1, 1000);
        if (ret < 0) {
            if (errno == EINTR) continue;
            break;
        }
        if (ret == 0) continue;

        /* Check stdin for parent death */
        if (pollfds[nfds].revents & (POLLHUP | POLLERR)) {
            break;
        }

        for (int i = 0; i < nfds; i++) {
            if (!(pollfds[i].revents & POLLIN)) continue;

            struct input_event ev;
            while (read(fds[i], &ev, sizeof(ev)) == sizeof(ev)) {
                if (ev.type != EV_KEY) continue;
                int pressed = (ev.value == 1); /* 1=press, 0=release, 2=repeat */
                int released = (ev.value == 0);

                if (!pressed && !released) continue; /* skip autorepeat */

                int code = ev.code;

                if (g_record_mode) {
                    handle_record_event(code, pressed);
                    continue;
                }

                int is_mod = is_ctrl(code) || is_alt(code) || is_shift(code) || is_meta(code);

                if (is_mod) {
                    update_modifier(code, pressed);
                }

                /* Modifier released while active -- cancel */
                if (g_isKeyDown && released && is_mod && !modifiers_satisfied()) {
                    g_isKeyDown = 0;
                    printf("KEY_UP\n");
                    fflush(stdout);
                }

                if (g_modifiersOnly) {
                    if (pressed && !g_isKeyDown && modifiers_satisfied()) {
                        g_isKeyDown = 1;
                        printf("KEY_DOWN\n");
                        fflush(stdout);
                    } else if (released && g_isKeyDown && !modifiers_satisfied()) {
                        g_isKeyDown = 0;
                        printf("KEY_UP\n");
                        fflush(stdout);
                    }
                } else if (code == g_targetKey) {
                    if (pressed && !g_isKeyDown && modifiers_satisfied()) {
                        g_isKeyDown = 1;
                        printf("KEY_DOWN\n");
                        fflush(stdout);
                    } else if (released && g_isKeyDown) {
                        g_isKeyDown = 0;
                        printf("KEY_UP\n");
                        fflush(stdout);
                    }
                }
            }
        }
    }

    for (int i = 0; i < nfds; i++) close(fds[i]);
    return 0;
}
