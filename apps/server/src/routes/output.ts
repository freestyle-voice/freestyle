import { zValidator } from "@hono/zod-validator";
import { OutputMode } from "freestyle-voice";
import { Hono } from "hono";
import { z } from "zod";
import { parseAppContext, plugins } from "../lib/plugins/index.js";
import { createHookApi } from "../lib/plugins/pipeline.js";

/**
 * Runs the `beforeOutput` plugin hook server-side, on the *final* text the
 * user is about to receive — after any multi-segment merge the client already
 * performed via `POST /api/post-process`. The client calls this once, right
 * before delivering (pasting/copying), for both single- and multi-chunk
 * dictations, and executes exactly what comes back.
 *
 * This is the one pipeline stage that can't be folded into `/api/transcribe`
 * itself: for multi-segment recordings the final text is only known after the
 * client combines multiple `/api/transcribe` results, so `beforeOutput` needs
 * its own endpoint that runs on that combined text.
 */
const deliverSchema = z.object({
  text: z.string(),
  mode: z.enum([OutputMode.Paste, OutputMode.Clipboard]),
  appContext: z.string().nullish(),
});

const outputRoute = new Hono().post(
  "/deliver",
  zValidator("json", deliverSchema),
  async (c) => {
    const { text, mode, appContext } = c.req.valid("json");
    const api = await createHookApi();
    const parsedContext = parseAppContext(appContext ?? undefined);

    const out = await plugins().run(
      "beforeOutput",
      { ...(parsedContext ? { appContext: parsedContext } : {}) },
      { text, mode },
      api,
    );

    const suppressed = out.mode === OutputMode.None || !out.text?.trim();
    const disposition = !suppressed
      ? "deliver"
      : api.control.state === "aborted"
        ? "aborted"
        : "suppressed";

    return c.json({
      output: { text: out.text, mode: suppressed ? OutputMode.None : out.mode },
      disposition,
      ...(api.control.reason ? { reason: api.control.reason } : {}),
    });
  },
);

export default outputRoute;
