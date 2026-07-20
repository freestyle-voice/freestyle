import { zValidator } from "@hono/zod-validator";
import { OutputMode, PipelineStage } from "freestyle-voice";
import { Hono } from "hono";
import { z } from "zod";
import { plugins } from "../lib/plugins/index.js";

/**
 * Relay pipeline events that originate in the Electron main process
 * (recording start/commit/cancel, output delivered, output-stage errors) into
 * the server's single `event` hook sink, so every plugin observer sees every
 * event exactly once regardless of which process it happened in. Mirrors the
 * existing `POST /api/telemetry` relay pattern.
 *
 * The schema is a discriminated union matching the SDK's `FreestyleEvent`, so
 * the relayed payload is validated (and correctly typed) rather than cast.
 */
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("recordingStarted") }),
  z.object({ type: z.literal("recordingCommitted") }),
  z.object({ type: z.literal("recordingCancelled") }),
  z.object({
    type: z.literal("outputDelivered"),
    text: z.string(),
    mode: z.enum([OutputMode.Paste, OutputMode.Clipboard, OutputMode.None]),
  }),
  z.object({
    type: z.literal("pipelineError"),
    stage: z.enum([
      PipelineStage.Capture,
      PipelineStage.Transcribe,
      PipelineStage.Cleanup,
      PipelineStage.Transform,
      PipelineStage.Output,
    ]),
    message: z.string(),
  }),
]);

const eventsRoute = new Hono().post(
  "/",
  zValidator("json", eventSchema),
  (c) => {
    void plugins().emit(c.req.valid("json"));
    return c.json({ ok: true });
  },
);

export default eventsRoute;
