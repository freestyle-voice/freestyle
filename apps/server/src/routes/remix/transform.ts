import { remixTransformSchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  FreestyleCloudAuthError,
  FreestyleCloudUsageError,
} from "../../lib/freestyle-cloud.js";
import { getLanguagesSetting } from "../../lib/language.js";
import { recordRemixRun } from "../../lib/remix-store.js";
import {
  RemixTransformError,
  reportRemixTransformFailure,
  runRemixTransform,
} from "../../lib/remix-transform.js";
import { invalidateSession } from "../../lib/sessions.js";

/**
 * Run an AI edit over a text selection and hand back the replacement.
 *
 * Deliberately outside the dictation pipeline: no plugin hooks, no dictionary
 * replacements, no transcription-history row. A remix is a direct edit the
 * user asked for on text they already had — the transformations that exist to
 * turn speech into writing have nothing to say about it. It does land in
 * remix_runs, which is what powers Revert.
 */
const remixRoute = new Hono().post(
  "/",
  zValidator("json", remixTransformSchema),
  async (c) => {
    const body = c.req.valid("json");

    try {
      const result = await runRemixTransform({
        text: body.text,
        remixId: body.remixId,
        instruction: body.instruction,
        languages: body.language ? [body.language] : getLanguagesSetting(),
      });
      let runId: number | null = null;
      try {
        runId = recordRemixRun({
          lane: "transform",
          instruction: result.instruction,
          beforeText: body.text,
          afterText: result.text,
          appName: body.appName ?? null,
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
        });
      } catch {
        // History is a convenience; the edit itself already succeeded.
      }
      return c.json({ text: result.text, runId });
    } catch (err) {
      if (err instanceof FreestyleCloudAuthError) {
        invalidateSession();
        return c.json({ error: "cloud_auth_required" }, 401);
      }
      if (err instanceof FreestyleCloudUsageError) {
        return c.json({ error: "usage_exceeded", resetsAt: err.resetsAt }, 429);
      }
      reportRemixTransformFailure(err, body.remixId);
      if (err instanceof RemixTransformError) {
        // A setup problem is the user's to fix and says so in its message; a
        // failure is ours. Both are shown verbatim in the pill's card.
        return c.json(
          { error: err.kind, detail: err.message },
          err.kind === "failed" ? 502 : 400,
        );
      }
      return c.json(
        {
          error: "failed",
          detail: err instanceof Error ? err.message : "Remix failed",
        },
        502,
      );
    }
  },
);

export default remixRoute;
