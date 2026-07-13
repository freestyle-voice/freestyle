import { postProcessSchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  FreestyleCloudAuthError,
  FreestyleCloudUsageError,
} from "../lib/freestyle-cloud.js";
import { getLanguageSetting } from "../lib/language.js";
import { createHookApi } from "../lib/plugins/pipeline.js";
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

    return c.json({
      cleaned: pp.cleaned,
      inputTokens: pp.inputTokens,
      outputTokens: pp.outputTokens,
      costUsd: pp.costUsd,
    });
  },
);

export default postProcessRoute;
