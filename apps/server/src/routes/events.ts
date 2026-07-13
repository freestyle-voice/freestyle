import { zValidator } from "@hono/zod-validator";
import type { FreestyleEvent } from "freestyle-voice";
import { Hono } from "hono";
import { z } from "zod";
import { plugins } from "../lib/plugins/index.js";

/**
 * Relay pipeline events that originate in the Electron main process
 * (recording start/commit/cancel, output delivered) into the server's single
 * `event` hook sink, so every plugin observer sees every event exactly once
 * regardless of which process it happened in. Mirrors the existing
 * `POST /api/telemetry` relay pattern.
 */
const eventSchema = z.object({
  type: z.enum([
    "recordingStarted",
    "recordingCommitted",
    "recordingCancelled",
    "outputDelivered",
  ]),
  text: z.string().optional(),
  mode: z.string().optional(),
});

const eventsRoute = new Hono().post(
  "/",
  zValidator("json", eventSchema),
  (c) => {
    const event = c.req.valid("json");
    void plugins().emit(event as FreestyleEvent);
    return c.json({ ok: true });
  },
);

export default eventsRoute;
