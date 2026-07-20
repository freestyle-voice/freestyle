import { postProcessSchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  FreestyleCloudAuthError,
  FreestyleCloudUsageError,
} from "../lib/freestyle-cloud.js";
import { getLanguageSetting } from "../lib/language.js";
import { PipelineStage } from "../lib/plugins/index.js";
import {
  createHookApi,
  dispositionFromControl,
  emitAbortEvent,
} from "../lib/plugins/pipeline.js";
import { postProcess } from "../lib/post-process.js";
import { invalidateSession } from "../lib/sessions.js";

const postProcessRoute = new Hono().post(
  "/",
  zValidator("json", postProcessSchema),
  async (c) => {
    const body = c.req.valid("json");

    const appContext: string | null = body.appContext ?? null;
    const language = body.language ?? getLanguageSetting();
    const api = await createHookApi();

    let pp: Awaited<ReturnType<typeof postProcess>>;
    try {
      pp = await postProcess(body.text, appContext, {
        language,
        source: "multi_segment",
        api,
      });
    } catch (err) {
      if (err instanceof FreestyleCloudAuthError) {
        invalidateSession();
        return c.json({ error: "cloud_auth_required" }, 401);
      }
      if (err instanceof FreestyleCloudUsageError) {
        return c.json({ error: "usage_exceeded", resetsAt: err.resetsAt }, 429);
      }
      throw err;
    }

    // `beforeCleanup`/`afterCleanup` can consume/abort during the multi-segment
    // merge too; surface the disposition (blanking the text when terminal) and
    // emit the abort event, so the renderer suppresses delivery just like the
    // single-segment `/transcribe` path.
    const suppressed = api.control.state !== "running";
    emitAbortEvent(api, PipelineStage.Cleanup);
    return c.json({
      cleaned: suppressed ? "" : pp.cleaned,
      inputTokens: pp.inputTokens,
      outputTokens: pp.outputTokens,
      costUsd: pp.costUsd,
      disposition: dispositionFromControl(api.control.state),
      ...(api.control.reason ? { reason: api.control.reason } : {}),
    });
  },
);

export default postProcessRoute;
