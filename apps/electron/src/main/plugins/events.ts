import type { AppType } from "@freestyle-voice/server";
import { createAppLogger } from "@freestyle-voice/utils";
import type { FreestyleEvent } from "freestyle-voice";
import { hc } from "hono/client";

const log = createAppLogger("plugins");

const RELAY_TIMEOUT_MS = 3000;

/**
 * The subset of {@link FreestyleEvent}s that originate in the Electron main
 * process, and so are the only ones ever relayed to the server. `transcribed`
 * and `cleaned` fire server-side and are never relayed — the server's
 * `/api/events` route rejects them, so narrowing here keeps the `hc` payload
 * type in step with the route's schema.
 */
type RelayableEvent = Extract<
  FreestyleEvent,
  {
    type:
      | "recordingStarted"
      | "recordingCommitted"
      | "recordingCancelled"
      | "outputDelivered"
      | "pipelineError";
  }
>;

/**
 * Relay a pipeline event that originated in this (Electron main) process to
 * the server's single `event` hook sink, via `POST /api/events`. Recording and
 * output-delivery events only ever happen here, but plugin `event` hooks are
 * server-only now that the app no longer hosts a hook registry — this is the
 * one bridge between the two.
 *
 * Uses the typed `hc` client so the payload is checked against the server's
 * `/api/events` route (matching `putServerSetting` in the main entry).
 *
 * Fire-and-forget: a plugin observer missing an event because the server was
 * briefly unreachable is not worth blocking or retrying for.
 */
export function relayEvent(
  baseUrl: string,
  event: RelayableEvent,
  headers: Record<string, string> = {},
): void {
  hc<AppType>(baseUrl, { headers })
    .api.events.$post(
      { json: event },
      { init: { signal: AbortSignal.timeout(RELAY_TIMEOUT_MS) } },
    )
    .catch((err) => {
      log.debug(
        `event relay failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}
