/*
 * Linux microphone activity listener.
 *
 * Monitors PulseAudio/PipeWire source-outputs (apps recording audio) and emits:
 *   MIC_ACTIVE   when at least one source-output exists
 *   MIC_INACTIVE when no source-outputs remain
 *
 * It watches `pactl subscribe` for source-output new/remove events, then re-checks
 * the actual count with `pactl list source-outputs` to avoid false positives from
 * our own process or transient events.
 */

#define _GNU_SOURCE
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#define CHECK_INTERVAL_US 500000

static int count_source_outputs(void) {
    FILE *fp = popen("pactl list source-outputs 2>/dev/null", "r");
    if (!fp) return 0;

    int count = 0;
    char line[1024];
    while (fgets(line, sizeof(line), fp)) {
        if (strncmp(line, "Source Output #", 15) == 0) {
            count++;
        }
    }
    pclose(fp);
    return count;
}

static void emit(const char *state) {
    printf("%s\n", state);
    fflush(stdout);
}

int main(void) {
    FILE *fp = popen("pactl subscribe 2>/dev/null", "r");
    if (!fp) {
        fprintf(stderr, "failed to run pactl subscribe\n");
        return 1;
    }

    int active = count_source_outputs() > 0;
    emit(active ? "MIC_ACTIVE" : "MIC_INACTIVE");

    char line[1024];
    while (fgets(line, sizeof(line), fp)) {
        if (strstr(line, "source-output") == NULL) continue;

        /* Debounce: wait a moment for state to settle, then recount. */
        usleep(50000);
        int now_active = count_source_outputs() > 0;
        if (now_active != active) {
            active = now_active;
            emit(active ? "MIC_ACTIVE" : "MIC_INACTIVE");
        }
    }

    pclose(fp);
    return 0;
}
