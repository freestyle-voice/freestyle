import { createAppLogger } from "@freestyle-voice/utils";
import type { FreestyleEvent } from "freestyle-voice";

const log = createAppLogger("plugins");

/**
 * Relay a pipeline event that originated in this (Electron main) process to
 * the server's single `event` hook sink, via `POST /api/events`. Recording and
 * output-delivery events only ever happen here, but plugin `event` hooks are
 * server-only now that the app no longer hosts a hook registry — this is the
 * one bridge between the two.
 *
 * Fire-and-forget: a plugin observer missing an event because the server was
 * briefly unreachable is not worth blocking or retrying for.
 */
export function relayEvent(baseUrl: string, event: FreestyleEvent): void {
  fetch(`${baseUrl}/api/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(3000),
  }).catch((err) => {
    log.debug(
      `event relay failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}
