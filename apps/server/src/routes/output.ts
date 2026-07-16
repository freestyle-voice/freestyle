import { zValidator } from "@hono/zod-validator";
import { FreestyleEventType, OutputMode, PipelineStage } from "freestyle-voice";
import { Hono } from "hono";
import { z } from "zod";
import { parseAppContext, plugins } from "../lib/plugins/index.js";
import {
  createOutputHookApi,
  dispositionFromControl,
} from "../lib/plugins/pipeline.js";

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

const outputRoute = new Hono()
  // Whether any loaded plugin implements `beforeOutput`. The client uses this to
  // decide its fail-closed policy: if a suppression-capable hook exists, a
  // failed `/deliver` call must NOT fall back to pasting the raw text (that
  // would bypass a redaction/PII plugin). When no hook exists, delivery can
  // safely proceed on a transient server error.
  .get("/hook", (c) => c.json({ present: plugins().has("beforeOutput") }))
  .post("/deliver", zValidator("json", deliverSchema), async (c) => {
    const { text, mode, appContext } = c.req.valid("json");
    // `beforeOutput` never receives the LLM capability (SDK contract), so skip
    // resolving a chat model for this stage.
    const api = createOutputHookApi();
    const parsedContext = parseAppContext(appContext ?? undefined);

    const out = await plugins().run(
      "beforeOutput",
      { ...(parsedContext ? { appContext: parsedContext } : {}) },
      { text, mode },
      api,
    );

    // A plugin may suppress delivery either explicitly via
    // `api.control.consume()`/`abort()` (the control state is authoritative,
    // even when it left `text`/`mode` untouched) or implicitly by setting mode
    // "none"/emptying the text. Explicit terminal state wins so an `abort()` is
    // reported as aborted rather than a plain suppression.
    const disposition =
      api.control.state !== "running"
        ? dispositionFromControl(api.control.state)
        : out.mode === OutputMode.None || !out.text?.trim()
          ? "suppressed"
          : "deliver";
    const suppressed = disposition !== "deliver";

    // Emit the terminal event server-side for the paths Electron never reaches:
    // when we suppress, the renderer skips paste/copy, so `deliverOutput` won't
    // emit `outputDelivered`. (On the deliver path Electron emits it after the
    // paste actually lands, so we don't emit here to avoid a duplicate.)
    if (disposition === "aborted") {
      void plugins().emit({
        type: FreestyleEventType.PipelineError,
        stage: PipelineStage.Output,
        message: api.control.reason ?? "aborted",
      });
    } else if (disposition === "suppressed") {
      void plugins().emit({
        type: FreestyleEventType.OutputDelivered,
        text: out.text,
        mode: OutputMode.None,
      });
    }

    return c.json({
      output: { text: out.text, mode: suppressed ? OutputMode.None : out.mode },
      disposition,
      ...(api.control.reason ? { reason: api.control.reason } : {}),
    });
  });

export default outputRoute;
